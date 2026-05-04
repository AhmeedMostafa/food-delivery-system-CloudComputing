// ====== Dashboard Page ======
// Owner-only page. Shows:
//   1. Restaurant info header
//   2. Menu management -- add, edit, delete items
//   3. Incoming orders -- see all orders for this restaurant + update status
//
// This page does a fair amount on load: fetches restaurant info, menu, and orders.
// If any call fails it shows an error without blowing up the whole page.
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../api/index.js';

const VALID_STATUSES = ['PLACED', 'ACCEPTED', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED'];

const STATUS_LABELS = {
  PLACED: 'Placed',
  ACCEPTED: 'Accepted',
  PREPARING: 'Preparing',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  DELIVERED: 'Delivered',
};

// ====== Empty menu item form state ======
const EMPTY_ITEM_FORM = { name: '', description: '', price: '', image_url: '' };

export default function Dashboard() {
  const { user } = useAuth();
  const restaurantId = user?.restaurant_id;

  const [restaurant, setRestaurant] = useState(null);
  const [menuItems, setMenuItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loadingInit, setLoadingInit] = useState(true);
  const [error, setError] = useState(null);

  // ---- Menu item form state ----
  const [showItemForm, setShowItemForm] = useState(false);
  const [itemForm, setItemForm] = useState(EMPTY_ITEM_FORM);
  const [editingItemId, setEditingItemId] = useState(null); // null = adding new
  const [itemFormError, setItemFormError] = useState(null);
  const [itemFormLoading, setItemFormLoading] = useState(false);

  // ====== Load data on mount ======
  const loadData = useCallback(async () => {
    if (!restaurantId) return;
    try {
      const [restResp, menuResp, ordersResp, driversResp] = await Promise.all([
        api.get(`/api/restaurants/${restaurantId}`),
        api.get(`/api/restaurants/${restaurantId}/menu`),
        api.get(`/api/orders/restaurant/${restaurantId}`),
        api.get('/api/users/drivers'),
      ]);
      setRestaurant(restResp.data.restaurant);
      setMenuItems(menuResp.data.menu);
      setOrders(ordersResp.data.orders);
      // Store drivers so we can show names in the dropdown
      setDrivers(driversResp.data.drivers);
    } catch (err) {
      setError('Could not load dashboard data: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoadingInit(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ====== Menu Item CRUD ======
  function openAddForm() {
    setItemForm(EMPTY_ITEM_FORM);
    setEditingItemId(null);
    setItemFormError(null);
    setShowItemForm(true);
  }

  function openEditForm(item) {
    setItemForm({
      name: item.name,
      description: item.description || '',
      price: String(item.price),
      image_url: item.image_url || '',
    });
    setEditingItemId(item.id);
    setItemFormError(null);
    setShowItemForm(true);
  }

  function cancelForm() {
    setShowItemForm(false);
    setEditingItemId(null);
    setItemFormError(null);
  }

  async function handleItemFormSubmit(e) {
    e.preventDefault();
    setItemFormError(null);
    setItemFormLoading(true);
    try {
      if (editingItemId) {
        // Editing an existing item
        const resp = await api.put(`/api/menu-items/${editingItemId}`, {
          name: itemForm.name,
          description: itemForm.description || null,
          price: parseFloat(itemForm.price),
          image_url: itemForm.image_url || null,
        });
        setMenuItems((prev) =>
          prev.map((i) => (i.id === editingItemId ? resp.data.item : i))
        );
      } else {
        // Adding a new item
        const resp = await api.post(`/api/restaurants/${restaurantId}/menu`, {
          name: itemForm.name,
          description: itemForm.description || null,
          price: parseFloat(itemForm.price),
          image_url: itemForm.image_url || null,
        });
        setMenuItems((prev) => [...prev, resp.data.item]);
      }
      setShowItemForm(false);
      setEditingItemId(null);
    } catch (err) {
      setItemFormError(err.response?.data?.error || 'Failed to save menu item');
    } finally {
      setItemFormLoading(false);
    }
  }

  async function handleDeleteItem(itemId) {
    if (!window.confirm('Delete this menu item?')) return;
    try {
      await api.delete(`/api/menu-items/${itemId}`);
      setMenuItems((prev) => prev.filter((i) => i.id !== itemId));
    } catch (err) {
      alert('Failed to delete: ' + (err.response?.data?.error || err.message));
    }
  }

  // ====== Order Status Updates ======
  async function handleStatusChange(orderId, newStatus) {
    try {
      const resp = await api.patch(`/api/orders/${orderId}/status`, { status: newStatus });
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: resp.data.order.status } : o))
      );
    } catch (err) {
      alert('Failed to update status: ' + (err.response?.data?.error || err.message));
    }
  }

  // ====== Driver Assignment ======
  // Called when the owner picks a driver from the dropdown.
  // Sends PATCH /api/orders/:id/assign and updates local state so the row
  // immediately reflects the assigned driver without a full reload.
  async function handleAssignDriver(orderId, driverId) {
    if (!driverId) return; // user selected the placeholder option
    try {
      const resp = await api.patch(`/api/orders/${orderId}/assign`, {
        driver_id: parseInt(driverId, 10),
      });
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, driver_id: resp.data.order.driver_id } : o))
      );
    } catch (err) {
      alert('Failed to assign driver: ' + (err.response?.data?.error || err.message));
    }
  }

  // ====== Render ======
  if (loadingInit) return <div className="loading">Loading dashboard...</div>;
  if (error) return <div className="error-msg" style={{ margin: 24 }}>{error}</div>;
  if (!restaurant) return <div className="loading">No restaurant found.</div>;

  return (
    <div className="dashboard-page">

      {/* ====== Restaurant Header ====== */}
      <div className="dashboard-header">
        <div className="dashboard-header-info">
          <h1>{restaurant.name}</h1>
          <p>{restaurant.cuisine} · {restaurant.address || 'No address set'}</p>
          <p className="rating">★ {restaurant.rating}</p>
        </div>
      </div>

      {/* ====== Menu Management ====== */}
      <section className="dashboard-section">
        <div className="dashboard-section-header">
          <h2>Menu Items</h2>
          <button className="btn btn-primary" onClick={openAddForm}>+ Add Item</button>
        </div>

        {/* ---- Inline form for add/edit ---- */}
        {showItemForm && (
          <form className="item-form" onSubmit={handleItemFormSubmit}>
            <h3>{editingItemId ? 'Edit Item' : 'New Menu Item'}</h3>
            {itemFormError && <p className="error-msg">{itemFormError}</p>}
            <div className="item-form-grid">
              <label>Name
                <input
                  value={itemForm.name}
                  onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                  required
                />
              </label>
              <label>Price ($)
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={itemForm.price}
                  onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })}
                  required
                />
              </label>
              <label style={{ gridColumn: '1 / -1' }}>Description
                <input
                  value={itemForm.description}
                  onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                  placeholder="Optional"
                />
              </label>
              <label style={{ gridColumn: '1 / -1' }}>Image URL
                <input
                  value={itemForm.image_url}
                  onChange={(e) => setItemForm({ ...itemForm, image_url: e.target.value })}
                  placeholder="Optional -- https://..."
                />
              </label>
            </div>
            <div className="item-form-actions">
              <button type="submit" className="btn btn-primary" disabled={itemFormLoading}>
                {itemFormLoading ? 'Saving...' : (editingItemId ? 'Save Changes' : 'Add Item')}
              </button>
              <button type="button" className="btn btn-secondary" onClick={cancelForm}>Cancel</button>
            </div>
          </form>
        )}

        {menuItems.length === 0 ? (
          <p className="dashboard-empty">No menu items yet. Add your first item above.</p>
        ) : (
          <div className="menu-management-grid">
            {menuItems.map((item) => (
              <div key={item.id} className="menu-mgmt-card">
                {item.image_url && (
                  <img src={item.image_url} alt={item.name} className="menu-mgmt-img" />
                )}
                <div className="menu-mgmt-body">
                  <h4>{item.name}</h4>
                  {item.description && <p>{item.description}</p>}
                  <p className="menu-mgmt-price">${parseFloat(item.price).toFixed(2)}</p>
                  <p className="menu-mgmt-avail">{item.is_available ? 'Available' : 'Unavailable'}</p>
                </div>
                <div className="menu-mgmt-actions">
                  <button className="btn btn-secondary btn-sm" onClick={() => openEditForm(item)}>Edit</button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDeleteItem(item.id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ====== Incoming Orders ====== */}
      <section className="dashboard-section">
        <div className="dashboard-section-header">
          <h2>Incoming Orders</h2>
          <button className="btn btn-secondary btn-sm" onClick={loadData}>Refresh</button>
        </div>

        {orders.length === 0 ? (
          <p className="dashboard-empty">No orders yet.</p>
        ) : (
          <div className="orders-table-wrapper">
            <table className="orders-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>User</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Address</th>
                  <th>Driver</th>
                  <th>Status</th>
                  <th>Update Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td>{order.id}</td>
                    <td>User #{order.user_id}</td>
                    <td>
                      {order.items.map((it, i) => (
                        <span key={i} className="order-item-tag">{it.name} x{it.qty}</span>
                      ))}
                    </td>
                    <td>${parseFloat(order.total_price).toFixed(2)}</td>
                    <td className="order-address-cell">{order.delivery_address || '—'}</td>
                    <td className="order-driver-cell">
                      {order.driver_id ? (
                        // Driver already assigned -- show their name + a "change" link
                        <span className="driver-assigned">
                          {drivers.find((d) => d.id === order.driver_id)?.name || `Driver #${order.driver_id}`}
                          {' '}
                          <button
                            className="driver-change-btn"
                            onClick={() =>
                              setOrders((prev) =>
                                prev.map((o) =>
                                  o.id === order.id ? { ...o, driver_id: null } : o
                                )
                              )
                            }
                          >
                            change
                          </button>
                        </span>
                      ) : (
                        // No driver yet -- show a dropdown to pick one
                        <select
                          className="driver-select"
                          defaultValue=""
                          onChange={(e) => handleAssignDriver(order.id, e.target.value)}
                        >
                          <option value="" disabled>-- Assign Driver --</option>
                          {drivers.map((d) => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td>
                      <span className={'status-badge status-' + order.status.toLowerCase()}>
                        {STATUS_LABELS[order.status] || order.status}
                      </span>
                    </td>
                    <td>
                      {order.status !== 'DELIVERED' && (
                        <select
                          className="status-select"
                          value={order.status}
                          onChange={(e) => handleStatusChange(order.id, e.target.value)}
                        >
                          {VALID_STATUSES.map((s) => (
                            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                          ))}
                        </select>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
