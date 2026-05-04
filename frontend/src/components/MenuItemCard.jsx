// ====== MenuItemCard Component ======
// Renders a single menu item with image, name, description, price, and Add to Cart button.
import { useCart } from '../context/CartContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useNavigate } from 'react-router-dom';

export default function MenuItemCard({ item, restaurantId }) {
  const { addItem } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();

  function handleAdd() {
    if (!user) {
      navigate('/login');
      return;
    }
    addItem({ id: item.id, name: item.name, price: parseFloat(item.price) }, restaurantId);
  }

  return (
    <div className="menu-item">
      {item.image_url && (
        <img
          src={item.image_url}
          alt={item.name}
          className="menu-item-img"
          onError={(e) => { e.target.style.display = 'none'; }}
        />
      )}
      <div className="menu-item-info">
        <h4>{item.name}</h4>
        <p className="menu-item-desc">{item.description}</p>
        <div className="menu-item-footer">
          <span className="menu-item-price">${parseFloat(item.price).toFixed(2)}</span>
          <button onClick={handleAdd} className="btn btn-primary btn-sm">Add to Cart</button>
        </div>
      </div>
    </div>
  );
}
