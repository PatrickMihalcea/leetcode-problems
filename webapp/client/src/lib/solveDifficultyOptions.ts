import type { SolveDifficulty } from './types';

export interface SolveDifficultyOption {
  value: Exclude<SolveDifficulty, null>;
  label: string;
}

export const SOLVE_DIFFICULTY_OPTIONS: SolveDifficultyOption[] = [
  { value: 'red', label: 'Used Solution' },
  { value: 'yellow', label: 'Solved and Used Solution' },
  { value: 'light_green', label: 'Solved with Difficulty' },
  { value: 'green', label: 'Solved' },
];

export function solveDifficultyClass(value: SolveDifficulty): string {
  return value ? `sd-${value}` : 'sd-none';
}
