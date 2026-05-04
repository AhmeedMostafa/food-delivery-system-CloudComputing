// ====== Home Page ======
// Fetches all restaurants and renders them in a grid.
// (This page is blocked for restaurant owners -- they get redirected to /dashboard)
import { useState, useEffect } from 'react';
import api from '../api/index.js';
import RestaurantCard from '../components/RestaurantCard.jsx';

export default function Home() {
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/api/restaurants')
      .then((resp) => setRestaurants(resp.data.restaurants))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading restaurants...</div>;
  if (error) return <div className="error-msg">Error: {error}</div>;

  return (
    <div>
      {/* ====== Hero Banner ====== */}
      <div className="hero">
        <div className="hero-content">
          <h1>Delicious food, delivered fast 🍕</h1>
          <p>Fresh meals from local restaurants, straight to your door</p>
        </div>
      </div>

      {/* ====== Restaurant Grid ====== */}
      <section className="restaurant-grid-section">
        <h2>Restaurants Near You</h2>
        <div className="restaurant-grid">
          {restaurants.map((r) => <RestaurantCard key={r.id} restaurant={r} />)}
        </div>
      </section>
    </div>
  );
}
