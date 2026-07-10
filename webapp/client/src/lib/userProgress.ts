import { supabase, supabaseConfigured } from './supabaseClient';

export interface ProgressState {
  solved: boolean;
  starred: boolean;
  notes: string;
}

const DEFAULT_PROGRESS: ProgressState = { solved: false, starred: false, notes: '' };

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
      const { data, error } = await supabase.from('progress').select('problem_id, solved, starred, notes');
      if (error) throw error;
      for (const row of data ?? []) {
        progressCache.set(row.problem_id, {
          solved: !!row.solved,
          starred: !!row.starred,
          notes: row.notes ?? '',
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
    .select('solved, starred, notes')
    .eq('problem_id', problemId)
    .maybeSingle();
  if (error) throw error;
  const state: ProgressState = data
    ? { solved: !!data.solved, starred: !!data.starred, notes: data.notes ?? '' }
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

  const { error } = await supabase.from('progress').upsert(
    {
      user_id: userId,
      problem_id: problemId,
      solved: merged.solved,
      starred: merged.starred,
      notes: merged.notes,
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
