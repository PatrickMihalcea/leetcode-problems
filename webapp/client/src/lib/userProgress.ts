import { supabase, supabaseConfigured } from './supabaseClient';
import type { SolveDifficulty } from './types';

export interface ProgressState {
  solved: boolean;
  starred: boolean;
  notes: string;
  solvedAt: string | null;
  solveDifficulty: SolveDifficulty;
}

const DEFAULT_PROGRESS: ProgressState = {
  solved: false,
  starred: false,
  notes: '',
  solvedAt: null,
  solveDifficulty: null,
};

const progressCache = new Map<string, ProgressState>();
let bulkLoaded = false;
let bulkLoadPromise: Promise<void> | null = null;

async function requireUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new Error('Not signed in');
  return userId;
}

async function loadAllProgress(): Promise<void> {
  if (bulkLoaded) return;
  if (!bulkLoadPromise) {
    bulkLoadPromise = (async () => {
      if (!supabaseConfigured) {
        bulkLoaded = true;
        return;
      }
      const { data, error } = await supabase
        .from('progress')
        .select('problem_id, solved, starred, notes, solved_at, solve_difficulty');
      if (error) throw error;
      for (const row of data ?? []) {
        progressCache.set(row.problem_id, {
          solved: !!row.solved,
          starred: !!row.starred,
          notes: row.notes ?? '',
          solvedAt: row.solved_at ?? null,
          solveDifficulty: row.solve_difficulty ?? null,
        });
      }
      bulkLoaded = true;
    })();
  }
  return bulkLoadPromise;
}

/** Progress for every problem that has one, used by the list/stats views. Loads once, then cached. */
export async function getAllProgress(): Promise<Map<string, ProgressState>> {
  await loadAllProgress();
  return progressCache;
}

export async function getProgress(problemId: string): Promise<ProgressState> {
  if (progressCache.has(problemId)) return progressCache.get(problemId)!;
  if (bulkLoaded || !supabaseConfigured) return DEFAULT_PROGRESS;

  const { data, error } = await supabase
    .from('progress')
    .select('solved, starred, notes, solved_at, solve_difficulty')
    .eq('problem_id', problemId)
    .maybeSingle();
  if (error) throw error;
  const state: ProgressState = data
    ? {
        solved: !!data.solved,
        starred: !!data.starred,
        notes: data.notes ?? '',
        solvedAt: data.solved_at ?? null,
        solveDifficulty: data.solve_difficulty ?? null,
      }
    : DEFAULT_PROGRESS;
  progressCache.set(problemId, state);
  return state;
}

