// ====== Login Page ======
// Clean centered card form. Redirects owners to /dashboard, customers to /.
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const loggedInUser = await login(email, password);
      // Redirect based on role -- owners go straight to their dashboard
      if (loggedInUser.role === 'restaurant_owner') {
        navigate('/dashboard');
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <form onSubmit={handleSubmit} className="auth-form">
        <h2>Welcome back</h2>

        {error && <p className="error-msg">{error}</p>}

        <label>Email address
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoFocus
          />
        </label>

        <label>Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            required
          />
        </label>

        <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
          {loading ? 'Logging in...' : 'Log In'}
        </button>

        <p>No account yet? <Link to="/register">Sign up for free</Link></p>
      </form>
    </div>
  );
}
