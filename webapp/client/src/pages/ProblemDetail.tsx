import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { fetchProblem, saveCode, saveProgress } from '../lib/api';
import type { ProblemDetail as ProblemDetailT } from '../lib/types';
import DifficultyBadge from '../components/DifficultyBadge';
import { parseExamples, parseJsSignature } from '../lib/exampleParser';
import { runJsAgainstCases } from '../lib/runCode';
import type { RunResult } from '../lib/runner.worker';

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

type Tab = 'description' | 'editorial' | 'hints' | 'notes';

export default function ProblemDetail() {
  const { id = '' } = useParams();
  const [problem, setProblem] = useState<ProblemDetailT | null>(null);
  const [tab, setTab] = useState<Tab>('description');
  const [language, setLanguage] = useState('javascript');
  const [code, setCode] = useState('');
  const [revealedHints, setRevealedHints] = useState(0);
  const [notes, setNotes] = useState('');
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<RunResult[] | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    setRevealedHints(0);
    setTab('description');
    fetchProblem(id).then((p) => {
      setProblem(p);
      setNotes(p.progress.notes || '');
      const langs = Object.keys(p.code_snippets);
      const initialLang = langs.includes('javascript') ? 'javascript' : langs[0] || 'javascript';
      setLanguage(initialLang);
      setCode(p.savedCode[initialLang] ?? p.code_snippets[initialLang] ?? '');
    });
  }, [id]);

  function switchLanguage(lang: string) {
    if (!problem) return;
    setLanguage(lang);
    setCode(problem.savedCode[lang] ?? problem.code_snippets[lang] ?? '');
    setResults(null);
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

  const signature = useMemo(() => (language === 'javascript' ? parseJsSignature(code) : null), [code, language]);
  const cases = useMemo(
    () => (problem && language === 'javascript' ? parseExamples(problem.examples, signature) : []),
    [problem, language, signature]
  );

  async function runCode() {
    if (!signature) {
      setResults([]);
      return;
    }
    setRunning(true);
    setResults(null);
    const r = await runJsAgainstCases(code, signature.name, cases);
    setResults(r);
    setRunning(false);
  }

  if (!problem) return <div className="page">Loading...</div>;

  const languages = Object.keys(problem.code_snippets);

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
          {problem.solutions ? (
            <button className={tab === 'editorial' ? 'tab active' : 'tab'} onClick={() => setTab('editorial')}>Editorial</button>
          ) : null}
          {problem.hints.length > 0 ? (
            <button className={tab === 'hints' ? 'tab active' : 'tab'} onClick={() => setTab('hints')}>Hints</button>
          ) : null}
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

          {tab === 'editorial' && (
            <div className="editorial" dangerouslySetInnerHTML={{ __html: problem.solutions }} />
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
          <select value={language} onChange={(e) => switchLanguage(e.target.value)}>
            {languages.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <span className="save-status">{saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : ''}</span>
          <button className="run-btn" onClick={runCode} disabled={language !== 'javascript' || running}>
            {running ? 'Running…' : 'Run'}
          </button>
        </div>
        {language !== 'javascript' && (
          <div className="run-note">Auto-run only works for JavaScript in v1 — other languages save your code but don't execute it here.</div>
        )}

        <div
          className="editor-wrapper"
          ref={editorWrapperRef}
          style={{ height: editorHeight, pointerEvents: dragging ? 'none' : undefined }}
        >
          <Editor
            height="100%"
            theme="vs-dark"
            language={MONACO_LANG[language] || 'plaintext'}
            value={code}
            onChange={onCodeChange}
            options={{ minimap: { enabled: false }, fontSize: 14, tabSize: 2 }}
          />
        </div>

        <div
          className={dragging === 'row' ? 'row-resizer active' : 'row-resizer'}
          onMouseDown={startRowResize}
        />

        <div className="results-panel">
          {results === null && !running && <div className="results-empty">Run your code against the examples above.</div>}
          {results !== null && results.length === 0 && (
            <div className="results-empty">Couldn't detect a runnable function signature in your code.</div>
          )}
          {results?.map((r) => (
            <div key={r.exampleNum} className={`result-card ${r.pass === true ? 'pass' : r.pass === false ? 'fail' : 'unknown'}`}>
              <div className="result-title">
                Example {r.exampleNum}: {r.pass === true ? 'Passed' : r.pass === false ? 'Failed' : 'Could not verify'}
              </div>
              {r.error ? (
                <div className="result-error">{r.error}</div>
              ) : (
                <div className="result-io">
                  <div>Output: <code>{r.actual}</code></div>
                  <div>Expected: <code>{r.expected}</code></div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
