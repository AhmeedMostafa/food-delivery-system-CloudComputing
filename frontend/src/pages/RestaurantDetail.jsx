// ====== Restaurant Detail Page ======
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/index.js';
import MenuItem from '../components/MenuItem.jsx';

export default function RestaurantDetail() {
  const { id } = useParams();
  const [restaurant, setRestaurant] = useState(null);
  const [menu, setMenu] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/api/restaurants/' + id)
      .then((resp) => {
        setRestaurant(resp.data.restaurant);
        setMenu(resp.data.menu);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="loading">Loading...</div>;
  if (error) return <div className="error-msg">Error: {error}</div>;
  if (!restaurant) return null;

  return (
    <div className="restaurant-detail">
      <div className="restaurant-hero" style={{ backgroundImage: `url(${restaurant.image_url})` }}>
        <div className="restaurant-hero-overlay">
          <h1>{restaurant.name}</h1>
          <p>{restaurant.cuisine} &bull; &#9733; {restaurant.rating}</p>
        </div>
      </div>
      <section className="menu-section">
        <h2>Menu</h2>
        <div className="menu-list">
          {menu.map((item) => (
            <MenuItem key={item.id} item={item} restaurantId={parseInt(id, 10)} />
          ))}
        </div>
      </section>
    </div>
  );
}
