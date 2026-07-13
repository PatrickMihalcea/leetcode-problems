import type { RunResult } from './runner.worker';
import type { PyRunCase } from './runner.pyworker';
import { jsLiteralToPyLiteral } from './exampleParser';

const TIMEOUT_MS = 20000;

export function runPyAgainstCases(
  code: string,
  fnName: string,
  cases: { exampleNum: number; argSources: string[]; outputSource: string }[]
): Promise<RunResult[]> {
  const pyCases: PyRunCase[] = cases.map((c) => ({
    exampleNum: c.exampleNum,
    pyArgs: c.argSources.map(jsLiteralToPyLiteral),
    pyExpected: jsLiteralToPyLiteral(c.outputSource),
  }));

  return new Promise((resolve) => {
    const worker = new Worker(new URL('./runner.pyworker.ts', import.meta.url), { type: 'module' });
    let settled = false;

    const finish = (results: RunResult[]) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      resolve(results);
    };

    const timer = setTimeout(() => {
      finish(
        pyCases.map((c) => ({
          exampleNum: c.exampleNum,
          pass: null,
          actual: '',
          expected: c.pyExpected,
          error: `Timed out after ${TIMEOUT_MS}ms (possible infinite loop, or the Python runtime is still downloading).`,
        }))
      );
    }, TIMEOUT_MS);

    worker.onmessage = (e: MessageEvent<{ results: RunResult[] }>) => {
      clearTimeout(timer);
      finish(e.data.results);
    };

    worker.onerror = (e) => {
      clearTimeout(timer);
      finish(
        pyCases.map((c) => ({
          exampleNum: c.exampleNum,
          pass: null,
          actual: '',
          expected: c.pyExpected,
          error: e.message || 'Worker error',
        }))
      );
    };

    worker.postMessage({ code, fnName, cases: pyCases });
  });
}
