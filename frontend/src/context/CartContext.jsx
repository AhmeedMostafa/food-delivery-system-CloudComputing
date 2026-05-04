// ====== Cart Context ======
// A simple in-memory cart. We could persist to localStorage,
// but for a demo, keeping it in memory is fine.
import { createContext, useContext, useState } from 'react';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  // items: [{ id, restaurant_id, name, price, qty }]
  const [items, setItems] = useState([]);
  // Keep track of which restaurant the cart belongs to
  // (You can only order from one restaurant at a time)
  const [restaurantId, setRestaurantId] = useState(null);

  function addItem(item, restId) {
    // If adding from a different restaurant, clear the cart first
    if (restaurantId && restId !== restaurantId) {
      if (!window.confirm('Your cart has items from another restaurant. Clear it and start a new cart?')) {
        return;
      }
      setItems([]);
      setRestaurantId(restId);
    }

    setRestaurantId(restId);
    setItems((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (existing) {
        return prev.map((i) => i.id === item.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { ...item, qty: 1 }];
    });
  }

  function removeItem(itemId) {
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  }

  function clearCart() {
    setItems([]);
    setRestaurantId(null);
  }

  const total = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const itemCount = items.reduce((sum, i) => sum + i.qty, 0);

  return (
    <CartContext.Provider value={{ items, restaurantId, total, itemCount, addItem, removeItem, clearCart }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
