import type { JavaSignature } from './javaSignature';
import { parseJavaClassName } from './javaSignature';
import { isJavaSignatureSupported } from './javaDriver';
import { buildJavaDebugProgram, type JavaDebugCase } from './javaDebugDriver';
import { ensureCheerpj, ensureToolsJar, ensureAsmJars, DEBUG_CLASSPATH, splitEscaped } from './runJavaCode';

declare const cheerpjRunMain: (mainClass: string, classPath: string, ...args: string[]) => Promise<number>;
declare const cheerpjAddStringFile: (path: string, data: string | Uint8Array) => void;

const TIMEOUT_MS = 30000;
const STEP_CAP_NOTE = 'Trace truncated at 5000 steps (likely an infinite loop or very deep recursion).';

export type DebugProgress = 'loading-runtime' | 'downloading-compiler' | 'compiling' | 'instrumenting' | 'running';

export interface DebugStep {
  event: 'enter' | 'exit' | 'line';
  depth: number;
  method?: string;
  line?: number;
  locals?: Record<string, string>;
}

export interface DebugResult {
  steps: DebugStep[];
  truncated: boolean;
  status: 'ok' | 'error';
  error?: string;
  returnValue?: string;
}

function parseTraceLine(raw: string, lineOffset: number): DebugStep | null {
  // Single flat `|`-delimited field list (see DBG_HELPER_JAVA_SOURCE's comment for why this
  // isn't a nested `;`/`=` sub-protocol): a stringified value can itself contain `=`/`;` (e.g. a
  // HashMap's own `{k=v}` toString), and a second escaped delimiter layered on top of the first
  // doesn't survive the first split's generic backslash-escaping.
  const parts = splitEscaped(raw, '|');
  const [kind, depthStr, ...rest] = parts;
  const depth = Number(depthStr);
  if (kind === 'E' || kind === 'X') {
    return { event: kind === 'E' ? 'enter' : 'exit', depth, method: rest[0] };
  }
  if (kind === 'L') {
    const [lineStr, ...pairs] = rest;
    const locals: Record<string, string> = {};
    for (let i = 0; i + 1 < pairs.length; i += 2) {
      locals[pairs[i]] = pairs[i + 1];
    }
    // Line numbers in the trace are in compiled-file coordinates (the generated program prepends
    // extra import lines before the user's own code) — shift back to the user's source lines so
    // they match what breakpoints/highlighting use (the raw, unmodified editor content).
    return { event: 'line', depth, line: Number(lineStr) - lineOffset, locals };
  }
  return null;
}

function parseDebugOutput(consoleText: string, lineOffset: number): DebugResult {
  const steps: DebugStep[] = [];
  let truncated = false;
  let status: 'ok' | 'error' = 'ok';
  let error: string | undefined;
  let returnValue: string | undefined;

  for (const line of consoleText.split('\n')) {
    if (line.startsWith('__DEBUG_STATUS__')) {
      const rest = line.slice('__DEBUG_STATUS__'.length);
      if (rest.startsWith('ERROR')) {
        status = 'error';
        error = splitEscaped(rest, '|')[1] || 'Runtime error';
      }
    } else if (line.startsWith('__DEBUG_RESULT__')) {
      // Unescape only: esc() guarantees no literal, unescaped '|' survives in the value, so
      // splitting on '|' here always yields exactly one part (the fully unescaped value).
      returnValue = splitEscaped(line.slice('__DEBUG_RESULT__'.length), '|')[0];
    } else if (line.startsWith('__STEP_META__')) {
      const [, truncatedStr] = splitEscaped(line.slice('__STEP_META__'.length), '|');
      truncated = truncatedStr === 'true';
    } else if (line.startsWith('__STEP__')) {
      const step = parseTraceLine(line.slice('__STEP__'.length), lineOffset);
      if (step) steps.push(step);
    }
  }

  return { steps, truncated, status, error, returnValue };
}

function errorResult(message: string): DebugResult {
  return { steps: [], truncated: false, status: 'error', error: message };
}

