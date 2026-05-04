// ====== Menu Item Component ======
// Shows one menu item with image, name, description, price, and Add to Cart button.
// Unavailable items get a "Sold Out" overlay on the image.
import { useCart } from '../context/CartContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useNavigate } from 'react-router-dom';

export default function MenuItem({ item, restaurantId }) {
  const { addItem } = useCart();
  const { user, isOwner } = useAuth();
  const navigate = useNavigate();

  function handleAdd() {
    if (!user) {
      navigate('/login');
      return;
    }
    addItem({ id: item.id, name: item.name, price: parseFloat(item.price) }, restaurantId);
  }

  const isAvailable = item.is_available !== false;

  return (
    <div className="menu-item">
      {/* Image section with sold-out overlay if needed */}
      {item.image_url && (
        <div className={`menu-item-img-wrapper${!isAvailable ? ' sold-out' : ''}`}>
          <img
            src={item.image_url}
            alt={item.name}
            className="menu-item-img"
            onError={(e) => { e.target.closest('.menu-item-img-wrapper').style.display = 'none'; }}
          />
        </div>
      )}

      <div className="menu-item-info">
        <h4>{item.name}</h4>
        {item.description && <p className="menu-item-desc">{item.description}</p>}
        <div className="menu-item-footer">
          <span className="menu-item-price">${parseFloat(item.price).toFixed(2)}</span>
          {/* Owners viewing menus shouldn't be able to add to cart */}
          {!isOwner && (
            <button
              onClick={handleAdd}
              className="btn btn-primary btn-sm"
              disabled={!isAvailable}
            >
              {isAvailable ? '+ Add to Cart' : 'Sold Out'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
