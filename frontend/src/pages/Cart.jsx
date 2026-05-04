// ====== Cart Page ======
// Shows items in the cart, lets the user confirm/edit their delivery address,
// pick a payment method, and places the order.
// Delivery address is REQUIRED -- the Place Order button is disabled without it.
import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../api/index.js';
import { useState } from 'react';

// Maps the friendly label to the backend enum value
const PAYMENT_METHODS = [
  { label: 'Credit Card', value: 'CREDIT_CARD', icon: '💳' },
  { label: 'Cash on Delivery', value: 'CASH', icon: '💵' },
];

export default function Cart() {
  const { items, restaurantId, total, removeItem, clearCart } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // Pre-fill with the user's saved address, but let them override
  const [deliveryAddress, setDeliveryAddress] = useState(user?.address || '');
  // Track if they tried to submit without an address
  const [addressTouched, setAddressTouched] = useState(false);
  // Payment method -- default to credit card
  const [paymentMethod, setPaymentMethod] = useState('CREDIT_CARD');
  // Confirmation overlay state -- shown briefly after order success
  const [confirmation, setConfirmation] = useState(null);

  if (items.length === 0 && !confirmation) {
    return (
      <div className="empty-cart">
        <h2>Your cart is empty</h2>
        <p>Browse restaurants and add items to get started.</p>
        <button onClick={() => navigate('/')} className="btn btn-primary">Browse Restaurants</button>
      </div>
    );
  }

  const addressMissing = !deliveryAddress.trim();

  // Find the label for the currently selected payment method
  const selectedMethodLabel = PAYMENT_METHODS.find((m) => m.value === paymentMethod)?.label || paymentMethod;

  async function handleCheckout() {
    if (!user) { navigate('/login'); return; }
    // Show the validation error if they haven't filled in an address
    if (addressMissing) {
      setAddressTouched(true);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const orderItems = items.map((i) => ({ menu_item_id: i.id, qty: i.qty }));
      await api.post('/api/orders', {
        user_id: user.id,
        restaurant_id: restaurantId,
        items: orderItems,
        delivery_address: deliveryAddress.trim(),
        payment_method: paymentMethod,
      });
      clearCart();
      // Show a quick confirmation overlay before redirecting to orders
      setConfirmation({ method: selectedMethodLabel });
      setTimeout(() => {
        navigate('/orders');
      }, 2500);
    } catch (err) {
      setError(err.response?.data?.error || 'Checkout failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // ====== Payment Confirmation Overlay ======
  // Shown after a successful order for ~2.5 seconds
  if (confirmation) {
    return (
      <div className="payment-confirmation-overlay">
        <div className="payment-confirmation-box">
          <div className="payment-confirmation-icon">✅</div>
          <h2>Order placed!</h2>
          <p className="payment-confirmation-method">
            Payment: {confirmation.method} — <span className="payment-status-completed">COMPLETED</span>
          </p>
          <p className="payment-confirmation-redirect">Redirecting to your orders...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="cart-page">
      <h2>Your Cart</h2>
      {error && <p className="error-msg">{error}</p>}

      {/* ====== Item List ====== */}
      <ul className="cart-list">
        {items.map((item) => (
          <li key={item.id} className="cart-item">
            <span className="cart-item-name">{item.name}</span>
            {/* Qty display -- just show the count, remove with the button */}
            <div className="qty-controls">
              <span className="qty-count">x{item.qty}</span>
            </div>
            <span className="cart-item-price">${(item.price * item.qty).toFixed(2)}</span>
            <button
              onClick={() => removeItem(item.id)}
              className="btn btn-danger btn-sm"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      {/* ====== Order Summary ====== */}
      <div className="cart-summary">
        <div className="cart-summary-row">
          <span>Subtotal ({items.reduce((s, i) => s + i.qty, 0)} items)</span>
          <span>${total.toFixed(2)}</span>
        </div>
        <div className="cart-summary-row">
          <span>Delivery</span>
          <span>Free</span>
        </div>
        <div className="cart-summary-row total">
          <span>Total</span>
          <span>${total.toFixed(2)}</span>
        </div>
      </div>

      {/* ====== Delivery Address -- required! ====== */}
      <div className="cart-address">
        <div className="cart-address-header">
          <label htmlFor="delivery-address">📍 Delivery Address</label>
          <span className="cart-address-required">* Required</span>
        </div>
        <textarea
          id="delivery-address"
          value={deliveryAddress}
          onChange={(e) => {
            setDeliveryAddress(e.target.value);
            if (addressTouched && e.target.value.trim()) {
              setAddressTouched(false);
            }
          }}
          onBlur={() => setAddressTouched(true)}
          placeholder="Enter your full delivery address..."
          className={addressTouched && addressMissing ? 'invalid' : ''}
        />
        {addressTouched && addressMissing && (
          <p className="cart-address-error">⚠ Please enter a delivery address to continue</p>
        )}
      </div>

      {/* ====== Payment Method Selector ====== */}
      <div className="payment-method-selector">
        <p className="payment-method-label">💳 Payment Method</p>
        <div className="payment-method-options">
          {PAYMENT_METHODS.map((method) => (
            <label
              key={method.value}
              className={`payment-method-option${paymentMethod === method.value ? ' selected' : ''}`}
            >
              <input
                type="radio"
                name="payment-method"
                value={method.value}
                checked={paymentMethod === method.value}
                onChange={() => setPaymentMethod(method.value)}
              />
              <span className="payment-method-icon">{method.icon}</span>
              <span className="payment-method-name">{method.label}</span>
            </label>
          ))}
        </div>
      </div>

      <button
        onClick={handleCheckout}
        disabled={loading}
        className="btn btn-primary btn-lg"
        title={addressMissing ? 'Please enter a delivery address' : ''}
      >
        {loading ? 'Placing order...' : 'Place Order →'}
      </button>
    </div>
  );
}
