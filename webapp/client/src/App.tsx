import { Routes, Route, NavLink } from 'react-router-dom';
import ProblemList from './pages/ProblemList';
import ProblemDetail from './pages/ProblemDetail';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import GithubCallback from './pages/GithubCallback';
import Login from './components/Login';
import { useAuth } from './lib/AuthProvider';
import { supabaseConfigured } from './lib/supabaseClient';

export default function App() {
  const { session, loading, signOut } = useAuth();

  if (supabaseConfigured && loading) {
    return <div className="page">Loading...</div>;
  }

  if (supabaseConfigured && !session) {
    return <Login />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <h2>LeetLocal</h2>
        <nav className="app-nav">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            Problems
          </NavLink>
          <NavLink to="/dashboard" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            Dashboard
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            Settings
          </NavLink>
        </nav>
        {session && (
          <div className="header-actions">
            <span className="header-email">{session.user.email}</span>
            <button onClick={signOut}>Sign out</button>
          </div>
        )}
      </header>
      <main>
        <Routes>
          <Route path="/" element={<ProblemList />} />
          <Route path="/problem/:id" element={<ProblemDetail />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/github/callback" element={<GithubCallback />} />
        </Routes>
      </main>
    </div>
  );
}
