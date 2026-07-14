import { useEffect, useState } from 'react';
import {
  githubOAuthUrl,
  getGithubStatus,
  listGithubRepos,
  createGithubRepo,
  selectGithubRepo,
  syncAllSolutionsToGithub,
  type GithubStatus,
  type GithubRepo,
  type SyncItem,
} from '../lib/github';
import { getAllLatestSolutions } from '../lib/userProgress';
import { loadIndex } from '../lib/dataStore';

export default function Settings() {
  const [status, setStatus] = useState<GithubStatus | null>(null);
  const [repos, setRepos] = useState<GithubRepo[] | null>(null);
  const [selectedRepo, setSelectedRepo] = useState('');
  const [newRepoName, setNewRepoName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    getGithubStatus().then(setStatus).catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (status?.connected && !status.repoFullName) {
      listGithubRepos()
        .then((r) => {
          setRepos(r);
          if (r.length > 0) setSelectedRepo(r[0].fullName);
        })
        .catch((err) => setError(err.message));
    }
  }, [status]);

  function connect() {
    const url = githubOAuthUrl();
    if (!url) {
      setError('GitHub connect is not configured — set VITE_GITHUB_CLIENT_ID (see webapp/README.md).');
      return;
    }
    window.location.href = url;
  }

  async function useSelectedRepo() {
    if (!selectedRepo) return;
    setBusy(true);
    setError(null);
    try {
      const { repoFullName } = await selectGithubRepo(selectedRepo);
      setStatus((s) => (s ? { ...s, repoFullName } : s));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function createRepo() {
    if (!newRepoName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { repoFullName } = await createGithubRepo(newRepoName.trim());
      setStatus((s) => (s ? { ...s, repoFullName } : s));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function changeRepo() {
    setStatus((s) => (s ? { ...s, repoFullName: null } : s));
  }

  async function syncAll() {
    setSyncing(true);
    setSyncMessage(null);
    setError(null);
    try {
      const [solutions, index] = await Promise.all([getAllLatestSolutions(), loadIndex()]);
      const indexById = new Map(index.map((p) => [p.problem_id, p]));

      const items: SyncItem[] = [];
      for (const s of solutions) {
        const problem = indexById.get(s.problemId);
        if (!problem) continue; // solution for a problem no longer in the dataset
        items.push({ frontendId: problem.frontend_id, title: problem.title, language: s.language, code: s.code });
      }

      const result = await syncAllSolutionsToGithub(items);
      if ('committed' in result && result.committed) {
        setSyncMessage(`Synced ${result.fileCount} solution${result.fileCount === 1 ? '' : 's'} in one commit.`);
      } else if ('reason' in result && result.reason === 'no_solutions') {
        setSyncMessage('No saved solutions to sync yet — use "Save Solution" on a problem first.');
      } else {
        setSyncMessage('Not synced — connect GitHub and pick a repo first.');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="page">
      <h1>Settings</h1>

      <div className="chart-card">
        <h2>GitHub sync</h2>
        <p className="dashboard-footnote">
          Optional: connect a GitHub account so every "Save Solution" also commits your code to a repo of your
          choice, at <code>ID_Title/language/ID_Title_Date.ext</code> — giving you a real git history and
          contribution-graph credit for problems you solve here.
        </p>

        {!status && !error && <p>Loading…</p>}

        {status && !status.connected && (
          <button className="run-btn" onClick={connect}>Connect GitHub</button>
        )}

        {status?.connected && !status.repoFullName && (
          <div className="settings-repo-picker">
            <p>Connected as <strong>@{status.login}</strong>. Choose a repo to commit solutions into:</p>

            {repos === null && <p>Loading your repos…</p>}
            {repos && repos.length > 0 && (
              <div className="settings-row">
                <select value={selectedRepo} onChange={(e) => setSelectedRepo(e.target.value)}>
                  {repos.map((r) => (
                    <option key={r.fullName} value={r.fullName}>{r.fullName}</option>
                  ))}
                </select>
                <button className="run-btn" onClick={useSelectedRepo} disabled={busy}>Use this repo</button>
              </div>
            )}

            <p className="dashboard-footnote">Or create a new (private) repo:</p>
            <div className="settings-row">
              <input
                value={newRepoName}
                onChange={(e) => setNewRepoName(e.target.value)}
                placeholder="leetcode-solutions"
              />
              <button className="run-btn" onClick={createRepo} disabled={busy || !newRepoName.trim()}>
                Create repo
              </button>
            </div>
          </div>
        )}

        {status?.connected && status.repoFullName && (
          <div className="settings-repo-picker">
            <div className="settings-row">
              <p>
                Connected as <strong>@{status.login}</strong> — committing solutions to{' '}
                <strong>{status.repoFullName}</strong>.
              </p>
              <button onClick={changeRepo}>Change repo</button>
            </div>
            <div className="settings-row">
              <button className="run-btn" onClick={syncAll} disabled={syncing}>
                {syncing ? 'Syncing…' : 'Sync'}
              </button>
              <span className="dashboard-footnote">
                Backfills every problem you've ever saved a solution for into this repo, as one commit.
              </span>
            </div>
            {syncMessage && <p className="dashboard-footnote">{syncMessage}</p>}
          </div>
        )}

        {error && <div className="login-error">{error}</div>}
      </div>
    </div>
  );
}
