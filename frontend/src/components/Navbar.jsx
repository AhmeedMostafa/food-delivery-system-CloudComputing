// ====== Navbar Component ======
// Adapts based on user role:
//   - Guests: Login + Sign Up
//   - Customers: Home, My Orders, Cart (with badge), Profile, Logout
//   - Owners: Dashboard, Profile, Logout (no Home, no Cart -- owners don't order)
//   - Drivers: Deliveries, Profile, Logout (no cart, no browsing)
// Also includes the dark/light mode toggle.
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';

export default function Navbar() {
  const { user, logout, isOwner, isCustomer, isDriver } = useAuth();
  const { itemCount } = useCart();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/');
  }

  // Decide where the logo links to based on role
  function getHomeLink() {
    if (isOwner) return '/dashboard';
    if (isDriver) return '/deliveries';
    return '/';
  }

  return (
    <nav className="navbar">
      {/* Brand -- role-aware logo link */}
      <Link to={getHomeLink()} className="navbar-brand">
        🍔 FoodieGo
      </Link>

      <div className="navbar-links">
        {user ? (
          <>
            {/* Customer-only links */}
            {isCustomer && (
              <>
                <NavLink to="/" end>Home</NavLink>
                <NavLink to="/orders">My Orders</NavLink>
                <NavLink to="/cart" className="cart-link">
                  🛒 Cart
                  {itemCount > 0 && (
                    // key trick: changes key when count changes to retrigger the pop animation
                    <span className="cart-badge" key={itemCount}>{itemCount}</span>
                  )}
                </NavLink>
              </>
            )}

            {/* Owner-only links */}
            {isOwner && (
              <NavLink to="/dashboard">Dashboard</NavLink>
            )}

            {/* Driver-only links */}
            {isDriver && (
              <NavLink to="/deliveries">Deliveries</NavLink>
            )}

            {/* All logged-in users */}
            <NavLink to="/profile">Profile</NavLink>
            <span className="navbar-user">{user.name}</span>
            <button onClick={handleLogout} className="btn btn-outline btn-sm">Logout</button>
          </>
        ) : (
          <>
            <Link to="/login">Login</Link>
            <Link to="/register" className="btn btn-primary btn-sm">Sign Up</Link>
          </>
        )}

        {/* Dark mode toggle -- always visible */}
        <button
          onClick={toggleTheme}
          className="theme-toggle"
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label="Toggle dark mode"
        >
          {isDark ? '☀️' : '🌙'}
        </button>
      </div>
    </nav>
  );
}
