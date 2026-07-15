import type { ProblemDetail, ProblemListResponse, ProblemSummary, SolveDifficulty, Stats } from './types';
import { loadIndex, loadProblemFile, resolveProblemId, type IndexEntry } from './dataStore';
import {
  getAllProgress,
  getProgress,
  getSavedCode,
  saveCode as saveCodeRemote,
  saveProgress as saveProgressRemote,
  getSolutionHistory,
  saveSolutionSnapshot,
  deleteSolutionSnapshot,
  getCustomTestCases,
  addCustomTestCase as addCustomTestCaseRemote,
  updateCustomTestCase as updateCustomTestCaseRemote,
  removeCustomTestCase,
  type SolutionHistoryEntry,
  type CustomTestCase,
} from './userProgress';

export type { SolutionHistoryEntry, CustomTestCase };

export interface ListParams {
  search?: string;
  difficulty?: string;
  topic?: string;
  status?: '' | 'solved' | 'unsolved' | 'starred';
  page?: number;
  pageSize?: number;
  sort?: string;
  sortDir?: 'asc' | 'desc';
}

function toSummary(
  p: IndexEntry,
  progress: { solved: boolean; starred: boolean; solvedAt: string | null; solveDifficulty: SolveDifficulty }
): ProblemSummary {
  return {
    problem_id: p.problem_id,
    frontend_id: p.frontend_id,
    title: p.title,
    slug: p.slug,
    difficulty: p.difficulty,
    topics: p.topics,
    solved: progress.solved,
    starred: progress.starred,
    solvedAt: progress.solvedAt,
    solveDifficulty: progress.solveDifficulty,
  };
}

export async function fetchProblems(params: ListParams): Promise<ProblemListResponse> {
  const [index, progressMap] = await Promise.all([loadIndex(), getAllProgress()]);

  let items = index.map((p) =>
    toSummary(
      p,
      progressMap.get(p.problem_id) ?? { solved: false, starred: false, solvedAt: null, solveDifficulty: null }
    )
  );

  const search = params.search?.trim().toLowerCase();
  if (search) {
    items = items.filter((p) => p.title.toLowerCase().includes(search) || p.frontend_id.includes(search));
  }
  if (params.difficulty) {
    items = items.filter((p) => p.difficulty === params.difficulty);
  }
  if (params.topic) {
    items = items.filter((p) => p.topics.includes(params.topic!));
  }
  if (params.status === 'solved') items = items.filter((p) => p.solved);
  if (params.status === 'unsolved') items = items.filter((p) => !p.solved);
  if (params.status === 'starred') items = items.filter((p) => p.starred);

  const sort = params.sort || 'frontend_id';
  const dir = params.sortDir === 'desc' ? -1 : 1;
  items = [...items].sort((a, b) => {
    if (sort === 'title') return dir * a.title.localeCompare(b.title);
    if (sort === 'difficulty') return dir * a.difficulty.localeCompare(b.difficulty);
    if (sort === 'completed') {
      const aVal = a.solvedAt ? new Date(a.solvedAt).getTime() : null;
      const bVal = b.solvedAt ? new Date(b.solvedAt).getTime() : null;
      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;
      return dir * (aVal - bVal);
    }
    return dir * ((parseInt(a.frontend_id, 10) || 0) - (parseInt(b.frontend_id, 10) || 0));
  });

  const total = items.length;
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, params.pageSize ?? 50));
  const start = (page - 1) * pageSize;

  return { total, page, pageSize, items: items.slice(start, start + pageSize) };
}

export async function fetchProblem(id: string): Promise<ProblemDetail> {
  const problemId = await resolveProblemId(id);
  const [file, progress, savedCode] = await Promise.all([
    loadProblemFile(problemId),
    getProgress(problemId),
    getSavedCode(problemId),
  ]);
  return { ...file, progress, savedCode };
}

