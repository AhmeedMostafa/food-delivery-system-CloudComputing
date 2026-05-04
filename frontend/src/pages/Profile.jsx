// ====== Profile Page ======
// Lets any logged-in user view and edit their profile:
// name, email, phone, address, and optionally change their password.
// Grouped into clear sections with labels.
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../api/index.js';

export default function Profile() {
  const { user, updateUser } = useAuth();
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    current_password: '',
    password: '',
    password_confirm: '',
  });
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Pre-fill the form with whatever we have on the user object
  useEffect(() => {
    if (user) {
      setForm((prev) => ({
        ...prev,
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
        address: user.address || '',
      }));
    }
  }, [user]);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
    // Clear messages when they start typing again
    setSuccess(null);
    setError(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Quick client-side check before sending
    if (form.password && form.password !== form.password_confirm) {
      setError('New passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name: form.name,
        email: form.email,
        phone: form.phone,
        address: form.address,
      };

      // Only include password fields if they filled in the change section
      if (form.password) {
        payload.current_password = form.current_password;
        payload.password = form.password;
      }

      const resp = await api.put('/api/users/me', payload);
      const updatedUser = resp.data.user;

      // Sync the context so the navbar shows the new name right away
      updateUser(updatedUser);

      // Reset password fields after a successful change
      setForm((prev) => ({ ...prev, current_password: '', password: '', password_confirm: '' }));
      setSuccess('Profile updated successfully.');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  }

  if (!user) return null;

  return (
    <div className="profile-page">
      <form onSubmit={handleSubmit} className="profile-form">

        {/* ====== Header section ====== */}
        <div className="profile-section">
          <p className="profile-section-title">Account</p>
          <div style={{ marginBottom: 16 }}>
            <span className="profile-role-badge">
              {user.role === 'restaurant_owner' ? '🍳 Restaurant Owner' : '🛒 Customer'}
            </span>
          </div>

          {success && <p className="success-msg">{success}</p>}
          {error && <p className="error-msg">{error}</p>}
        </div>

        {/* ====== Personal Info Section ====== */}
        <div className="profile-section">
          <p className="profile-section-title">Personal Info</p>

          <div className="profile-field">
            <label htmlFor="profile-name">Full Name</label>
            <input id="profile-name" name="name" value={form.name} onChange={handleChange} required />
          </div>

          <div className="profile-field">
            <label htmlFor="profile-email">Email address</label>
            <input id="profile-email" type="email" name="email" value={form.email} onChange={handleChange} required />
          </div>

          <div className="profile-field">
            <label htmlFor="profile-phone">Phone</label>
            <input id="profile-phone" name="phone" value={form.phone} onChange={handleChange} placeholder="Optional" />
          </div>

          <div className="profile-field">
            <label htmlFor="profile-address">Delivery Address</label>
            <input id="profile-address" name="address" value={form.address} onChange={handleChange} placeholder="Optional" />
          </div>
        </div>

        {/* ====== Password Change Section ====== */}
        <div className="profile-section">
          <p className="profile-section-title">Change Password</p>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 16 }}>
            Leave blank to keep your current password.
          </p>

          <div className="profile-field">
            <label htmlFor="profile-current-pw">Current Password</label>
            <input
              id="profile-current-pw"
              type="password"
              name="current_password"
              value={form.current_password}
              onChange={handleChange}
              placeholder="Required to change password"
            />
          </div>

          <div className="profile-field">
            <label htmlFor="profile-new-pw">New Password</label>
            <input
              id="profile-new-pw"
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              minLength={6}
              placeholder="Min 6 characters"
            />
          </div>

          <div className="profile-field">
            <label htmlFor="profile-confirm-pw">Confirm New Password</label>
            <input
              id="profile-confirm-pw"
              type="password"
              name="password_confirm"
              value={form.password_confirm}
              onChange={handleChange}
              placeholder="Repeat new password"
            />
          </div>
        </div>

        {/* ====== Save Button ====== */}
        <div className="profile-form-footer">
          <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

      </form>
    </div>
  );
}
