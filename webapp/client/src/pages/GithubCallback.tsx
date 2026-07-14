import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { connectGithub, consumeGithubOAuthState } from '../lib/github';

export default function GithubCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    // GitHub appends `code`/`state` as real query params ahead of any fragment in the
    // redirect_uri (`?code=...&state=...#/github/callback`), not inside the fragment --
    // so they live in the page's actual query string, not in this HashRouter route's
    // own (hash-scoped) search params.
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const expectedState = consumeGithubOAuthState();

    // Drop the leftover ?code&state from the address bar now that they're captured.
    window.history.replaceState(null, '', window.location.pathname + window.location.hash);

    if (!code || !state || state !== expectedState) {
      setError('GitHub connect failed: invalid or missing OAuth state.');
      return;
    }

    connectGithub(code)
      .then(() => navigate('/settings', { replace: true }))
      .catch((err) => setError(err.message));
  }, [navigate]);

  return (
    <div className="page">
      {error ? (
        <div className="login-error">{error} — <a href="/settings">Back to Settings</a></div>
      ) : (
        <p>Connecting your GitHub account…</p>
      )}
    </div>
  );
}
