// ====== Restaurant Card Component ======
// Displays a restaurant in the grid with image, name, cuisine badge, rating.
import { Link } from 'react-router-dom';

export default function RestaurantCard({ restaurant }) {
  return (
    <Link to={'/restaurant/' + restaurant.id} className="card restaurant-card">
      {/* Image wrapper with fixed aspect ratio to keep cards uniform */}
      <div className="card-img-wrapper">
        <img
          src={restaurant.image_url}
          alt={restaurant.name}
          className="card-img"
          onError={(e) => {
            e.target.src = 'https://placehold.co/600x375?text=Restaurant';
          }}
        />
      </div>
      <div className="card-body">
        <h3 className="card-title">{restaurant.name}</h3>
        <span className="card-cuisine">{restaurant.cuisine}</span>
        <div className="card-footer">
          <span className="rating">★ {restaurant.rating}</span>
          <span>{restaurant.address}</span>
        </div>
      </div>
    </Link>
  );
}
