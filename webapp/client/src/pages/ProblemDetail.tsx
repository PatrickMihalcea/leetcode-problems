import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useParams } from 'react-router-dom';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { editor as MonacoEditorNS } from 'monaco-editor';
import {
  fetchProblem,
  saveCode,
  saveProgress,
  fetchSolutionHistory,
  saveSolution,
  deleteSolution,
  fetchCustomTestCases,
  addCustomTestCase,
  updateCustomTestCase,
  deleteCustomTestCase,
} from '../lib/api';
import type { SolutionHistoryEntry, CustomTestCase } from '../lib/api';
import type { ProblemDetail as ProblemDetailT } from '../lib/types';
import DifficultyBadge from '../components/DifficultyBadge';
import ConfirmDialog from '../components/ConfirmDialog';
import { isMemberAutocompleteEnabled, setMemberAutocompleteEnabled, subscribeMemberAutocompleteEnabled } from '../lib/completionSettings';
import { parseExamples, parseJsSignature, parsePySignature, parseInputAssignments, buildCustomCase } from '../lib/exampleParser';
import { parseJavaSignature } from '../lib/javaSignature';
import { runJsAgainstCases } from '../lib/runCode';
import { runPyAgainstCases } from '../lib/runPyCode';
import { runJavaAgainstCases, type JavaProgress } from '../lib/runJavaCode';
import {
  runJavaDebug,
  continueTo,
  stepOver,
  stepInto,
  stepOut,
  buildCallStack,
  lastLineIndex,
  type DebugResult,
  type DebugProgress,
} from '../lib/debugJavaCode';
import type { RunResult } from '../lib/runner.worker';
import { commitSolutionToGithub } from '../lib/github';

const RUNNABLE_LANGS = ['javascript', 'python3', 'java'];

const MONACO_LANG: Record<string, string> = {
  python3: 'python',
  python: 'python',
  cpp: 'cpp',
  c: 'c',
  java: 'java',
  csharp: 'csharp',
  javascript: 'javascript',
  typescript: 'typescript',
  php: 'php',
  swift: 'swift',
  kotlin: 'kotlin',
  dart: 'dart',
  golang: 'go',
  ruby: 'ruby',
  scala: 'scala',
  rust: 'rust',
  racket: 'scheme',
  erlang: 'erlang',
  elixir: 'elixir',
};

type Tab = 'description' | 'testcases' | 'solution' | 'hints' | 'history' | 'notes';

const LANGUAGE_STORAGE_KEY = 'detailLanguage';
const THEME_STORAGE_KEY = 'detailEditorTheme';

const EDITOR_THEMES = [
  { value: 'vs-dark', label: 'VS Dark' },
  { value: 'dracula', label: 'Dracula' },
];

const JAVA_PHASE_LABELS: Record<JavaProgress, string> = {
  'loading-runtime': 'Loading the Java runtime…',
  'downloading-compiler': 'Downloading the Java compiler (first run only, ~20MB+)…',
  compiling: 'Compiling…',
  running: 'Running…',
};

const DEBUG_PHASE_LABELS: Record<DebugProgress, string> = {
  'loading-runtime': 'Loading the Java runtime…',
  'downloading-compiler': 'Downloading the Java compiler (first run only, ~20MB+)…',
  compiling: 'Compiling…',
  instrumenting: 'Instrumenting your code…',
  running: 'Running…',
};