async function runJavaDebugInner(
  code: string,
  signature: JavaSignature,
  testCase: JavaDebugCase,
  onProgress?: (phase: DebugProgress) => void
): Promise<DebugResult> {
  if (!isJavaSignatureSupported(signature)) {
    return errorResult(
      'This problem uses a type not supported by the Java debugger yet (only int/long/double/boolean/char/String, their arrays, and List<Integer|String>/List<List<Integer>> are supported).'
    );
  }
  const className = parseJavaClassName(code);
  if (!className) {
    return errorResult('Could not find a class declaration in your code.');
  }

  onProgress?.('loading-runtime');
  onProgress?.('downloading-compiler');
  const [, toolsJar, asmJars] = await Promise.all([ensureCheerpj(), ensureToolsJar(), ensureAsmJars()]);
  cheerpjAddStringFile('/str/tools.jar', toolsJar);
  cheerpjAddStringFile('/str/asm.jar', asmJars[0]);
  cheerpjAddStringFile('/str/asm-tree.jar', asmJars[1]);

  const program = buildJavaDebugProgram(code, className, signature, testCase);
  cheerpjAddStringFile('/str/Main.java', new TextEncoder().encode(program.source));

  const consoleEl = document.getElementById('console')!;
  consoleEl.innerText = '';

  onProgress?.('compiling');
  const compileCode = await cheerpjRunMain(
    'com.sun.tools.javac.Main',
    DEBUG_CLASSPATH,
    '/str/Main.java',
    '-g',
    '-d',
    '/files/'
  );
  if (compileCode !== 0) {
    return errorResult(`Compile error:\n${consoleEl.innerText || '(no compiler output)'}`);
  }

  onProgress?.('instrumenting');
  const instrumentCode = await cheerpjRunMain('__Instrumenter', DEBUG_CLASSPATH, `/files/${className}.class`);
  if (instrumentCode !== 0) {
    return errorResult(`Failed to instrument your code for debugging:\n${consoleEl.innerText || '(no output)'}`);
  }

  consoleEl.innerText = '';
  onProgress?.('running');
  await cheerpjRunMain('Main', DEBUG_CLASSPATH);
  const result = parseDebugOutput(consoleEl.innerText, program.userCodeLineOffset);
  if (result.steps.length === 0 && result.status === 'ok') {
    return errorResult('No trace was produced for this run.');
  }
  return result;
}

export function runJavaDebug(
  code: string,
  signature: JavaSignature,
  testCase: JavaDebugCase,
  onProgress?: (phase: DebugProgress) => void
): Promise<DebugResult> {
  return Promise.race([
    runJavaDebugInner(code, signature, testCase, onProgress).catch((err: Error) =>
      errorResult(`Java debugger failed: ${err.message}`)
    ),
    new Promise<DebugResult>((resolve) =>
      setTimeout(() => resolve(errorResult(`Still running after ${TIMEOUT_MS / 1000}s. ${STEP_CAP_NOTE}`)), TIMEOUT_MS)
    ),
  ]);
}

// --- Pure step-navigation helpers, operating on an already-recorded trace. No re-execution,
// no I/O — these are the actual "debugger" semantics and are trivially unit-testable. ---

/** Index of the last `line` step in the trace (e.g. the final `return` statement) — the trace's
 * last one or two entries are raw `exit` bookkeeping markers with no source line or locals, so
 * navigation should never land there; that's what made stepping feel like it "ended abruptly". */
export function lastLineIndex(steps: DebugStep[]): number {
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].event === 'line') return i;
  }
  return -1;
}

/** Next step index whose line is a breakpoint, or the last real line in the trace. */
export function continueTo(steps: DebugStep[], from: number, breakpoints: Set<number>): number {
  for (let i = from + 1; i < steps.length; i++) {
    if (steps[i].event === 'line' && breakpoints.has(steps[i].line!)) return i;
  }
  return lastLineIndex(steps);
}

/** Next step at the same or a shallower call depth (skips over any nested calls). Enter/exit
 * markers are only bookkeeping for the call-stack panel — navigation always lands on a `line`
 * step, same as a real debugger stopping on a source line rather than a synthetic marker. */
export function stepOver(steps: DebugStep[], from: number): number {
  const depth = steps[from]?.depth ?? 0;
  for (let i = from + 1; i < steps.length; i++) {
    if (steps[i].event === 'line' && steps[i].depth <= depth) return i;
  }
  return lastLineIndex(steps);
}

/** Next line step at any depth — since only user code is instrumented, this already only
 * descends into the user's own methods (stdlib calls have no trace entries to step into). */
export function stepInto(steps: DebugStep[], from: number): number {
  for (let i = from + 1; i < steps.length; i++) {
    if (steps[i].event === 'line') return i;
  }
  return lastLineIndex(steps);
}

/** Next line step at a shallower call depth than the current frame. */
export function stepOut(steps: DebugStep[], from: number): number {
  const depth = steps[from]?.depth ?? 0;
  for (let i = from + 1; i < steps.length; i++) {
    if (steps[i].event === 'line' && steps[i].depth < depth) return i;
  }
  return lastLineIndex(steps);
}

export interface CallFrame {
  method: string;
  depth: number;
}

/** Replays enter/exit events up to (and including) `uptoIndex` to reconstruct the active call
 * stack — the trace only records enter/exit transitions, so the stack has to be rebuilt rather
 * than read directly off any single step. */
export function buildCallStack(steps: DebugStep[], uptoIndex: number): CallFrame[] {
  const stack: CallFrame[] = [];
  for (let i = 0; i <= uptoIndex && i < steps.length; i++) {
    const step = steps[i];
    if (step.event === 'enter') stack.push({ method: step.method!, depth: step.depth });
    else if (step.event === 'exit') stack.pop();
  }
  return stack;
}
