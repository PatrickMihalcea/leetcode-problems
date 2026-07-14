import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { connectGithub, consumeGithubOAuthState } from '../lib/github';

export default function GithubCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = params.get('code');
    const state = params.get('state');
    const expectedState = consumeGithubOAuthState();

    if (!code || !state || state !== expectedState) {
      setError('GitHub connect failed: invalid or missing OAuth state.');
      return;
    }

    connectGithub(code)
      .then(() => navigate('/settings', { replace: true }))
      .catch((err) => setError(err.message));
  }, [params, navigate]);

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
