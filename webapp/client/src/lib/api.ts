import type { ProblemDetail, ProblemListResponse, ProblemSummary, Stats } from './types';
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
  type SolutionHistoryEntry,
} from './userProgress';

export type { SolutionHistoryEntry };

export interface ListParams {
  search?: string;
  difficulty?: string;
  topic?: string;
  status?: '' | 'solved' | 'unsolved' | 'starred';
  page?: number;
  pageSize?: number;
  sort?: string;
}

function toSummary(p: IndexEntry, progress: { solved: boolean; starred: boolean }): ProblemSummary {
  return {
    problem_id: p.problem_id,
    frontend_id: p.frontend_id,
    title: p.title,
    slug: p.slug,
    difficulty: p.difficulty,
    topics: p.topics,
    solved: progress.solved,
    starred: progress.starred,
  };
}

export async function fetchProblems(params: ListParams): Promise<ProblemListResponse> {
  const [index, progressMap] = await Promise.all([loadIndex(), getAllProgress()]);

  let items = index.map((p) => toSummary(p, progressMap.get(p.problem_id) ?? { solved: false, starred: false }));

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
  items = [...items].sort((a, b) => {
    if (sort === 'title') return a.title.localeCompare(b.title);
    if (sort === 'difficulty') return a.difficulty.localeCompare(b.difficulty);
    return (parseInt(a.frontend_id, 10) || 0) - (parseInt(b.frontend_id, 10) || 0);
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
  patch: { solved?: boolean; starred?: boolean; notes?: string }
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
