import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import katex from 'katex';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..', '..', '..');
// merged_problems.json is a stale export (e.g. it's missing the `solution` field entirely) --
// the per-problem files under problems/ are the up-to-date source of truth, so read those instead.
const PROBLEMS_SRC_DIR = path.join(REPO_ROOT, 'problems');
const OUT_DIR = path.join(__dirname, '..', 'public', 'data');
const PROBLEMS_OUT_DIR = path.join(OUT_DIR, 'problems');

fs.mkdirSync(PROBLEMS_OUT_DIR, { recursive: true });

const questions = fs
  .readdirSync(PROBLEMS_SRC_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(PROBLEMS_SRC_DIR, f), 'utf-8')));

// The scraper leaves contentless "Example 1:" / "Example 2:" / "Constraints:" header stub lines
// at the end of `description`, left over from a page layout where the real example/constraint
// content followed on the same line -- that content is already captured separately in
// `examples`/`constraints`, so these stubs just duplicate the heading with nothing under it.
function cleanDescription(desc) {
  return desc
    .split('\n')
    .filter((line) => !/^(Example \d+:|Constraints:)$/.test(line.trim()))
    .join('\n')
    .trim();
}

// The scraper stores editorial content under `solution` (singular) as raw Markdown, with
// images/diagrams referenced by relative paths (e.g. `../Figures/1503/1.png`) that only resolve
// against LeetCode's own site structure. LeetCode redirects those paths to this CDN base, so we
// rewrite them to absolute URLs before converting to HTML -- otherwise every image is broken.
function resolveSolutionImages(markdown) {
  return markdown
    .replaceAll('../Figures/', 'https://assets.leetcode.com/static_assets/media/original_images/')
    .replaceAll('../Documents/', 'https://assets.leetcode.com/static_assets/media/documents/');
}

// `[TOC]` is a directive LeetCode's own site expands into a table of contents; it has no
// meaning to a plain Markdown renderer and would otherwise show up as literal text.
function stripToc(markdown) {
  return markdown.replace(/^\[TOC\]\s*$/m, '').trim();
}

// Solutions delimit math with both $$...$$ and $...$, but -- unlike standard LaTeX, where $$ means
// display/block math -- every $$...$$ occurrence in this dataset sits mid-sentence (e.g. "costs
// $$O(n)$$ per iteration"), so both forms are rendered inline; KaTeX's displayMode would instead
// center each one on its own line and break the surrounding sentence.
// KaTeX needs the raw expression (not run through the Markdown parser, which would mangle
// underscores/asterisks/backslashes inside it), so math is rendered and swapped for a placeholder
// *before* marked() sees the text, then the real KaTeX HTML is spliced back in afterwards.
// U+E000 is a Private Use Area codepoint -- safe to use as a marker since it won't occur in
// scraped problem text and Markdown has no syntax that would touch it.
const MATH_MARKER = '';

function extractMath(markdown) {
  const stash = [];
  function render(expr) {
    // KaTeX console.warns directly (independent of the strict/throwOnError options) when it lacks
    // font metrics for a character, e.g. the invisible U+2061 FUNCTION APPLICATION operator that
    // shows up throughout this dataset -- harmless, but silence it so build logs stay readable.
    const originalWarn = console.warn;
    console.warn = () => {};
    let html;
    try {
      html = katex.renderToString(expr, { throwOnError: false, strict: false, displayMode: false });
    } catch {
      html = `$${expr}$`;
    } finally {
      console.warn = originalWarn;
    }
    const token = `${MATH_MARKER}${stash.length}${MATH_MARKER}`;
    stash.push(html);
    return token;
  }

  // Both $$...$$ and $...$ are rendered inline -- see note above on why displayMode is never used.
  const withoutDisplayMath = markdown.replace(/\$\$([^$]+?)\$\$/g, (_, expr) => render(expr));
  const withoutInlineMath = withoutDisplayMath.replace(/\$([^$\n]+?)\$/g, (_, expr) => render(expr));
  return { text: withoutInlineMath, stash };
}

function restoreMath(html, stash) {
  return html.replace(new RegExp(`${MATH_MARKER}(\\d+)${MATH_MARKER}`, 'g'), (_, i) => stash[Number(i)]);
}

function renderSolution(rawMarkdown) {
  if (!rawMarkdown) return '';
  const cleaned = resolveSolutionImages(stripToc(rawMarkdown));
  const { text, stash } = extractMath(cleaned);
  return restoreMath(marked.parse(text), stash);
}

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
    description: cleanDescription(q.description ?? ''),
    examples: q.examples ?? [],
    constraints: q.constraints ?? [],
    follow_ups: q.follow_ups ?? [],
    hints: q.hints ?? [],
    code_snippets: q.code_snippets ?? {},
    solution: renderSolution(q.solution ?? ''),
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
