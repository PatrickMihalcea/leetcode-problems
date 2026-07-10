import { useEffect, useMemo, useState } from 'react';
import { fetchCompletionHistory, fetchStats } from '../lib/api';
import type { CompletionHistory } from '../lib/api';
import type { Stats } from '../lib/types';
import { RANGE_OPTIONS, summarizeCompletions } from '../lib/completionStats';
import type { RangeKey } from '../lib/completionStats';
import TrendChart from '../components/charts/TrendChart';
import ActivityChart from '../components/charts/ActivityChart';

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [history, setHistory] = useState<CompletionHistory | null>(null);
  const [range, setRange] = useState<RangeKey>('90');

  useEffect(() => {
    fetchStats().then(setStats).catch(console.error);
    fetchCompletionHistory().then(setHistory).catch(console.error);
  }, []);

  const summary = useMemo(
    () => (history ? summarizeCompletions(history.entries, history.untrackedSolved, range) : null),
    [history, range]
  );

  if (!stats || !history || !summary) {
    return <div className="page">Loading...</div>;
  }

  const rangeLabel = RANGE_OPTIONS.find((r) => r.key === range)?.label ?? '';
  const hasHistory = history.entries.length > 0;

  return (
    <div className="page dashboard-page">
      <h1>Dashboard</h1>

      <div className="dashboard-tiles">
        <div className="stat-tile">
          <div className="stat-tile-label">Total solved</div>
          <div className="stat-tile-value">
            {stats.solvedTotal.toLocaleString()}
            <span className="stat-tile-of"> / {stats.total.toLocaleString()}</span>
          </div>
        </div>
        {stats.byDifficulty.map((d) => (
          <div className="stat-tile" key={d.difficulty}>
            <div className="stat-tile-label">
              <span className={`stat-dot stat-dot-${d.difficulty.toLowerCase()}`} />
              {d.difficulty}
            </div>
            <div className="stat-tile-value">
              {d.solved.toLocaleString()}
              <span className="stat-tile-of"> / {d.total.toLocaleString()}</span>
            </div>
          </div>
        ))}
        <div className="stat-tile">
          <div className="stat-tile-label">Solved in last {rangeLabel.toLowerCase()}</div>
          <div className="stat-tile-value">{summary.solvedInRange.toLocaleString()}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">Best day{summary.bestDay ? ` · ${summary.bestDay.label}` : ''}</div>
          <div className="stat-tile-value">{summary.bestDay ? summary.bestDay.count.toLocaleString() : '—'}</div>
        </div>
      </div>

      {!hasHistory && (
        <div className="dashboard-empty-note">
          {history.untrackedSolved > 0
            ? `${history.untrackedSolved} problem${history.untrackedSolved === 1 ? '' : 's'} marked solved before date-tracking was added — new solves will show up below.`
            : 'Mark a problem solved to start building your completion history.'}
        </div>
      )}

      <div className="range-filter">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            className={range === opt.key ? 'range-btn active' : 'range-btn'}
            onClick={() => setRange(opt.key)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="chart-card">
        <h2>Total problems solved over time</h2>
        <TrendChart data={summary.cumulative} color="var(--accent)" />
      </div>

      <div className="chart-card">
        <h2>Solving activity</h2>
        <ActivityChart data={summary.activity} color="var(--accent)" />
      </div>

      {history.untrackedSolved > 0 && hasHistory && (
        <div className="dashboard-footnote">
          {history.untrackedSolved} additional solved problem{history.untrackedSolved === 1 ? '' : 's'} predate
          date-tracking and are included in the totals above but not plotted on the timeline.
        </div>
      )}
    </div>
  );
}
