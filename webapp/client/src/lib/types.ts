export type Difficulty = 'Easy' | 'Medium' | 'Hard' | string;

export interface ProblemSummary {
  problem_id: string;
  frontend_id: string;
  title: string;
  slug: string;
  difficulty: Difficulty;
  topics: string[];
  solved: boolean;
  starred: boolean;
}

export interface Example {
  example_num: number;
  example_text: string;
  images: string[];
}

export interface ProblemDetail {
  problem_id: string;
  frontend_id: string;
  title: string;
  slug: string;
  difficulty: Difficulty;
  topics: string[];
  description: string;
  examples: Example[];
  constraints: string[];
  follow_ups: string[];
  hints: string[];
  code_snippets: Record<string, string>;
  solution: string;
  progress: { solved: boolean; starred: boolean; notes: string; solvedAt: string | null };
  savedCode: Record<string, string>;
}

export interface ProblemListResponse {
  total: number;
  page: number;
  pageSize: number;
  items: ProblemSummary[];
}

export interface Stats {
  total: number;
  solvedTotal: number;
  byDifficulty: { difficulty: string; total: number; solved: number }[];
}