export async function fetchTopics(): Promise<string[]> {
  const index = await loadIndex();
  const set = new Set<string>();
  for (const p of index) for (const t of p.topics) set.add(t);
  return [...set].sort();
}

export interface CompletionEntry {
  problemId: string;
  frontendId: string;
  title: string;
  difficulty: string;
  solvedAt: string;
}

export interface CompletionHistory {
  entries: CompletionEntry[];
  /** Solved problems with no recorded solve date (marked solved before date-tracking was added). */
  untrackedSolved: number;
}

export async function fetchCompletionHistory(): Promise<CompletionHistory> {
  const [index, progressMap] = await Promise.all([loadIndex(), getAllProgress()]);
  const entries: CompletionEntry[] = [];
  let untrackedSolved = 0;

  for (const p of index) {
    const progress = progressMap.get(p.problem_id);
    if (!progress?.solved) continue;
    if (progress.solvedAt) {
      entries.push({
        problemId: p.problem_id,
        frontendId: p.frontend_id,
        title: p.title,
        difficulty: p.difficulty,
        solvedAt: progress.solvedAt,
      });
    } else {
      untrackedSolved += 1;
    }
  }

  entries.sort((a, b) => a.solvedAt.localeCompare(b.solvedAt));
  return { entries, untrackedSolved };
}

export async function fetchStats(): Promise<Stats> {
  const [index, progressMap] = await Promise.all([loadIndex(), getAllProgress()]);
  const byDifficulty = new Map<string, { difficulty: string; total: number; solved: number }>();
  let solvedTotal = 0;

  for (const p of index) {
    if (!byDifficulty.has(p.difficulty)) byDifficulty.set(p.difficulty, { difficulty: p.difficulty, total: 0, solved: 0 });
    const bucket = byDifficulty.get(p.difficulty)!;
    bucket.total += 1;
    if (progressMap.get(p.problem_id)?.solved) {
      bucket.solved += 1;
      solvedTotal += 1;
    }
  }

  return { total: index.length, solvedTotal, byDifficulty: [...byDifficulty.values()] };
}

export async function saveCode(id: string, language: string, code: string): Promise<void> {
  const problemId = await resolveProblemId(id);
  await saveCodeRemote(problemId, language, code);
}

export async function saveProgress(
  id: string,
  patch: { solved?: boolean; starred?: boolean; notes?: string; solveDifficulty?: SolveDifficulty }
): Promise<void> {
  const problemId = await resolveProblemId(id);
  await saveProgressRemote(problemId, patch);
}

export async function fetchSolutionHistory(id: string): Promise<SolutionHistoryEntry[]> {
  const problemId = await resolveProblemId(id);
  return getSolutionHistory(problemId);
}

export async function saveSolution(id: string, language: string, code: string): Promise<SolutionHistoryEntry> {
  const problemId = await resolveProblemId(id);
  return saveSolutionSnapshot(problemId, language, code);
}

export async function deleteSolution(id: string, entryId: string): Promise<void> {
  const problemId = await resolveProblemId(id);
  await deleteSolutionSnapshot(problemId, entryId);
}

export async function fetchCustomTestCases(id: string): Promise<CustomTestCase[]> {
  const problemId = await resolveProblemId(id);
  return getCustomTestCases(problemId);
}

export async function addCustomTestCase(id: string, inputText: string, outputText: string): Promise<CustomTestCase> {
  const problemId = await resolveProblemId(id);
  return addCustomTestCaseRemote(problemId, inputText, outputText);
}

export async function updateCustomTestCase(
  id: string,
  entryId: string,
  inputText: string,
  outputText: string
): Promise<CustomTestCase> {
  const problemId = await resolveProblemId(id);
  return updateCustomTestCaseRemote(problemId, entryId, inputText, outputText);
}

export async function deleteCustomTestCase(id: string, entryId: string): Promise<void> {
  const problemId = await resolveProblemId(id);
  await removeCustomTestCase(problemId, entryId);
}
