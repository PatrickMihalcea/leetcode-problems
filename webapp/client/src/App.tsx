import { Routes, Route } from 'react-router-dom';
import ProblemList from './pages/ProblemList';
import ProblemDetail from './pages/ProblemDetail';
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
        </Routes>
      </main>
    </div>
  );
}
