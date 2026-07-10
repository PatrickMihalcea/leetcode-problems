/// <reference lib="webworker" />

export interface RunCase {
  exampleNum: number;
  argSources: string[];
  outputSource: string;
}

export interface RunRequest {
  code: string;
  fnName: string;
  cases: RunCase[];
}

export interface RunResult {
  exampleNum: number;
  pass: boolean | null; // null = could not evaluate
  actual: string;
  expected: string;
  error?: string;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ak = Object.keys(a as object);
    const bk = Object.keys(b as object);
    if (ak.length !== bk.length) return false;
    return ak.every((k) => deepEqual((a as any)[k], (b as any)[k]));
  }
  return false;
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

self.onmessage = (e: MessageEvent<RunRequest>) => {
  const { code, fnName, cases } = e.data;
  const results: RunResult[] = [];

  try {
    // Indirect eval runs in global scope so top-level `var fn = function(){}` attaches to `self`.
    (0, eval)(code);
  } catch (err) {
    self.postMessage({
      results: cases.map((c) => ({
        exampleNum: c.exampleNum,
        pass: null,
        actual: '',
        expected: c.outputSource,
        error: `Code failed to load: ${(err as Error).message}`,
      })),
    });
    return;
  }

  const fn = (self as any)[fnName];
  if (typeof fn !== 'function') {
    self.postMessage({
      results: cases.map((c) => ({
        exampleNum: c.exampleNum,
        pass: null,
        actual: '',
        expected: c.outputSource,
        error: `Could not find function "${fnName}" after running your code.`,
      })),
    });
    return;
  }

  for (const c of cases) {
    try {
      const args = c.argSources.map((src) => (0, eval)(`(${src})`));
      const expected = (0, eval)(`(${c.outputSource})`);
      const actual = fn(...args);
      results.push({
        exampleNum: c.exampleNum,
        pass: deepEqual(actual, expected),
        actual: safeStringify(actual),
        expected: safeStringify(expected),
      });
    } catch (err) {
      results.push({
        exampleNum: c.exampleNum,
        pass: null,
        actual: '',
        expected: c.outputSource,
        error: (err as Error).message,
      });
    }
  }

  self.postMessage({ results });
};
