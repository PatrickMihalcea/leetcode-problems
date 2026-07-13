export interface IndexEntry {
  problem_id: string;
  frontend_id: string;
  title: string;
  slug: string;
  difficulty: string;
  topics: string[];
}

export interface ProblemFile {
  problem_id: string;
  frontend_id: string;
  title: string;
  slug: string;
  difficulty: string;
  topics: string[];
  description: string;
  examples: { example_num: number; example_text: string; images: string[] }[];
  constraints: string[];
  follow_ups: string[];
  hints: string[];
  code_snippets: Record<string, string>;
  solution: string;
}

const BASE = import.meta.env.BASE_URL;

let indexPromise: Promise<IndexEntry[]> | null = null;

export function loadIndex(): Promise<IndexEntry[]> {
  if (!indexPromise) {
    indexPromise = fetch(`${BASE}data/index.json`).then((r) => {
      if (!r.ok) throw new Error('Failed to load problem index');
      return r.json();
    });
  }
  return indexPromise;
}

const detailCache = new Map<string, Promise<ProblemFile>>();

export function loadProblemFile(problemId: string): Promise<ProblemFile> {
  if (!detailCache.has(problemId)) {
    detailCache.set(
      problemId,
      fetch(`${BASE}data/problems/${problemId}.json`).then((r) => {
        if (!r.ok) throw new Error('Problem not found');
        return r.json();
      })
    );
  }
  return detailCache.get(problemId)!;
}

/** Resolves either a problem_id or frontend_id to the canonical problem_id used for file lookups. */
export async function resolveProblemId(idOrFrontendId: string): Promise<string> {
  const index = await loadIndex();
  const match = index.find((p) => p.problem_id === idOrFrontendId || p.frontend_id === idOrFrontendId);
  if (!match) throw new Error('Problem not found');
  return match.problem_id;
}
