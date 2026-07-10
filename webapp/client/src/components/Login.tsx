import { useState } from 'react';
import { useAuth } from '../lib/AuthProvider';
import { supabaseConfigured } from '../lib/supabaseClient';

export default function Login() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    const fn = mode === 'signin' ? signIn : signUp;
    const { error } = await fn(email, password);
    setBusy(false);
    if (error) {
      setError(error);
    } else if (mode === 'signup') {
      setInfo('Account created. If email confirmation is enabled on your Supabase project, check your inbox before signing in.');
    }
  }

  if (!supabaseConfigured) {
    return (
      <div className="page login-page">
        <div className="login-card">
          <h1>Setup required</h1>
          <p>
            This app needs a Supabase project to store your progress. Set{' '}
            <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> (see{' '}
            <code>webapp/README.md</code>) and rebuild.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page login-page">
      <form className="login-card" onSubmit={onSubmit}>
        <h1>LeetLocal</h1>
        <p className="login-sub">{mode === 'signin' ? 'Sign in' : 'Create an account'} to sync your progress across machines.</p>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          required
        />
        {error && <div className="login-error">{error}</div>}
        {info && <div className="login-info">{info}</div>}
        <button type="submit" className="run-btn" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
        </button>
        <button
          type="button"
          className="login-toggle"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin');
            setError(null);
            setInfo(null);
          }}
        >
          {mode === 'signin' ? "Need an account? Sign up" : 'Already have an account? Sign in'}
        </button>
      </form>
    </div>
  );
}
