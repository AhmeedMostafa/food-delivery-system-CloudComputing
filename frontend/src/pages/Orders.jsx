// ====== Orders Page ======
// Shows a logged-in customer's order history with status badges.
// Displays delivery address, itemized list, and payment info per order.
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../api/index.js';

const STATUS_LABELS = {
  PLACED: 'Order Placed',
  ACCEPTED: 'Accepted',
  PREPARING: 'Preparing',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  DELIVERED: 'Delivered',
};

// Human-friendly labels for payment methods coming from the backend
const METHOD_LABELS = {
  CREDIT_CARD: 'Credit Card',
  DEBIT_CARD: 'Debit Card',
  CASH: 'Cash on Delivery',
  WALLET: 'Wallet',
};

const METHOD_ICONS = {
  CREDIT_CARD: '💳',
  DEBIT_CARD: '💳',
  CASH: '💵',
  WALLET: '👛',
};

// ====== Helper: fetch payment info for a single order ======
// Returns null if the payment record doesn't exist yet -- that's fine.
async function fetchPaymentForOrder(orderId) {
  try {
    const resp = await api.get(`/api/payments/order/${orderId}`);
    return resp.data.transaction;
  } catch {
    // 404 or network error -- just return null, no need to crash the whole page
    return null;
  }
}

export default function Orders() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Map of orderId -> payment transaction (or null if not found)
  const [payments, setPayments] = useState({});

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    api.get('/api/orders/user/' + user.id)
      .then(async (resp) => {
        const fetchedOrders = resp.data.orders;
        setOrders(fetchedOrders);

        // Fetch payment info for each order in parallel
        // We do this after setting orders so the list shows up immediately
        const paymentEntries = await Promise.all(
          fetchedOrders.map(async (order) => {
            const payment = await fetchPaymentForOrder(order.id);
            return [order.id, payment];
          })
        );
        setPayments(Object.fromEntries(paymentEntries));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [user]);

  if (loading) return <div className="loading">Loading orders...</div>;
  if (error) return <div className="error-msg">{error}</div>;

  if (orders.length === 0) {
    return (
      <div className="empty-orders">
        <h2>No orders yet</h2>
        <p>You haven&apos;t placed any orders yet.</p>
        <button onClick={() => navigate('/')} className="btn btn-primary">Order Now</button>
      </div>
    );
  }

  return (
    <div className="orders-page">
      <h2>Your Orders</h2>
      {orders.map((order) => {
        const payment = payments[order.id];
        const methodLabel = payment ? (METHOD_LABELS[payment.method] || payment.method) : null;
        const methodIcon = payment ? (METHOD_ICONS[payment.method] || '💳') : null;
        const statusLabel = payment ? (payment.status === 'COMPLETED' ? 'Completed' : payment.status) : null;

        return (
          <div key={order.id} className="order-card">
            <div className="order-card-header">
              <div>
                <span className="order-card-id">Order #{order.id}</span>
              </div>
              <span className={'status-badge status-' + order.status.toLowerCase()}>
                {STATUS_LABELS[order.status] || order.status}
              </span>
              <span className="order-card-price">${parseFloat(order.total_price).toFixed(2)}</span>
            </div>
            {order.delivery_address && (
              <p className="order-address">📍 {order.delivery_address}</p>
            )}

            {/* ====== Payment Info Badge ====== */}
            {payment ? (
              <div className={`payment-info payment-info-${payment.status.toLowerCase()}`}>
                <span>{methodIcon} {methodLabel}</span>
                <span className="payment-info-divider">—</span>
                <span className="payment-info-status">{statusLabel}</span>
              </div>
            ) : (
              // Show a subtle placeholder while we're still loading payment data
              // (or if no payment record exists -- shouldn't happen in practice)
              <div className="payment-info payment-info-pending">
                <span>💳 Payment info loading...</span>
              </div>
            )}

            <ul className="order-items">
              {order.items.map((item, idx) => (
                <li key={idx}>
                  {item.name} &times;{item.qty} — ${parseFloat(item.price).toFixed(2)} each
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
