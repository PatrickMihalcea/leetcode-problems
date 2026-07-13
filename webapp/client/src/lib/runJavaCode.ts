import type { RunResult } from './runner.worker';
import type { JavaSignature } from './javaSignature';
import { buildJavaProgram, isJavaSignatureSupported, type JavaCase } from './javaDriver';

declare const cheerpjInit: (opts?: any) => Promise<void>;
declare const cheerpjRunMain: (mainClass: string, classPath: string, ...args: string[]) => Promise<number>;
declare const cheerpjCreateDisplay: (width: number, height: number, target: HTMLElement) => void;
declare const cheerpjAddStringFile: (path: string, data: string | Uint8Array) => void;

const LOADER_URL = 'https://cjrtnc.leaningtech.com/4.3/loader.js';
// jsdelivr (both the gh- and npm-based CDNs) returns 403 for this file — confirmed by hand, not
// assumed. unpkg and raw.githubusercontent both serve it fine with correct CORS headers, so try
// those, in order, falling back if one is unreachable (blocked, down, etc).
const TOOLS_JAR_URLS = [
  'https://unpkg.com/dataslope-tools-jar@1.0.0/tools.jar',
  'https://raw.githubusercontent.com/leaningtech/javafiddle/main/static/tools.jar',
];
const CLASSPATH = '/str/tools.jar:/files/';
const TIMEOUT_MS = 30000;

export type JavaProgress =
  | 'loading-runtime'
  | 'downloading-compiler'
  | 'compiling'
  | 'running';

let cheerpjReady: Promise<void> | null = null;
function ensureCheerpj(): Promise<void> {
  if (!cheerpjReady) {
    cheerpjReady = (async () => {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = LOADER_URL;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load the CheerpJ runtime script.'));
        document.head.appendChild(script);
      });

      await cheerpjInit({ status: 'none' });

      let consoleEl = document.getElementById('console');
      if (!consoleEl) {
        consoleEl = document.createElement('pre');
        consoleEl.id = 'console';
        consoleEl.style.display = 'none';
        document.body.appendChild(consoleEl);
      }
      let outputEl = document.getElementById('output');
      if (!outputEl) {
        outputEl = document.createElement('div');
        outputEl.id = 'output';
        outputEl.style.display = 'none';
        document.body.appendChild(outputEl);
      }
      cheerpjCreateDisplay(-1, -1, outputEl);
    })();
  }
  return cheerpjReady;
}

let toolsJarReady: Promise<Uint8Array> | null = null;
function ensureToolsJar(): Promise<Uint8Array> {
  if (!toolsJarReady) {
    toolsJarReady = (async () => {
      const errors: string[] = [];
      for (const url of TOOLS_JAR_URLS) {
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return new Uint8Array(await res.arrayBuffer());
        } catch (err) {
          errors.push(`${url}: ${(err as Error).message}`);
        }
      }
      throw new Error(`Failed to download the Java compiler (tools.jar) from any source:\n${errors.join('\n')}`);
    })();
  }
  return toolsJarReady;
}

/** Splits on `|`, treating a backslash as an escape for the next character (mirrors the Java
 * driver's `escapeForLine`, which backslash-escapes `\`, `|`, and `\n` before printing). */
function splitEscaped(s: string): string[] {
  const parts: string[] = [];
  let current = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && i + 1 < s.length) {
      current += s[i + 1];
      i++;
    } else if (s[i] === '|') {
      parts.push(current);
      current = '';
    } else {
      current += s[i];
    }
  }
  parts.push(current);
  return parts;
}

function parseConsoleLines(text: string, cases: JavaCase[]): RunResult[] {
  const byCase = new Map<number, RunResult>();
  for (const line of text.split('\n')) {
    if (!line.startsWith('__CASE__')) continue;
    const rest = line.slice('__CASE__'.length);
    const sep = rest.indexOf('|');
    if (sep === -1) continue;
    const exampleNum = Number(rest.slice(0, sep));
    const [, status, actual = '', expected = '', error = ''] = splitEscaped(rest.slice(sep));
    byCase.set(exampleNum, {
      exampleNum,
      pass: status === 'PASS' ? true : status === 'FAIL' ? false : null,
      actual,
      expected,
      error: status === 'ERROR' ? error || 'Runtime error' : undefined,
    });
  }
  return cases.map(
    (c) =>
      byCase.get(c.exampleNum) ?? {
        exampleNum: c.exampleNum,
        pass: null,
        actual: '',
        expected: c.outputSource,
        error: 'No output was produced for this case.',
      }
  );
}

function errorResults(cases: JavaCase[], message: string): RunResult[] {
  return cases.map((c) => ({ exampleNum: c.exampleNum, pass: null, actual: '', expected: c.outputSource, error: message }));
}

async function runJavaAgainstCasesInner(
  code: string,
  signature: JavaSignature,
  cases: JavaCase[],
  onProgress?: (phase: JavaProgress) => void
): Promise<RunResult[]> {
  if (!isJavaSignatureSupported(signature)) {
    return errorResults(
      cases,
      'This problem uses a type not supported by Java auto-run yet (only int/long/double/boolean/char/String, their arrays, and List<Integer|String>/List<List<Integer>> are supported).'
    );
  }

  onProgress?.('loading-runtime');
  onProgress?.('downloading-compiler');
  const [, toolsJar] = await Promise.all([ensureCheerpj(), ensureToolsJar()]);
  cheerpjAddStringFile('/str/tools.jar', toolsJar);

  const program = buildJavaProgram(code, signature, cases);
  cheerpjAddStringFile('/str/Main.java', new TextEncoder().encode(program));

  const consoleEl = document.getElementById('console')!;
  consoleEl.innerText = '';

  onProgress?.('compiling');
  const compileCode = await cheerpjRunMain('com.sun.tools.javac.Main', CLASSPATH, '/str/Main.java', '-d', '/files/');
  if (compileCode !== 0) {
    return errorResults(cases, `Compile error:\n${consoleEl.innerText || '(no compiler output)'}`);
  }

  consoleEl.innerText = '';
  onProgress?.('running');
  await cheerpjRunMain('Main', CLASSPATH);
  return parseConsoleLines(consoleEl.innerText, cases);
}

export function runJavaAgainstCases(
  code: string,
  signature: JavaSignature,
  cases: JavaCase[],
  onProgress?: (phase: JavaProgress) => void
): Promise<RunResult[]> {
  return Promise.race([
    runJavaAgainstCasesInner(code, signature, cases, onProgress).catch((err: Error) =>
      errorResults(cases, `Java auto-run failed: ${err.message}`)
    ),
    new Promise<RunResult[]>((resolve) =>
      setTimeout(
        () =>
          resolve(
            errorResults(
              cases,
              `Still running after ${TIMEOUT_MS / 1000}s. Java can't be safely cancelled once started — if this doesn't finish, reloading the page is the only way to stop it.`
            )
          ),
        TIMEOUT_MS
      )
    ),
  ]);
}
