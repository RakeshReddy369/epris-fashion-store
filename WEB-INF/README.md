# EPRIS Fashion Store

A modern, full-stack e-commerce fashion storefront built with vanilla JavaScript, Node.js, and Express.

## 🎯 Project Overview

EPRIS is a complete fashion e-commerce platform featuring:
- **User Authentication** - Secure signup/login with JWT tokens
- **Product Catalog** - Browse men's and women's fashion items
- **Shopping Cart** - Add/remove items, persistent storage
- **Wishlist** - Save favorite items for later
- **Checkout Flow** - Multi-step shipping, delivery, and payment
- **Order Management** - View order history and track status
- **User Profile** - Manage account, addresses, and order history
- **Payment Integration** - Support for multiple payment methods including COD

## 📁 Project Structure

```
Fashion_Website/
├── WEB-INF/
│   ├── index.html                 # Homepage
│   ├── product-detail.html        # Product detail page
│   ├── cart.html                  # Shopping cart
│   ├── checkout.html              # Multi-step checkout
│   ├── order-confirmation.html    # Order confirmation
│   ├── profile.html               # User profile & orders
│   ├── login.html                 # Login page
│   ├── signup.html                # Registration page
│   ├── wishlist.html              # Wishlist page
│   ├── admin.html                 # Admin dashboard
│   ├── style.css                  # Main styling
│   ├── script.js                  # Core JavaScript
│   ├── interactive-features.js    # Cart counter, toast notifications
│   ├── api-client.js              # API wrapper & auth
│   └── api/
│       ├── server.js              # Express server
│       ├── store.js               # Database abstraction
│       ├── products.js            # Product data
│       ├── package.json           # Node dependencies
│       └── data/
│           └── db.json            # Local JSON database
```

## 🚀 Quick Start

### Prerequisites
- Node.js v14+ (for backend)
- Python 3.x (for frontend server, optional)
- A modern web browser

### Installation

1. **Clone/Extract the Project**
   ```bash
   cd Fashion_Website/WEB-INF
   ```

2. **Install Backend Dependencies**
   ```bash
   cd api
   npm install
   cd ..
   ```

