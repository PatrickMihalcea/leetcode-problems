import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchProblems, fetchTopics, fetchStats, saveProgress } from '../lib/api';
import type { ProblemSummary, SolveDifficulty, Stats } from '../lib/types';
import DifficultyBadge from '../components/DifficultyBadge';
import { SOLVE_DIFFICULTY_OPTIONS, solveDifficultyClass } from '../lib/solveDifficultyOptions';

const PAGE_SIZE = 50;

export default function ProblemList() {
  const [params, setParams] = useSearchParams();
  const search = params.get('search') || '';
  const difficulty = params.get('difficulty') || '';
  const topic = params.get('topic') || '';
  const status = params.get('status') || '';
  const sort = params.get('sort') || 'frontend_id';
  const sortDir = params.get('dir') === 'desc' ? 'desc' : 'asc';
  const page = parseInt(params.get('page') || '1', 10);

  const [items, setItems] = useState<ProblemSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [topics, setTopics] = useState<string[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTopics().then(setTopics).catch(console.error);
  }, []);

  useEffect(() => {
    fetchStats().then(setStats).catch(console.error);
  }, [items]);

  useEffect(() => {
    setLoading(true);
    fetchProblems({ search, difficulty, topic, status: status as any, sort, sortDir, page, pageSize: PAGE_SIZE })
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [search, difficulty, topic, status, sort, sortDir, page]);

  function toggleCompletedSort() {
    if (sort !== 'completed') update({ sort: 'completed', dir: 'desc' });
    else update({ dir: sortDir === 'desc' ? 'asc' : 'desc' });
  }

  function updateSolveDifficulty(problemId: string, value: SolveDifficulty) {
    setItems((cur) => cur.map((p) => (p.problem_id === problemId ? { ...p, solveDifficulty: value } : p)));
    saveProgress(problemId, { solveDifficulty: value }).catch(console.error);
  }

  function update(patch: Record<string, string>) {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => {
      if (v) next.set(k, v);
      else next.delete(k);
    });
    if (!('page' in patch)) next.delete('page');
    setParams(next);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="page">
      <div className="list-header">
        <h1>Problems</h1>
        {stats && (
          <div className="stats">
            <span>{stats.solvedTotal} / {stats.total} solved</span>
            {stats.byDifficulty.map((d) => (
              <span key={d.difficulty} className={`stat-pill stat-${d.difficulty.toLowerCase()}`}>
                {d.difficulty}: {d.solved}/{d.total}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="filters">
        <input
          className="search-input"
          placeholder="Search by title or #id..."
          defaultValue={search}
          onChange={(e) => update({ search: e.target.value })}
        />
        <select value={difficulty} onChange={(e) => update({ difficulty: e.target.value })}>
          <option value="">All difficulties</option>
          <option value="Easy">Easy</option>
          <option value="Medium">Medium</option>
          <option value="Hard">Hard</option>
        </select>
        <select value={topic} onChange={(e) => update({ topic: e.target.value })}>
          <option value="">All topics</option>
          {topics.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => update({ status: e.target.value })}>
          <option value="">All status</option>
          <option value="solved">Solved</option>
          <option value="unsolved">Unsolved</option>
          <option value="starred">Starred</option>
        </select>
      </div>

      <table className="problem-table">
        <colgroup>
          <col className="col-status" />
          <col className="col-num" />
          <col className="col-title" />
          <col className="col-difficulty" />
          <col className="col-topics" />
          <col className="col-completed" />
          <col className="col-solve-difficulty" />
        </colgroup>
        <thead>
          <tr>
            <th></th>
            <th>#</th>
            <th>Title</th>
            <th>Difficulty</th>
            <th>Topics</th>
            <th className="sortable" onClick={toggleCompletedSort}>
              Completed{sort === 'completed' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
            </th>
            <th>Solve Difficulty</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.problem_id}>
              <td>
                {p.solved ? <span title="Solved" className="dot dot-solved" /> : null}
                {p.starred ? <span title="Starred" className="star">★</span> : null}
              </td>
              <td>{p.frontend_id}</td>
              <td>
                <Link to={`/problem/${p.problem_id}`}>{p.title}</Link>
              </td>
              <td><DifficultyBadge difficulty={p.difficulty} /></td>
              <td>
                <div className="topics-cell">
                  {p.topics.slice(0, 4).map((t) => (
                    <span key={t} className="topic-chip">{t}</span>
                  ))}
                </div>
              </td>
              <td className="completed-cell">
                {p.solvedAt
                  ? new Date(p.solvedAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : '—'}
              </td>
              <td>
                <select
                  className={`solve-difficulty-select ${solveDifficultyClass(p.solveDifficulty)}`}
                  value={p.solveDifficulty ?? ''}
                  onChange={(e) =>
                    updateSolveDifficulty(p.problem_id, (e.target.value || null) as SolveDifficulty)
                  }
                >
                  <option value="">—</option>
                  {SOLVE_DIFFICULTY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {loading && <div className="loading">Loading...</div>}

      <div className="pagination">
        <button disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>Prev</button>
        <span>Page {page} of {totalPages} ({total} problems)</span>
        <button disabled={page >= totalPages} onClick={() => update({ page: String(page + 1) })}>Next</button>
      </div>
    </div>
  );
}
