// ====== App Router ======
// Includes route guards for role-based pages.
// Owners go to /dashboard, customers go to /orders + /cart, drivers go to /deliveries.
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth, AuthProvider } from './context/AuthContext.jsx';
import { CartProvider } from './context/CartContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import Navbar from './components/Navbar.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import RestaurantDetail from './pages/RestaurantDetail.jsx';
import Orders from './pages/Orders.jsx';
import Cart from './pages/Cart.jsx';
import Profile from './pages/Profile.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Deliveries from './pages/Deliveries.jsx';

// ====== Route Guard Components ======
// These make it easy to protect routes based on auth state + role.

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RequireOwner({ children }) {
  const { user, loading, isOwner } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!isOwner) return <Navigate to="/" replace />;
  return children;
}

function RequireCustomer({ children }) {
  const { user, loading, isCustomer } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  // owners and drivers shouldn't land on customer-only pages
  if (!isCustomer) {
    // send each role to their own home
    if (user.role === 'restaurant_owner') return <Navigate to="/dashboard" replace />;
    if (user.role === 'delivery_driver') return <Navigate to="/deliveries" replace />;
    return <Navigate to="/" replace />;
  }
  return children;
}

function RequireDriver({ children }) {
  const { user, loading, isDriver } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!isDriver) return <Navigate to="/" replace />;
  return children;
}

// Block non-customer roles from browsing restaurants / home grid
function CustomerOnly({ children }) {
  const { user, loading, isOwner, isDriver } = useAuth();
  if (loading) return null;
  // Owners go to their dashboard, drivers go to their deliveries
  if (user && isOwner) return <Navigate to="/dashboard" replace />;
  if (user && isDriver) return <Navigate to="/deliveries" replace />;
  return children;
}

function AppRoutes() {
  return (
    <>
      <Navbar />
      <main className="main-content">
        <Routes>
          {/* Home + restaurant browsing is only for customers / guests */}
          <Route path="/" element={<CustomerOnly><Home /></CustomerOnly>} />
          <Route path="/restaurant/:id" element={<CustomerOnly><RestaurantDetail /></CustomerOnly>} />

          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Customer-only routes */}
          <Route path="/orders" element={<RequireCustomer><Orders /></RequireCustomer>} />
          <Route path="/cart" element={<RequireCustomer><Cart /></RequireCustomer>} />

          {/* Owner-only routes */}
          <Route path="/dashboard" element={<RequireOwner><Dashboard /></RequireOwner>} />

          {/* Driver-only routes */}
          <Route path="/deliveries" element={<RequireDriver><Deliveries /></RequireDriver>} />

          {/* Any logged-in user */}
          <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <CartProvider>
          <AppRoutes />
        </CartProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
