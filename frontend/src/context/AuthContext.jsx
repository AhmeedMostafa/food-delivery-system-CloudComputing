// ====== Auth Context ======
// Stores the logged-in user globally so any component can read it without prop drilling.
// Now also tracks role + restaurant_id for role-based access control.
import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/index.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On first load, try to restore the session from localStorage
  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    if (token && savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (_e) {
        // Corrupted user data -- just log them out
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }
    setLoading(false);
  }, []);

  async function login(email, password) {
    const resp = await api.post('/api/users/login', { email, password });
    const { user: loggedInUser, token } = resp.data;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(loggedInUser));
    setUser(loggedInUser);
    return loggedInUser;
  }

  // register now accepts the full payload including role + optional owner fields
  async function register(payload) {
    const resp = await api.post('/api/users/register', payload);
    const { user: newUser, token } = resp.data;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(newUser));
    setUser(newUser);
    return newUser;
  }

  // Update the cached user after a profile edit so the navbar stays in sync
  function updateUser(updatedUser) {
    setUser(updatedUser);
    localStorage.setItem('user', JSON.stringify(updatedUser));
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  }

  // ====== Role Helpers ======
  // These make the JSX cleaner: "if (isOwner)" instead of "if (user?.role === 'restaurant_owner')"
  const isOwner = user?.role === 'restaurant_owner';
  const isCustomer = user?.role === 'customer';
  const isDriver = user?.role === 'delivery_driver';

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser, isOwner, isCustomer, isDriver }}>
      {children}
    </AuthContext.Provider>
  );
}

// Quick convenience hook -- avoids importing useContext everywhere
export function useAuth() {
  return useContext(AuthContext);
}
