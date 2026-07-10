import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..', '..', '..');
const MERGED_PATH = path.join(REPO_ROOT, 'merged_problems.json');
const OUT_DIR = path.join(__dirname, '..', 'public', 'data');
const PROBLEMS_OUT_DIR = path.join(OUT_DIR, 'problems');

fs.mkdirSync(PROBLEMS_OUT_DIR, { recursive: true });

const raw = JSON.parse(fs.readFileSync(MERGED_PATH, 'utf-8'));
const questions = raw.questions || raw;

const index = [];

for (const q of questions) {
  const problemId = String(q.problem_id ?? q.frontend_id);
  const detail = {
    problem_id: problemId,
    frontend_id: String(q.frontend_id ?? q.problem_id),
    title: q.title ?? '',
    slug: q.problem_slug ?? '',
    difficulty: q.difficulty ?? '',
    topics: q.topics ?? [],
    description: q.description ?? '',
    examples: q.examples ?? [],
    constraints: q.constraints ?? [],
    follow_ups: q.follow_ups ?? [],
    hints: q.hints ?? [],
    code_snippets: q.code_snippets ?? {},
    solutions: q.solutions ?? '',
  };
  fs.writeFileSync(path.join(PROBLEMS_OUT_DIR, `${problemId}.json`), JSON.stringify(detail));

  index.push({
    problem_id: problemId,
    frontend_id: detail.frontend_id,
    title: detail.title,
    slug: detail.slug,
    difficulty: detail.difficulty,
    topics: detail.topics,
  });
}

index.sort((a, b) => (parseInt(a.frontend_id, 10) || 0) - (parseInt(b.frontend_id, 10) || 0));

fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(index));

console.log(`Wrote ${index.length} problem files + index.json to ${OUT_DIR}`);