export async function saveProgress(
  problemId: string,
  patch: Partial<ProgressState>
): Promise<ProgressState> {
  const current = await getProgress(problemId);
  const merged: ProgressState = { ...current, ...patch };
  const userId = await requireUserId();

  // Only stamp/clear solvedAt when this call is the one toggling `solved` —
  // editing notes or starring an already-solved problem must not shift its solved date.
  const solvedAt = 'solved' in patch ? (merged.solved ? new Date().toISOString() : null) : current.solvedAt;
  merged.solvedAt = solvedAt;

  const { error } = await supabase.from('progress').upsert(
    {
      user_id: userId,
      problem_id: problemId,
      solved: merged.solved,
      starred: merged.starred,
      notes: merged.notes,
      solved_at: solvedAt,
      solve_difficulty: merged.solveDifficulty,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,problem_id' }
  );
  if (error) throw error;

  progressCache.set(problemId, merged);
  return merged;
}

const savedCodeCache = new Map<string, Record<string, string>>();

export async function getSavedCode(problemId: string): Promise<Record<string, string>> {
  if (savedCodeCache.has(problemId)) return savedCodeCache.get(problemId)!;
  if (!supabaseConfigured) return {};

  const { data, error } = await supabase.from('saved_code').select('language, code').eq('problem_id', problemId);
  if (error) throw error;
  const map: Record<string, string> = {};
  for (const row of data ?? []) map[row.language] = row.code;
  savedCodeCache.set(problemId, map);
  return map;
}

export async function saveCode(problemId: string, language: string, code: string): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase.from('saved_code').upsert(
    {
      user_id: userId,
      problem_id: problemId,
      language,
      code,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,problem_id,language' }
  );
  if (error) throw error;

  const existing = savedCodeCache.get(problemId) ?? {};
  existing[language] = code;
  savedCodeCache.set(problemId, existing);
}

export interface SolutionHistoryEntry {
  id: string;
  language: string;
  code: string;
  createdAt: string;
}

const historyCache = new Map<string, SolutionHistoryEntry[]>();

export async function getSolutionHistory(problemId: string): Promise<SolutionHistoryEntry[]> {
  if (historyCache.has(problemId)) return historyCache.get(problemId)!;
  if (!supabaseConfigured) return [];

  const { data, error } = await supabase
    .from('solution_history')
    .select('id, language, code, created_at')
    .eq('problem_id', problemId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const entries: SolutionHistoryEntry[] = (data ?? []).map((row) => ({
    id: row.id,
    language: row.language,
    code: row.code,
    createdAt: row.created_at,
  }));
  historyCache.set(problemId, entries);
  return entries;
}

export interface LatestSolution {
  problemId: string;
  language: string;
  code: string;
}

/** Most recent saved-solution snapshot per problem/language, across every problem -- used for the "Sync" backfill. */
export async function getAllLatestSolutions(): Promise<LatestSolution[]> {
  if (!supabaseConfigured) return [];

  const { data, error } = await supabase
    .from('solution_history')
    .select('problem_id, language, code, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const latest = new Map<string, LatestSolution>();
  for (const row of data ?? []) {
    const key = `${row.problem_id}:${row.language}`;
    if (!latest.has(key)) {
      latest.set(key, { problemId: row.problem_id, language: row.language, code: row.code });
    }
  }
  return [...latest.values()];
}

export async function saveSolutionSnapshot(
  problemId: string,
  language: string,
  code: string
): Promise<SolutionHistoryEntry> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('solution_history')
    .insert({ user_id: userId, problem_id: problemId, language, code })
    .select('id, language, code, created_at')
    .single();
  if (error) throw error;

  const entry: SolutionHistoryEntry = {
    id: data.id,
    language: data.language,
    code: data.code,
    createdAt: data.created_at,
  };
  const existing = historyCache.get(problemId) ?? [];
  historyCache.set(problemId, [entry, ...existing]);
  return entry;
}

export async function deleteSolutionSnapshot(problemId: string, entryId: string): Promise<void> {
  const { error } = await supabase.from('solution_history').delete().eq('id', entryId);
  if (error) throw error;

  const existing = historyCache.get(problemId);
  if (existing) historyCache.set(problemId, existing.filter((e) => e.id !== entryId));
}

export interface CustomTestCase {
  id: string;
  inputText: string;
  outputText: string;
  createdAt: string;
}

const customCasesCache = new Map<string, CustomTestCase[]>();

export async function getCustomTestCases(problemId: string): Promise<CustomTestCase[]> {
  if (customCasesCache.has(problemId)) return customCasesCache.get(problemId)!;
  if (!supabaseConfigured) return [];

  const { data, error } = await supabase
    .from('custom_test_cases')
    .select('id, input_text, output_text, created_at')
    .eq('problem_id', problemId)
    .order('created_at', { ascending: true });
  if (error) throw error;

  const entries: CustomTestCase[] = (data ?? []).map((row) => ({
    id: row.id,
    inputText: row.input_text,
    outputText: row.output_text,
    createdAt: row.created_at,
  }));
  customCasesCache.set(problemId, entries);
  return entries;
}

export async function addCustomTestCase(
  problemId: string,
  inputText: string,
  outputText: string
): Promise<CustomTestCase> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('custom_test_cases')
    .insert({ user_id: userId, problem_id: problemId, input_text: inputText, output_text: outputText })
    .select('id, input_text, output_text, created_at')
    .single();
  if (error) throw error;

  const entry: CustomTestCase = {
    id: data.id,
    inputText: data.input_text,
    outputText: data.output_text,
    createdAt: data.created_at,
  };
  const existing = customCasesCache.get(problemId) ?? [];
  customCasesCache.set(problemId, [...existing, entry]);
  return entry;
}

export async function updateCustomTestCase(
  problemId: string,
  entryId: string,
  inputText: string,
  outputText: string
): Promise<CustomTestCase> {
  const { data, error } = await supabase
    .from('custom_test_cases')
    .update({ input_text: inputText, output_text: outputText })
    .eq('id', entryId)
    .select('id, input_text, output_text, created_at')
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error(
      'Update failed (no row was returned) — this usually means the "update" permission for custom test cases is ' +
        'missing. Re-run the latest webapp/supabase/schema.sql in your Supabase project\'s SQL Editor.'
    );
  }

  const entry: CustomTestCase = {
    id: data.id,
    inputText: data.input_text,
    outputText: data.output_text,
    createdAt: data.created_at,
  };
  const existing = customCasesCache.get(problemId);
  if (existing) customCasesCache.set(problemId, existing.map((e) => (e.id === entryId ? entry : e)));
  return entry;
}

export async function removeCustomTestCase(problemId: string, entryId: string): Promise<void> {
  const { error } = await supabase.from('custom_test_cases').delete().eq('id', entryId);
  if (error) throw error;

  const existing = customCasesCache.get(problemId);
  if (existing) customCasesCache.set(problemId, existing.filter((e) => e.id !== entryId));
}
