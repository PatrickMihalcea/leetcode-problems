/// <reference lib="webworker" />
import type { RunResult } from './runner.worker';

export interface PyRunCase {
  exampleNum: number;
  pyArgs: string[];
  pyExpected: string;
}

export interface PyRunRequest {
  code: string;
  fnName: string;
  cases: PyRunCase[];
}

const PYODIDE_VERSION = '314.0.2';
// Try multiple CDNs in case one is blocked by an ad blocker, VPN, or corporate firewall.
const PYODIDE_BASES = [
  `https://cdn.jsdelivr.net/npm/pyodide@${PYODIDE_VERSION}/`,
  `https://unpkg.com/pyodide@${PYODIDE_VERSION}/`,
];

const PREAMBLE = 'from typing import *\nimport json, collections, heapq, math, functools, itertools, bisect, re, string\n\n';

// Pyodide's classic pyodide.js build relies on importScripts(), which some browsers/managed
// environments now block or don't support in worker contexts ("Classic web workers are not
// supported" is Chrome's own message when importScripts is disallowed here). This worker
// therefore runs as a module worker (see runPyCode.ts's `new Worker(..., { type: 'module' })`)
// and loads Pyodide's ESM build (pyodide.mjs) via dynamic import instead.
let pyodideReady: Promise<any> | null = null;
function getPyodide(): Promise<any> {
  if (!pyodideReady) {
    pyodideReady = (async () => {
      let loadPyodideFn: ((opts: { indexURL: string }) => Promise<any>) | null = null;
      let loadedBase: string | null = null;
      const errors: string[] = [];

      for (const base of PYODIDE_BASES) {
        try {
          const mod = await import(/* @vite-ignore */ `${base}pyodide.mjs`);
          loadPyodideFn = mod.loadPyodide;
          loadedBase = base;
          break;
        } catch (err) {
          errors.push(`${base}: ${(err as Error)?.message ?? err}`);
        }
      }

      if (!loadPyodideFn || !loadedBase) {
        throw new Error(
          `Could not load the Python runtime from any CDN. This usually means a network or security ` +
            `policy is blocking module loads to cdn.jsdelivr.net / unpkg.com. Errors: ${errors.join(' | ')}`
        );
      }
      return loadPyodideFn({ indexURL: loadedBase });
    })();
  }
  return pyodideReady;
}

function errorResults(cases: PyRunCase[], message: string): RunResult[] {
  return cases.map((c) => ({
    exampleNum: c.exampleNum,
    pass: null,
    actual: '',
    expected: c.pyExpected,
    error: message,
  }));
}

self.onmessage = async (e: MessageEvent<PyRunRequest>) => {
  const { code, fnName, cases } = e.data;

  let pyodide: any;
  try {
    pyodide = await getPyodide();
  } catch (err) {
    self.postMessage({ results: errorResults(cases, `Failed to load Python runtime: ${(err as Error).message}`) });
    return;
  }

  try {
    pyodide.runPython(PREAMBLE + code);
  } catch (err) {
    self.postMessage({ results: errorResults(cases, `Code failed to load: ${(err as Error).message}`) });
    return;
  }

  const solutionExists = pyodide.runPython('"Solution" in globals()');
  if (!solutionExists) {
    self.postMessage({ results: errorResults(cases, 'Could not find class "Solution" after running your code.') });
    return;
  }

  const lines: string[] = [
    'def __serialize(v):\n    try:\n        return json.dumps(v)\n    except Exception:\n        return repr(v)',
    '__sol = Solution()',
    '__results = []',
  ];

  cases.forEach((c, i) => {
    const argsSrc = c.pyArgs.map((a) => `(${a})`).join(', ');
    lines.push(
      `try:\n` +
        `    __actual${i} = __sol.${fnName}(${argsSrc})\n` +
        `    __expected${i} = (${c.pyExpected})\n` +
        `    __results.append((True, __actual${i} == __expected${i}, __serialize(__actual${i}), __serialize(__expected${i}), None))\n` +
        `except Exception as e:\n` +
        `    __results.append((False, None, None, None, str(e)))`
    );
  });
  lines.push('__results');

  let raw: any;
  try {
    raw = pyodide.runPython(lines.join('\n\n'));
  } catch (err) {
    self.postMessage({ results: errorResults(cases, `Failed to run test cases: ${(err as Error).message}`) });
    return;
  }

  const resultTuples: [boolean, boolean | null, string, string, string | null][] =
    typeof raw?.toJs === 'function' ? raw.toJs() : raw;

  const results: RunResult[] = cases.map((c, i) => {
    const [, pass, actual, expected, error] = resultTuples[i];
    return {
      exampleNum: c.exampleNum,
      pass: pass ?? null,
      actual: actual ?? '',
      expected: expected ?? c.pyExpected,
      error: error ?? undefined,
    };
  });

  self.postMessage({ results });
};
