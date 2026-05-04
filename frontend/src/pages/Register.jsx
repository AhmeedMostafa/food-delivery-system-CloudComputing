// ====== Register Page ======
// Supports customer, restaurant_owner, and delivery_driver registration.
// Role selector uses card-style buttons for a cleaner look.
// If "I'm a Restaurant Owner" is selected, extra fields appear.
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Register() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    address: '',
    role: 'customer',
    restaurant_name: '',
    cuisine: '',
  });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      // Build the payload -- only include owner fields if needed
      const payload = {
        name: form.name,
        email: form.email,
        password: form.password,
        phone: form.phone || undefined,
        address: form.address || undefined,
        role: form.role,
      };
      if (form.role === 'restaurant_owner') {
        payload.restaurant_name = form.restaurant_name;
        payload.cuisine = form.cuisine || undefined;
      }

      const newUser = await register(payload);

      // Redirect based on role -- each role has their own landing page
      if (newUser.role === 'restaurant_owner') {
        navigate('/dashboard');
      } else if (newUser.role === 'delivery_driver') {
        navigate('/deliveries');
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <form onSubmit={handleSubmit} className="auth-form">
        <h2>Create Account</h2>
        {error && <p className="error-msg">{error}</p>}

        {/* ====== Role Selector ====== */}
        <div>
          <p className="form-section-label" style={{ marginBottom: 8 }}>I am a...</p>
          <div className="role-selector">
            <button
              type="button"
              className={`role-btn${form.role === 'customer' ? ' role-btn-active' : ''}`}
              onClick={() => setForm({ ...form, role: 'customer' })}
            >
              <span className="role-btn-icon">🛒</span>
              Customer
            </button>
            <button
              type="button"
              className={`role-btn${form.role === 'restaurant_owner' ? ' role-btn-active' : ''}`}
              onClick={() => setForm({ ...form, role: 'restaurant_owner' })}
            >
              <span className="role-btn-icon">🍳</span>
              Restaurant Owner
            </button>
            <button
              type="button"
              className={`role-btn${form.role === 'delivery_driver' ? ' role-btn-active' : ''}`}
              onClick={() => setForm({ ...form, role: 'delivery_driver' })}
            >
              <span className="role-btn-icon">🚗</span>
              Delivery Driver
            </button>
          </div>
        </div>

        <label>Full Name
          <input name="name" value={form.name} onChange={handleChange} placeholder="Your name" required />
        </label>
        <label>Email address
          <input type="email" name="email" value={form.email} onChange={handleChange} placeholder="you@example.com" required />
        </label>
        <label>Password
          <input type="password" name="password" value={form.password} onChange={handleChange} placeholder="Min 6 characters" required minLength={6} />
        </label>
        <label>Phone (optional)
          <input name="phone" value={form.phone} onChange={handleChange} placeholder="+1 555 000 0000" />
        </label>
        <label>{form.role === 'restaurant_owner' ? 'Business Address (optional)' : 'Address (optional)'}
          <input name="address" value={form.address} onChange={handleChange} placeholder="Your address" />
        </label>

        {/* ====== Restaurant Owner Extra Fields ====== */}
        {form.role === 'restaurant_owner' && (
          <>
            <hr className="form-divider" />
            <p className="form-section-label">Restaurant Details</p>
            <label>Restaurant Name
              <input name="restaurant_name" value={form.restaurant_name} onChange={handleChange} placeholder="e.g. The Golden Fork" required />
            </label>
            <label>Cuisine Type (optional)
              <input name="cuisine" placeholder="e.g. Italian, Japanese..." value={form.cuisine} onChange={handleChange} />
            </label>
          </>
        )}

        <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
          {loading ? 'Creating account...' : 'Create Account'}
        </button>
        <p>Already have an account? <Link to="/login">Log in</Link></p>
      </form>
    </div>
  );
}
