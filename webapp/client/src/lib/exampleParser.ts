import type { Example } from './types';

export interface ParsedCase {
  exampleNum: number;
  argNames: string[];
  argSources: string[];
  outputSource: string;
  raw: string;
}

/** Splits a string on top-level commas, ignoring commas nested in [], (), {} or inside quotes. */
export function splitTopLevel(s: string, sep = ','): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  let inStr: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      current += c;
      if (c === inStr && s[i - 1] !== '\\') inStr = null;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = c;
      current += c;
      continue;
    }
    if (c === '[' || c === '(' || c === '{') depth++;
    if (c === ']' || c === ')' || c === '}') depth--;
    if (c === sep && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += c;
  }
  if (current.trim() !== '') parts.push(current.trim());
  return parts;
}

/** Extracts function name and parameter names from a JS code snippet like `var twoSum = function(nums, target) {`. */
export function parseJsSignature(jsSnippet: string): { name: string; params: string[] } | null {
  const varFn = jsSnippet.match(/var\s+(\w+)\s*=\s*function\s*\(([^)]*)\)/);
  if (varFn) {
    return { name: varFn[1], params: splitTopLevel(varFn[2]).filter(Boolean) };
  }
  const namedFn = jsSnippet.match(/function\s+(\w+)\s*\(([^)]*)\)/);
  if (namedFn) {
    return { name: namedFn[1], params: splitTopLevel(namedFn[2]).filter(Boolean) };
  }
  return null;
}

/** Extracts method name and parameter names from a python3 snippet like `def twoSum(self, nums: List[int], target: int) -> List[int]:`. */
export function parsePySignature(pySnippet: string): { name: string; params: string[] } | null {
  const match = pySnippet.match(/def\s+(\w+)\s*\(\s*self\s*,?\s*([^)]*)\)/);
  if (!match) return null;
  const params = splitTopLevel(match[2])
    .map((p) => p.split(':')[0].split('=')[0].trim())
    .filter(Boolean);
  return { name: match[1], params };
}

/**
 * Rewrites a JS-literal source expression (as pulled from example text, e.g. `[2,7,11,15]`,
 * `true`, `null`) into valid Python syntax. Arrays/numbers/strings are already valid Python;
 * only bareword `true`/`false`/`null` need to become `True`/`False`/`None`. Scans char-by-char
 * (like `splitTopLevel`) so words inside string literals are never touched.
 */
export function jsLiteralToPyLiteral(src: string): string {
  let result = '';
  let inStr: string | null = null;
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (inStr) {
      result += c;
      if (c === inStr && src[i - 1] !== '\\') inStr = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = c;
      result += c;
      i++;
      continue;
    }
    const wordMatch = /^(true|false|null)\b/.exec(src.slice(i));
    if (wordMatch) {
      const word = wordMatch[1];
      result += word === 'true' ? 'True' : word === 'false' ? 'False' : 'None';
      i += word.length;
      continue;
    }
    result += c;
    i++;
  }
  return result;
}

/** Parses `Input: a = [...], b = "..."` into ordered name/value-source pairs. */
function parseInputAssignments(inputSrc: string): { name: string; source: string }[] {
  const pairs = splitTopLevel(inputSrc);
  const result: { name: string; source: string }[] = [];
  for (const pair of pairs) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    const name = pair.slice(0, eq).trim();
    const source = pair.slice(eq + 1).trim();
    if (/^[A-Za-z_$][\w$]*$/.test(name)) {
      result.push({ name, source });
    }
  }
  return result;
}

/**
 * Parses each example's free-text block into a runnable test case: ordered argument
 * source expressions (matched to the JS function's parameter order when possible)
 * plus the expected output source expression.
 */
export function parseExamples(examples: Example[], signature: { name: string; params: string[] } | null): ParsedCase[] {
  const cases: ParsedCase[] = [];
  for (const ex of examples) {
    const match = ex.example_text.match(/Input:\s*([\s\S]*?)\n\s*Output:\s*([\s\S]*?)(?:\n\s*Explanation:|$)/);
    if (!match) continue;
    const [, inputSrc, outputSrc] = match;
    const assignments = parseInputAssignments(inputSrc);
    if (assignments.length === 0) continue;

    let ordered = assignments;
    if (signature && signature.params.length === assignments.length) {
      const byName = new Map(assignments.map((a) => [a.name, a]));
      if (signature.params.every((p) => byName.has(p))) {
        ordered = signature.params.map((p) => byName.get(p)!);
      }
    }

    cases.push({
      exampleNum: ex.example_num,
      argNames: ordered.map((a) => a.name),
      argSources: ordered.map((a) => a.source),
      outputSource: outputSrc.trim(),
      raw: ex.example_text,
    });
  }
  return cases;
}