3. **Start the Backend API** (in one terminal)
   ```bash
   cd api
   node server.js
   # API will run on http://localhost:3000
   ```

   Configure `GOOGLE_CLIENT_ID` before starting the API to enable Google sign-in. See [Google sign-in setup](./api/README.md#google-sign-in-setup).

4. **Start the Frontend Server** (in another terminal)
   ```bash
   # Option 1: Using Python
   python -m http.server 8000
   
   # Option 2: Using Node (with live-server)
   npx live-server --port=8000
   
   # Option 3: Using VS Code Live Server extension
   # Right-click index.html → Open with Live Server
   ```

5. **Access the Application**
   - Open http://localhost:8000 in your browser
   - Backend API: http://localhost:3000

## 🔐 Authentication

### Signup
- **Endpoint**: `POST /api/auth/register`
- **Required Fields**: name, email, password, phone
- **Returns**: JWT token, user object

### Login
- **Endpoint**: `POST /api/auth/login`
- **Required Fields**: email, password
- **Returns**: JWT token, user object

### How It Works
1. User creates account → JWT token stored in localStorage
2. Token sent in `Authorization: Bearer <token>` header for authenticated requests
3. Token validated on every protected endpoint

## 🛍️ Core Features

### 1. Product Browsing
- Homepage displays featured and new arrivals
- Product detail pages with images, descriptions, and prices
- Filter by category (Men, Women, Shoes)

### 2. Shopping Cart
- Add items with color and size selection
- View cart with item quantities and pricing
- Persistent storage in localStorage and backend sync
- Real-time cart counter in navigation

### 3. Checkout Process
**Step 1: Shipping Address**
- Enter delivery address
- Save addresses to account
- Select saved address for quick checkout

**Step 2: Delivery Method**
- Standard (₹100, 5-7 days)
- Express (₹200, 2-3 days)
- Overnight (₹350, 1 day)
- Free (7-10 days for orders >₹500)

**Step 3: Payment Method**
- Credit/Debit Card
- UPI (Google Pay, PhonePe, Paytm)
- Digital Wallet (Amazon Pay, Mobikwik)
- Net Banking
- Cash on Delivery (COD)

**Step 4: Review & Place Order**
- Review all order details
- Accept terms & conditions
- Place order

### 4. Order Management
- View order history on profile page
- Track order status (Confirmed → Processing → Shipped → Delivered)
- Download/print order confirmation
- Estimated delivery dates

### 5. Wishlist
- Add items to wishlist
- Remove items
- Move items from wishlist to cart
- Persistent wishlist storage

### 6. User Profile
- View personal information
- Manage saved addresses
- View complete order history
- Change password
- Update account details

## 📊 Database Schema

### Users
```json
{
  "id": "usr_timestamp_random",
  "name": "User Name",
  "email": "user@example.com",
  "phone": "9876543210",
  "password": "hashed_password",
  "createdAt": "2026-09-06T18:00:00.000Z"
}
```

### Products
```json
{
  "id": 1,
  "name": "Premium Casual T-Shirt",
  "category": "men",
  "price": 1299,
  "description": "High-quality cotton t-shirt",
  "image": "image_url",
  "inStock": true
}
```

### Orders
```json
{
  "id": "ord_timestamp_random",
  "userId": "usr_...",
  "items": [
    {
      "productId": 1,
      "name": "Product Name",
      "price": 1299,
      "quantity": 1,
      "color": "Black",
      "size": "M"
    }
  ],
  "address": {
    "name": "John Doe",
    "phone": "9876543210",
    "street": "123 Main St",
    "city": "Mumbai",
    "state": "Maharashtra",
    "zip": "400001"
  },
  "delivery": {
    "type": "express",
    "cost": 200
  },
  "payment": {
    "type": "cod"
  },
  "subtotal": 1299,
  "tax": 130,
  "shipping": 200,
  "total": 1629,
  "status": "Pending",
  "createdAt": "2026-09-06T18:00:00.000Z"
}
```

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user (requires auth)
- `POST /api/auth/logout` - Logout user

### Products
- `GET /api/products` - Get all products
- `GET /api/products/:id` - Get product details

### Cart
- `GET /api/cart` - Get user's cart
- `POST /api/cart/items` - Add item to cart
- `PUT /api/cart/items/:productId` - Update cart item
- `DELETE /api/cart/items/:productId` - Remove from cart
- `DELETE /api/cart` - Clear cart

### Addresses
- `GET /api/addresses` - Get saved addresses
- `POST /api/addresses` - Add new address
- `DELETE /api/addresses/:addressId` - Delete address

### Orders
- `GET /api/orders` - Get user's orders
- `GET /api/orders/:orderId` - Get order details
- `POST /api/orders` - Create new order

### Wishlist
- `GET /api/wishlist` - Get wishlist (localStorage only)
- `POST /api/wishlist` - Add to wishlist (localStorage only)

## 🎨 Styling

The project uses a custom CSS framework with:
- Responsive grid layout
- Mobile-first design
- Smooth animations and transitions
- CSS variables for easy theming
- Bootstrap-like utility classes

## 🔒 Security Features

- **JWT Authentication** - Secure token-based auth
- **Password Hashing** - Bcrypt for password storage
- **CORS** - Cross-origin requests handled
- **Input Validation** - Server-side validation
- **Protected Routes** - Authenticated endpoints require valid token

## 🌐 Deployment

### Frontend (Static Site)
**Recommended Platforms**: Netlify, Vercel, GitHub Pages, AWS S3

1. Build (no build step needed for static files)
2. Deploy the entire `WEB-INF` folder
3. Set environment variable for API endpoint

### Backend (Node.js API)
**Recommended Platforms**: Heroku, Railway, AWS EC2, DigitalOcean

1. Update API endpoint in `api-client.js`
2. Set environment variables (if needed)
3. Deploy using git push or platform CLI

### Environment Variables
Create `.env` file in `api/` folder:
```
PORT=3000
NODE_ENV=production
API_URL=https://your-api.com
```

## 📱 Browser Compatibility

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## 🐛 Known Issues & Limitations

1. **External Payment Integrations** - Razorpay blocked in local/sandbox environments (defaults to COD)
2. **Image Hosting** - Uses Unsplash URLs; replace with your own image CDN
3. **Email Notifications** - Not implemented; add transactional email service (SendGrid, Mailgun)
4. **Admin Features** - Admin panel created but not fully integrated

## 📝 Testing

### Manual Testing Checklist
- [ ] User signup and login flows
- [ ] Product browsing and search
- [ ] Add/remove items from cart
- [ ] Wishlist functionality
- [ ] Checkout with all delivery methods
- [ ] All payment methods
- [ ] Order confirmation and tracking
- [ ] Profile and order history
- [ ] Address management
- [ ] Mobile responsiveness

### Sample Test Credentials
Create a test account during signup or use:
- Email: `test@epris.com`
- Password: `TestPass123`

## 🚀 Performance Optimization

1. **Lazy Loading** - Images load on demand
2. **Caching** - localStorage for cart and user data
3. **Minification** - CSS and JS can be minified for production
4. **CDN** - Use CDN for static assets and images
5. **Database Indexing** - Add indexes for frequently queried fields

## 📚 Additional Resources

- [API Documentation](./API_DOCUMENTATION.md)
- [Deployment Guide](./DEPLOYMENT.md)
- [Contributing Guidelines](./CONTRIBUTING.md)

## 📄 License

This project is open source and available under the MIT License.

## 👥 Support

For issues, questions, or suggestions:
- Email: support@epris.com
- Phone: +91 7981512162

---

**Last Updated**: September 6, 2026
**Version**: 1.0.0
**Status**: Production Ready ✅
