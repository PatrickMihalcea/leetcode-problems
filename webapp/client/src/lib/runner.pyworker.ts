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

declare function importScripts(...urls: string[]): void;
declare function loadPyodide(opts: { indexURL: string }): Promise<any>;

const PYODIDE_VERSION = '314.0.2';
const PYODIDE_BASE = `https://cdn.jsdelivr.net/npm/pyodide@${PYODIDE_VERSION}/`;

const PREAMBLE = 'from typing import *\nimport json, collections, heapq, math, functools, itertools, bisect, re, string\n\n';

let pyodideReady: Promise<any> | null = null;
function getPyodide(): Promise<any> {
  if (!pyodideReady) {
    importScripts(`${PYODIDE_BASE}pyodide.js`);
    pyodideReady = loadPyodide({ indexURL: PYODIDE_BASE });
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
