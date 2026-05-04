// ====== Deliveries Page ======
// Only accessible to delivery_driver role.
// Shows orders assigned to this driver and lets them update status
// to OUT_FOR_DELIVERY or DELIVERED.
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../api/index.js';

// Driver can only set these two statuses -- restaurants handle the earlier ones
const DRIVER_STATUSES = ['OUT_FOR_DELIVERY', 'DELIVERED'];

// Maps status values to human-friendly labels + color classes
const STATUS_INFO = {
  PLACED: { label: 'Placed', color: 'status-placed' },
  ACCEPTED: { label: 'Accepted', color: 'status-accepted' },
  PREPARING: { label: 'Preparing', color: 'status-preparing' },
  OUT_FOR_DELIVERY: { label: 'Out for Delivery', color: 'status-out' },
  DELIVERED: { label: 'Delivered', color: 'status-delivered' },
};

export default function Deliveries() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Tracks which order is being updated so we can show a spinner on just that row
  const [updatingOrderId, setUpdatingOrderId] = useState(null);

  const loadOrders = useCallback(async () => {
    try {
      setError(null);
      const resp = await api.get(`/api/orders/driver/${user.id}`);
      setOrders(resp.data.orders || []);
    } catch (err) {
      setError('Could not load your deliveries. Try refreshing.');
      console.error('[deliveries]', err.message);
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  async function updateStatus(orderId, newStatus) {
    setUpdatingOrderId(orderId);
    try {
      const resp = await api.patch(`/api/orders/${orderId}/status`, { status: newStatus });
      // Update the local state so the UI reflects the change immediately
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: resp.data.order.status } : o))
      );
    } catch (err) {
      alert('Failed to update order status: ' + (err.response?.data?.error || err.message));
    } finally {
      setUpdatingOrderId(null);
    }
  }

  if (loading) {
    return <div className="container" style={{ padding: '2rem' }}>Loading your deliveries...</div>;
  }

  return (
    <div className="container" style={{ padding: '2rem' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>My Deliveries</h1>
        <p style={{ color: 'var(--text-light)', marginTop: '0.25rem' }}>
          Orders assigned to you. Update status once you pick up or deliver.
        </p>
      </div>

      {error && <p className="error-msg">{error}</p>}

      {orders.length === 0 ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <p style={{ fontSize: '2rem' }}>🚗</p>
          <p>No deliveries assigned to you yet.</p>
          <p style={{ color: 'var(--text-light)', fontSize: '0.9rem' }}>
            Restaurant owners assign orders to drivers. Check back soon.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {orders.map((order) => {
            const statusInfo = STATUS_INFO[order.status] || { label: order.status, color: '' };
            const isUpdating = updatingOrderId === order.id;

            return (
              <div key={order.id} className="card" style={{ padding: '1.25rem' }}>
                {/* ====== Order Header ====== */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>Order #{order.id}</span>
                    <span className={`status-badge ${statusInfo.color}`} style={{ marginLeft: '0.75rem' }}>
                      {statusInfo.label}
                    </span>
                  </div>
                  <span style={{ color: 'var(--text-light)', fontSize: '0.85rem' }}>
                    {new Date(order.created_at).toLocaleString()}
                  </span>
                </div>

                {/* ====== Delivery Address ====== */}
                {order.delivery_address && (
                  <p style={{ margin: '0.5rem 0', fontSize: '0.9rem' }}>
                    <strong>Deliver to:</strong> {order.delivery_address}
                  </p>
                )}

                {/* ====== Order Items ====== */}
                {order.items && order.items.length > 0 && (
                  <div style={{ margin: '0.5rem 0', fontSize: '0.85rem', color: 'var(--text-light)' }}>
                    {order.items.map((item, idx) => (
                      <span key={idx}>
                        {item.qty}x {item.name}
                        {idx < order.items.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <span style={{ fontWeight: 600, color: 'var(--primary)' }}>
                    ${parseFloat(order.total_price).toFixed(2)}
                  </span>

                  {/* ====== Status Update Buttons ====== */}
                  {/* Only show status buttons the driver is allowed to set */}
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {DRIVER_STATUSES.map((targetStatus) => {
                      // Don't show a button if the order is already at or past that status
                      const alreadyAt = order.status === targetStatus || order.status === 'DELIVERED';
                      if (alreadyAt) return null;
                      return (
                        <button
                          key={targetStatus}
                          className="btn btn-primary btn-sm"
                          disabled={isUpdating}
                          onClick={() => updateStatus(order.id, targetStatus)}
                        >
                          {isUpdating ? '...' : (
                            targetStatus === 'OUT_FOR_DELIVERY' ? 'Mark Picked Up' : 'Mark Delivered'
                          )}
                        </button>
                      );
                    })}
                    {order.status === 'DELIVERED' && (
                      <span style={{ color: 'var(--success, #28a745)', fontSize: '0.9rem', fontWeight: 600 }}>
                        Completed
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