export default function ProblemDetail() {
  const { id = '' } = useParams();
  const [problem, setProblem] = useState<ProblemDetailT | null>(null);
  const [tab, setTab] = useState<Tab>('description');
  const [language, setLanguage] = useState('javascript');
  const [editorTheme, setEditorTheme] = useState(() => localStorage.getItem(THEME_STORAGE_KEY) || 'vs-dark');
  const autocompleteEnabled = useSyncExternalStore(subscribeMemberAutocompleteEnabled, isMemberAutocompleteEnabled);
  const [code, setCode] = useState('');
  const [revealedHints, setRevealedHints] = useState(0);
  const [notes, setNotes] = useState('');
  const [running, setRunning] = useState(false);
  const [javaPhase, setJavaPhase] = useState<JavaProgress | null>(null);
  const [results, setResults] = useState<RunResult[] | null>(null);

  const [debugging, setDebugging] = useState(false);
  const [debugPhase, setDebugPhase] = useState<DebugProgress | null>(null);
  const [debugTrace, setDebugTrace] = useState<DebugResult | null>(null);
  const [stepIndex, setStepIndex] = useState(-1);
  const [breakpoints, setBreakpoints] = useState<Set<number>>(new Set());
  const [debugCaseIdx, setDebugCaseIdx] = useState(0);
  const editorRef = useRef<MonacoEditorNS.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  const breakpointDecorationsRef = useRef<MonacoEditorNS.IEditorDecorationsCollection | null>(null);
  const currentLineDecorationsRef = useRef<MonacoEditorNS.IEditorDecorationsCollection | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [githubStatus, setGithubStatus] = useState<'idle' | 'committing' | 'committed' | 'skipped' | 'error'>('idle');
  const [githubMessage, setGithubMessage] = useState<string | null>(null);

  const [history, setHistory] = useState<SolutionHistoryEntry[]>([]);
  const [savingSolution, setSavingSolution] = useState(false);
  const [showSaveOnSolve, setShowSaveOnSolve] = useState(false);

  const [customCases, setCustomCases] = useState<CustomTestCase[]>([]);
  const [newCaseValues, setNewCaseValues] = useState<Record<string, string>>({});
  const [newCaseRawInput, setNewCaseRawInput] = useState('');
  const [newCaseOutput, setNewCaseOutput] = useState('');
  const [caseError, setCaseError] = useState<string | null>(null);
  const [addingCase, setAddingCase] = useState(false);

  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [editRawInput, setEditRawInput] = useState('');
  const [editOutput, setEditOutput] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const [leftPct, setLeftPct] = useState(() => Number(localStorage.getItem('detailLeftPct')) || 50);
  const [editorHeight, setEditorHeight] = useState(() => Number(localStorage.getItem('detailEditorHeight')) || 420);
  const [dragging, setDragging] = useState<'col' | 'row' | null>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  const editorWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dragging) return;
    const prevCursor = document.body.style.cursor;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.cursor = dragging === 'col' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
    return () => {
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
    };
  }, [dragging]);

  function startColResize(e: React.MouseEvent) {
    e.preventDefault();
    setDragging('col');
    const onMove = (ev: MouseEvent) => {
      const rect = layoutRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setLeftPct(Math.min(75, Math.max(25, pct)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setDragging(null);
      setLeftPct((p) => {
        localStorage.setItem('detailLeftPct', String(p));
        return p;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function startRowResize(e: React.MouseEvent) {
    e.preventDefault();
    setDragging('row');
    const onMove = (ev: MouseEvent) => {
      const rect = editorWrapperRef.current?.getBoundingClientRect();
      if (!rect) return;
      const h = ev.clientY - rect.top;
      setEditorHeight(Math.min(900, Math.max(150, h)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setDragging(null);
      setEditorHeight((h) => {
        localStorage.setItem('detailEditorHeight', String(h));
        return h;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  useEffect(() => {
    setProblem(null);
    setResults(null);
    setDebugTrace(null);
    setStepIndex(-1);
    setBreakpoints(new Set());
    setRevealedHints(0);
    setTab('description');
    setHistory([]);
    setCustomCases([]);
    setNewCaseValues({});
    setNewCaseRawInput('');
    setNewCaseOutput('');
    setCaseError(null);
    setEditingCaseId(null);
    setEditValues({});
    setEditRawInput('');
    setEditOutput('');
    setEditError(null);
    fetchProblem(id).then((p) => {
      setProblem(p);
      setNotes(p.progress.notes || '');
      const langs = Object.keys(p.code_snippets);
      const preferredLang = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      const initialLang =
        (preferredLang && langs.includes(preferredLang) && preferredLang) ||
        (langs.includes('javascript') ? 'javascript' : langs[0] || 'javascript');
      setLanguage(initialLang);
      setCode(p.savedCode[initialLang] ?? p.code_snippets[initialLang] ?? '');
    });
    fetchSolutionHistory(id).then(setHistory).catch(console.error);
    fetchCustomTestCases(id).then(setCustomCases).catch(console.error);
  }, [id]);

  function switchLanguage(lang: string) {
    if (!problem) return;
    setLanguage(lang);
    setCode(problem.savedCode[lang] ?? problem.code_snippets[lang] ?? '');
    setResults(null);
    setDebugTrace(null);
    setStepIndex(-1);
    setBreakpoints(new Set());
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  }

  function onCodeChange(value: string | undefined) {
    setCode(value ?? '');
    setSaveStatus('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await saveCode(id, language, value ?? '');
      setSaveStatus('saved');
    }, 800);
  }

  async function toggleSolved() {
    if (!problem) return;
    const solved = !problem.progress.solved;
    await saveProgress(id, { solved });
    setProblem({ ...problem, progress: { ...problem.progress, solved } });
    if (solved) setShowSaveOnSolve(true);
  }

  async function saveSolutionOnSolve() {
    setShowSaveOnSolve(false);
    await saveSolutionSnapshot();
  }

  async function toggleStarred() {
    if (!problem) return;
    const starred = !problem.progress.starred;
    await saveProgress(id, { starred });
    setProblem({ ...problem, progress: { ...problem.progress, starred } });
  }

  function onNotesBlur() {
    saveProgress(id, { notes });
  }

  async function saveSolutionSnapshot() {
    setSavingSolution(true);
    try {
      const entry = await saveSolution(id, language, code);
      setHistory((h) => [entry, ...h]);
    } finally {
      setSavingSolution(false);
    }

    if (!problem) return;
    setGithubStatus('committing');
    setGithubMessage(null);
    try {
      const result = await commitSolutionToGithub(problem.frontend_id, problem.title, language, code);
      if ('committed' in result) {
        setGithubStatus('committed');
      } else {
        setGithubStatus('skipped');
        setGithubMessage(
          result.reason === 'not_connected'
            ? 'Connect GitHub in Settings to back this up as a commit.'
            : 'Pick a repo in Settings to back this up as a commit.'
        );
      }
    } catch (err) {
      setGithubStatus('error');
      setGithubMessage((err as Error).message);
    }
  }

  function restoreHistoryEntry(entry: SolutionHistoryEntry) {
    setLanguage(entry.language);
    setCode(entry.code);
    setResults(null);
    setSaveStatus('saving');
    localStorage.setItem(LANGUAGE_STORAGE_KEY, entry.language);
    saveCode(id, entry.language, entry.code).then(() => setSaveStatus('saved'));
  }

  async function deleteHistoryEntry(entryId: string) {
    await deleteSolution(id, entryId);
    setHistory((h) => h.filter((e) => e.id !== entryId));
  }

  async function addTestCase(paramNames: string[]) {
    setCaseError(null);
    const inputText =
      paramNames.length > 0
        ? paramNames.map((name) => `${name} = ${newCaseValues[name] ?? ''}`).join(', ')
        : newCaseRawInput;
    if (!buildCustomCase(inputText, newCaseOutput, -1, signature)) {
      setCaseError("Couldn't parse this input — check the values match the format shown in the placeholders.");
      return;
    }
    setAddingCase(true);
    try {
      const entry = await addCustomTestCase(id, inputText, newCaseOutput);
      setCustomCases((cs) => [...cs, entry]);
      setNewCaseValues({});
      setNewCaseRawInput('');
      setNewCaseOutput('');
    } catch (err) {
      setCaseError((err as Error).message);
    } finally {
      setAddingCase(false);
    }
  }

  function startEditCase(c: CustomTestCase) {
    setEditError(null);
    setEditingCaseId(c.id);
    const values: Record<string, string> = {};
    for (const a of parseInputAssignments(c.inputText)) values[a.name] = a.source;
    setEditValues(values);
    setEditRawInput(c.inputText);
    setEditOutput(c.outputText);
  }

  function cancelEditCase() {
    setEditingCaseId(null);
    setEditValues({});
    setEditRawInput('');
    setEditOutput('');
    setEditError(null);
  }

  async function saveEditCase(paramNames: string[]) {
    if (!editingCaseId) return;
    setEditError(null);
    const inputText =
      paramNames.length > 0
        ? paramNames.map((name) => `${name} = ${editValues[name] ?? ''}`).join(', ')
        : editRawInput;
    if (!buildCustomCase(inputText, editOutput, -1, signature)) {
      setEditError("Couldn't parse this input — check the values match the format shown in the placeholders.");
      return;
    }
    setSavingEdit(true);
    try {
      const entry = await updateCustomTestCase(id, editingCaseId, inputText, editOutput);
      setCustomCases((cs) => cs.map((c) => (c.id === entry.id ? entry : c)));
      cancelEditCase();
    } catch (err) {
      setEditError((err as Error).message);
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteTestCase(entryId: string) {
    if (editingCaseId === entryId) cancelEditCase();
    await deleteCustomTestCase(id, entryId);
    setCustomCases((cs) => cs.filter((c) => c.id !== entryId));
  }

  function copyError(error: string) {
    navigator.clipboard.writeText(error);
  }

  function copySolutionAndError(error: string) {
    navigator.clipboard.writeText(`--- Solution (${language}) ---\n${code}\n\n--- Error ---\n${error}`);
  }

  const javaSignature = useMemo(() => (language === 'java' ? parseJavaSignature(code) : null), [code, language]);
  const signature = useMemo(() => {
    if (language === 'javascript') return parseJsSignature(code);
    if (language === 'python3') return parsePySignature(code);
    if (language === 'java') return javaSignature ? { name: javaSignature.name, params: javaSignature.params.map((p) => p.name) } : null;
    return null;
  }, [code, language, javaSignature]);
  const cases = useMemo(() => {
    if (!problem || !RUNNABLE_LANGS.includes(language)) return [];
    const builtIn = parseExamples(problem.examples, signature);
    const custom = customCases
      .map((c, i) => buildCustomCase(c.inputText, c.outputText, -(i + 1), signature))
      .filter((c): c is NonNullable<typeof c> => c !== null);
    return [...builtIn, ...custom];
  }, [problem, language, signature, customCases]);

  // Drives the add-test-case form: one field per parameter (named/ordered from the current
  // language's signature), pre-filled with a hint from the first built-in example's values.
  // Falls back to a single raw-text field when the signature can't be parsed at all.
  const paramNames = signature?.params ?? [];
  const firstExampleCase = cases.find((c) => c.exampleNum > 0);
  const paramPlaceholders: Record<string, string> = {};
  if (firstExampleCase) {
    firstExampleCase.argNames.forEach((name, i) => {
      paramPlaceholders[name] = firstExampleCase.argSources[i];
    });
  }

  async function runCode() {
    if (!signature) {
      setResults([]);
      return;
    }
    setRunning(true);
    setResults(null);
    setJavaPhase(null);
    try {
      const r =
        language === 'python3'
          ? await runPyAgainstCases(code, signature.name, cases)
          : language === 'java'
            ? await runJavaAgainstCases(code, javaSignature!, cases, setJavaPhase)
            : await runJsAgainstCases(code, signature.name, cases);
      setResults(r);
    } catch (err) {
      setResults(
        cases.map((c) => ({
          exampleNum: c.exampleNum,
          pass: null,
          actual: '',
          expected: c.outputSource,
          error: `Unexpected error: ${(err as Error).message}`,
        }))
      );
    } finally {
      setRunning(false);
      setJavaPhase(null);
    }
  }

  const handleEditorMount: OnMount = (editorInstance, monacoInstance) => {
    editorRef.current = editorInstance;
    monacoRef.current = monacoInstance;
    editorInstance.onMouseDown((e) => {
      if (e.target.type !== monacoInstance.editor.MouseTargetType.GUTTER_GLYPH_MARGIN || !e.target.position) return;
      const line = e.target.position.lineNumber;
      setBreakpoints((bp) => {
        const next = new Set(bp);
        if (next.has(line)) next.delete(line);
        else next.add(line);
        return next;
      });
    });
  };

  // Keep the gutter's breakpoint dots in sync with `breakpoints` state.
  useEffect(() => {
    const ed = editorRef.current;
    const mon = monacoRef.current;
    if (!ed || !mon) return;
    const decorations = [...breakpoints].map((line) => ({
      range: new mon.Range(line, 1, line, 1),
      options: { glyphMarginClassName: 'breakpoint-glyph', glyphMarginHoverMessage: { value: 'Breakpoint' } },
    }));
    if (!breakpointDecorationsRef.current) breakpointDecorationsRef.current = ed.createDecorationsCollection(decorations);
    else breakpointDecorationsRef.current.set(decorations);
  }, [breakpoints]);

  // Highlight the current line for the step the debugger is stopped on.
  useEffect(() => {
    const ed = editorRef.current;
    const mon = monacoRef.current;
    if (!ed || !mon) return;
    const step = debugTrace?.steps[stepIndex];
    if (step?.event === 'line' && step.line) {
      const decorations = [
        { range: new mon.Range(step.line, 1, step.line, 1), options: { isWholeLine: true, className: 'debug-current-line' } },
      ];
      if (!currentLineDecorationsRef.current) currentLineDecorationsRef.current = ed.createDecorationsCollection(decorations);
      else currentLineDecorationsRef.current.set(decorations);
      ed.revealLineInCenter(step.line);
    } else {
      currentLineDecorationsRef.current?.set([]);
    }
  }, [debugTrace, stepIndex]);

  async function startDebug() {
    if (!javaSignature || cases.length === 0) return;
    const testCase = cases[debugCaseIdx] ?? cases[0];
    setDebugging(true);
    setDebugTrace(null);
    setStepIndex(-1);
    setDebugPhase(null);
    try {
      const result = await runJavaDebug(code, javaSignature, { argSources: testCase.argSources }, setDebugPhase);
      setDebugTrace(result);
      if (result.status === 'ok' && result.steps.length > 0) {
        setStepIndex(stepInto(result.steps, -1));
      }
    } finally {
      setDebugging(false);
      setDebugPhase(null);
    }
  }

  function stopDebug() {
    setDebugTrace(null);
    setStepIndex(-1);
  }

  if (!problem) return <div className="page">Loading...</div>;

  const languages = Object.keys(problem.code_snippets).sort((a, b) => {
    const aRunnable = RUNNABLE_LANGS.includes(a);
    const bRunnable = RUNNABLE_LANGS.includes(b);
    if (aRunnable !== bRunnable) return aRunnable ? -1 : 1;
    return 0;
  });

  return (
    <div className="detail-layout" ref={layoutRef}>
      <div className="detail-left" style={{ width: `${leftPct}%` }}>
        <div className="detail-toolbar">
          <Link to="/" className="back-link">← All problems</Link>
          <div className="detail-actions">
            <button className={problem.progress.starred ? 'star-btn active' : 'star-btn'} onClick={toggleStarred}>
              ★ {problem.progress.starred ? 'Starred' : 'Star'}
            </button>
            <button className={problem.progress.solved ? 'solved-btn active' : 'solved-btn'} onClick={toggleSolved}>
              ✓ {problem.progress.solved ? 'Solved' : 'Mark solved'}
            </button>
          </div>
        </div>

        <h1>{problem.frontend_id}. {problem.title}</h1>
        <div className="meta-row">
          <DifficultyBadge difficulty={problem.difficulty} />
          {problem.topics.map((t) => (
            <span key={t} className="topic-chip">{t}</span>
          ))}
        </div>

        <div className="tabs">
          <button className={tab === 'description' ? 'tab active' : 'tab'} onClick={() => setTab('description')}>Description</button>
          <button className={tab === 'testcases' ? 'tab active' : 'tab'} onClick={() => setTab('testcases')}>
            Test Cases{customCases.length > 0 ? ` (${customCases.length})` : ''}
          </button>
          {problem.solution ? (
            <button className={tab === 'solution' ? 'tab active' : 'tab'} onClick={() => setTab('solution')}>Solution</button>
          ) : null}
          {problem.hints.length > 0 ? (
            <button className={tab === 'hints' ? 'tab active' : 'tab'} onClick={() => setTab('hints')}>Hints</button>
          ) : null}
          <button className={tab === 'history' ? 'tab active' : 'tab'} onClick={() => setTab('history')}>
            History{history.length > 0 ? ` (${history.length})` : ''}
          </button>
          <button className={tab === 'notes' ? 'tab active' : 'tab'} onClick={() => setTab('notes')}>My Notes</button>
        </div>

        <div className="tab-content">
          {tab === 'description' && (
            <div className="description">
              <p className="pre-wrap">{problem.description}</p>

              {problem.examples.map((ex) => (
                <div key={ex.example_num} className="example-block">
                  <strong>Example {ex.example_num}:</strong>
                  <pre className="example-text">{ex.example_text}</pre>
                  {ex.images.map((img) => (
                    <img key={img} src={img} alt={`Example ${ex.example_num}`} className="example-img" />
                  ))}
                </div>
              ))}

              {problem.constraints.length > 0 && (
                <div className="constraints-block">
                  <strong>Constraints:</strong>
                  <ul>
                    {problem.constraints.map((c, i) => (
                      <li key={i}><code>{c}</code></li>
                    ))}
                  </ul>
                </div>
              )}

              {problem.follow_ups.length > 0 && (
                <div className="followups-block">
                  <strong>Follow-up:</strong>
                  <ul>
                    {problem.follow_ups.map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          {tab === 'testcases' && (
            <div className="testcases-tab">
              <div className="testcases-section">
                <strong>Examples (built-in)</strong>
                {problem.examples.map((ex) => (
                  <pre key={ex.example_num} className="example-text">{ex.example_text}</pre>
                ))}
              </div>

              <div className="testcases-section">
                <strong>Your test cases</strong>
                {customCases.length === 0 && <div className="results-empty">No custom test cases yet.</div>}
                {customCases.map((c) =>
                  editingCaseId === c.id ? (
                    <div key={c.id} className="custom-case-card editing">
                      {paramNames.length > 0 ? (
                        paramNames.map((name) => (
                          <label key={name}>
                            {name}
                            <input
                              value={editValues[name] ?? ''}
                              onChange={(e) => setEditValues((v) => ({ ...v, [name]: e.target.value }))}
                              placeholder={paramPlaceholders[name] ?? ''}
                            />
                          </label>
                        ))
                      ) : (
                        <label>
                          Input (couldn't detect parameter names from your code — enter it as{' '}
                          <code>name = value, name2 = value2</code>)
                          <input value={editRawInput} onChange={(e) => setEditRawInput(e.target.value)} />
                        </label>
                      )}
                      <label>
                        Expected Output
                        <input value={editOutput} onChange={(e) => setEditOutput(e.target.value)} />
                      </label>
                      <div className="add-testcase-actions">
                        <button
                          onClick={() => saveEditCase(paramNames)}
                          disabled={
                            savingEdit ||
                            !editOutput ||
                            (paramNames.length > 0 ? paramNames.some((n) => !editValues[n]) : !editRawInput)
                          }
                        >
                          {savingEdit ? 'Saving…' : 'Save changes'}
                        </button>
                        <button onClick={cancelEditCase} disabled={savingEdit}>Cancel</button>
                      </div>
                      {editError && <div className="result-error">{editError}</div>}
                    </div>
                  ) : (
                    <div key={c.id} className="custom-case-card">
                      <pre className="example-text">{`Input: ${c.inputText}\nOutput: ${c.outputText}`}</pre>
                      <div className="history-actions">
                        <button onClick={() => startEditCase(c)} disabled={editingCaseId !== null}>Edit</button>
                        <button onClick={() => deleteTestCase(c.id)} disabled={editingCaseId !== null}>Delete</button>
                      </div>
                    </div>
                  )
                )}

                <div className="add-testcase-form">
                  {paramNames.length > 0 ? (
                    paramNames.map((name) => (
                      <label key={name}>
                        {name}
                        <input
                          value={newCaseValues[name] ?? ''}
                          onChange={(e) => setNewCaseValues((v) => ({ ...v, [name]: e.target.value }))}
                          placeholder={paramPlaceholders[name] ?? ''}
                        />
                      </label>
                    ))
                  ) : (
                    <label>
                      Input (couldn't detect parameter names from your code — enter it as{' '}
                      <code>name = value, name2 = value2</code>)
                      <input
                        value={newCaseRawInput}
                        onChange={(e) => setNewCaseRawInput(e.target.value)}
                        placeholder="nums = [2,7,11,15], target = 9"
                      />
                    </label>
                  )}
                  <label>
                    Expected Output
                    <input
                      value={newCaseOutput}
                      onChange={(e) => setNewCaseOutput(e.target.value)}
                      placeholder={firstExampleCase?.outputSource ?? '[0,1]'}
                    />
                  </label>
                  <button
                    onClick={() => addTestCase(paramNames)}
                    disabled={
                      addingCase ||
                      !newCaseOutput ||
                      (paramNames.length > 0 ? paramNames.some((n) => !newCaseValues[n]) : !newCaseRawInput)
                    }
                  >
                    {addingCase ? 'Adding…' : 'Add test case'}
                  </button>
                  {caseError && <div className="result-error">{caseError}</div>}
                </div>
              </div>
            </div>
          )}

          {tab === 'solution' && (
            <div className="solution-content" dangerouslySetInnerHTML={{ __html: problem.solution }} />
          )}

          {tab === 'hints' && (
            <div className="hints">
              {problem.hints.slice(0, revealedHints).map((h, i) => (
                <div key={i} className="hint-card">
                  <strong>Hint {i + 1}</strong>
                  <p>{h}</p>
                </div>
              ))}
              {revealedHints < problem.hints.length && (
                <button className="reveal-btn" onClick={() => setRevealedHints((n) => n + 1)}>
                  Reveal Hint {revealedHints + 1} of {problem.hints.length}
                </button>
              )}
            </div>
          )}

          {tab === 'history' && (
            <div className="history-tab">
              {history.length === 0 && (
                <div className="results-empty">
                  No saved solutions yet. Click "Save Solution" next to the editor to snapshot your current code.
                </div>
              )}
              {history.map((entry) => (
                <details key={entry.id} className="history-entry">
                  <summary>
                    <span className="topic-chip">{entry.language}</span>
                    <span className="history-timestamp">{new Date(entry.createdAt).toLocaleString()}</span>
                  </summary>
                  <pre className="example-text history-code">{entry.code}</pre>
                  <div className="history-actions">
                    <button onClick={() => restoreHistoryEntry(entry)}>Restore into editor</button>
                    <button onClick={() => deleteHistoryEntry(entry.id)}>Delete</button>
                  </div>
                </details>
              ))}
            </div>
          )}

          {tab === 'notes' && (
            <div className="notes-tab">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={onNotesBlur}
                placeholder="Write your own notes about this problem..."
                rows={16}
              />
            </div>
          )}
        </div>
      </div>

      <div
        className={dragging === 'col' ? 'col-resizer active' : 'col-resizer'}
        onMouseDown={startColResize}
      />

      <div className="detail-right" style={{ width: `${100 - leftPct}%` }}>
        <div className="editor-toolbar">
          <select
            value={language}
            onChange={(e) => switchLanguage(e.target.value)}
            title="⚡ = runs in-browser via the Run button"
          >
            {languages.map((l) => (
              <option key={l} value={l}>{l}{RUNNABLE_LANGS.includes(l) ? ' ⚡' : ''}</option>
            ))}
          </select>
          {(language === 'java' || language === 'python3') && (
            <button
              className={autocompleteEnabled ? 'toggle-btn active' : 'toggle-btn'}
              onClick={() => setMemberAutocompleteEnabled(!autocompleteEnabled)}
              title="Toggle member autocomplete (e.g. map.put, seen.get)"
            >
              {autocompleteEnabled ? '✓ Autocomplete' : 'Autocomplete off'}
            </button>
          )}
          <select
            value={editorTheme}
            onChange={(e) => {
              setEditorTheme(e.target.value);
              localStorage.setItem(THEME_STORAGE_KEY, e.target.value);
            }}
            title="Editor theme"
          >
            {EDITOR_THEMES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <span className="save-status">{saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : ''}</span>
          <button onClick={saveSolutionSnapshot} disabled={savingSolution}>
            {savingSolution ? 'Saving…' : 'Save Solution'}
          </button>
          {githubStatus !== 'idle' && (
            <span className="save-status" title={githubMessage ?? undefined}>
              {githubStatus === 'committing' && 'Syncing to GitHub…'}
              {githubStatus === 'committed' && '✓ Synced to GitHub'}
              {githubStatus === 'skipped' && (githubMessage ?? 'Not synced to GitHub')}
              {githubStatus === 'error' && `⚠ GitHub sync failed`}
            </span>
          )}
          <button className="run-btn" onClick={runCode} disabled={!RUNNABLE_LANGS.includes(language) || running}>
            {running ? (language === 'java' && javaPhase ? JAVA_PHASE_LABELS[javaPhase] : 'Running…') : 'Run'}
          </button>
          {language === 'java' && (
            <>
              <select
                value={debugCaseIdx}
                onChange={(e) => setDebugCaseIdx(Number(e.target.value))}
                disabled={cases.length === 0 || debugging}
                title="Test case to debug"
              >
                {cases.map((c, i) => (
                  <option key={c.exampleNum} value={i}>
                    {c.exampleNum > 0 ? `Example ${c.exampleNum}` : `Custom case ${-c.exampleNum}`}
                  </option>
                ))}
              </select>
              <button className="run-btn" onClick={startDebug} disabled={cases.length === 0 || debugging || running}>
                {debugging ? (debugPhase ? DEBUG_PHASE_LABELS[debugPhase] : 'Starting…') : 'Debug'}
              </button>
            </>
          )}
        </div>
        {!RUNNABLE_LANGS.includes(language) && (
          <div className="run-note">Auto-run works for JavaScript, Python, and Java here — other languages save your code but don't execute it.</div>
        )}
        {language === 'java' && running && (
          <div className="run-note">
            {javaPhase ? JAVA_PHASE_LABELS[javaPhase] : 'Starting…'} Java code can't be safely cancelled once started —
            if this seems stuck for more than ~30s, reloading the page is the only way to stop it.
          </div>
        )}
        {language === 'java' && debugging && (
          <div className="run-note">
            {debugPhase ? DEBUG_PHASE_LABELS[debugPhase] : 'Starting…'} Click a line's left margin to set a breakpoint.
          </div>
        )}

        <div
          className="editor-wrapper"
          ref={editorWrapperRef}
          style={{ height: editorHeight, pointerEvents: dragging ? 'none' : undefined }}
        >
          <Editor
            height="100%"
            theme={editorTheme}
            language={MONACO_LANG[language] || 'plaintext'}
            value={code}
            onChange={onCodeChange}
            onMount={handleEditorMount}
            options={{ minimap: { enabled: false }, fontSize: 14, tabSize: 2, glyphMargin: true }}
          />
        </div>

        <div
          className={dragging === 'row' ? 'row-resizer active' : 'row-resizer'}
          onMouseDown={startRowResize}
        />

        {language === 'java' && debugTrace && (
          <div className="debugger-panel">
            {debugTrace.status === 'error' ? (
              <div className="result-error">{debugTrace.error}</div>
            ) : (
              <>
                <div className="debugger-toolbar">
                  <button
                    onClick={() => setStepIndex((i) => continueTo(debugTrace.steps, i, breakpoints))}
                    disabled={stepIndex >= lastLineIndex(debugTrace.steps)}
                  >
                    Continue
                  </button>
                  <button
                    onClick={() => setStepIndex((i) => stepOver(debugTrace.steps, i))}
                    disabled={stepIndex >= lastLineIndex(debugTrace.steps)}
                  >
                    Step Over
                  </button>
                  <button
                    onClick={() => setStepIndex((i) => stepInto(debugTrace.steps, i))}
                    disabled={stepIndex >= lastLineIndex(debugTrace.steps)}
                  >
                    Step Into
                  </button>
                  <button
                    onClick={() => setStepIndex((i) => stepOut(debugTrace.steps, i))}
                    disabled={stepIndex >= lastLineIndex(debugTrace.steps)}
                  >
                    Step Out
                  </button>
                  <button onClick={stopDebug}>Stop</button>
                </div>
                {debugTrace.truncated && (
                  <div className="run-note">Trace truncated at 5000 steps (likely an infinite loop or very deep recursion).</div>
                )}
                {stepIndex >= lastLineIndex(debugTrace.steps) && (
                  <div className="run-note">Program finished. Returned: <code>{debugTrace.returnValue}</code></div>
                )}
                <div className="debugger-body">
                  <div className="debugger-section">
                    <strong>Call Stack</strong>
                    <ul>
                      {buildCallStack(debugTrace.steps, stepIndex)
                        .slice()
                        .reverse()
                        .map((f, i) => (
                          <li key={i}>{f.method}</li>
                        ))}
                    </ul>
                  </div>
                  <div className="debugger-section">
                    <strong>Variables</strong>
                    {debugTrace.steps[stepIndex]?.event === 'line' ? (
                      <ul>
                        {Object.entries(debugTrace.steps[stepIndex].locals ?? {}).map(([name, value]) => (
                          <li key={name}>
                            <code>{name}</code> = <code>{value}</code>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="results-empty">No locals at this step.</div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <div className="results-panel">
          {results === null && !running && <div className="results-empty">Run your code against the examples above.</div>}
          {results !== null && results.length === 0 && (
            <div className="results-empty">Couldn't detect a runnable function signature in your code.</div>
          )}
          {results?.map((r) => (
            <div key={r.exampleNum} className={`result-card ${r.pass === true ? 'pass' : r.pass === false ? 'fail' : 'unknown'}`}>
              <div className="result-title">
                {r.exampleNum > 0 ? `Example ${r.exampleNum}` : `Custom case ${-r.exampleNum}`}:{' '}
                {r.pass === true ? 'Passed' : r.pass === false ? 'Failed' : 'Could not verify'}
              </div>
              {r.error ? (
                <div className="result-error">{r.error}</div>
              ) : (
                <div className="result-io">
                  <div>Output: <code>{r.actual}</code></div>
                  <div>Expected: <code>{r.expected}</code></div>
                </div>
              )}
              {r.pass !== true && (
                <div className="result-error-actions">
                  <button onClick={() => copyError(r.error ?? `Output: ${r.actual}\nExpected: ${r.expected}`)}>Copy error</button>
                  <button onClick={() => copySolutionAndError(r.error ?? `Output: ${r.actual}\nExpected: ${r.expected}`)}>
                    Copy Solution + Error
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {showSaveOnSolve && (
        <ConfirmDialog
          message="Save your current solution?"
          confirmLabel="Save"
          cancelLabel="Don't save"
          onConfirm={saveSolutionOnSolve}
          onCancel={() => setShowSaveOnSolve(false)}
        />
      )}
    </div>
  );
}
