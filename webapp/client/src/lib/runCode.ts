import type { RunResult } from './runner.worker';

const TIMEOUT_MS = 5000;

export function runJsAgainstCases(
  code: string,
  fnName: string,
  cases: { exampleNum: number; argSources: string[]; outputSource: string }[]
): Promise<RunResult[]> {
  return new Promise((resolve) => {
    const worker = new Worker(new URL('./runner.worker.ts', import.meta.url), { type: 'module' });
    let settled = false;

    const finish = (results: RunResult[]) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      resolve(results);
    };

    const timer = setTimeout(() => {
      finish(
        cases.map((c) => ({
          exampleNum: c.exampleNum,
          pass: null,
          actual: '',
          expected: c.outputSource,
          error: `Timed out after ${TIMEOUT_MS}ms (possible infinite loop).`,
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
        cases.map((c) => ({
          exampleNum: c.exampleNum,
          pass: null,
          actual: '',
          expected: c.outputSource,
          error: e.message || 'Worker error',
        }))
      );
    };

    worker.postMessage({ code, fnName, cases });
  });
}
