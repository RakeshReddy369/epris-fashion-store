# EPRIS Backend API

Express and MongoDB API for authentication, products, addresses, carts, wishlists, and orders.

## Run locally

```powershell
cd api
npm install
$env:JWT_SECRET="development-secret-change-me"
$env:MONGODB_URI="mongodb://127.0.0.1:27017/epris_fashion"
$env:GOOGLE_CLIENT_ID="your-google-oauth-client-id.apps.googleusercontent.com"
$env:RAZORPAY_KEY_ID="rzp_test_your_key_id"
$env:RAZORPAY_KEY_SECRET="your_razorpay_secret"
$env:ADMIN_EMAIL="admin@example.com"
$env:ADMIN_PASSWORD="change-this-admin-password"
npm start
```

Start MongoDB locally before running the API, or use a MongoDB Atlas connection string in `MONGODB_URI`. The API listens on `http://localhost:3000` by default.

## Google sign-in setup

1. Create a **Web application** OAuth client in the Google Cloud Console and enable Google Identity Services.
2. Add the frontend origin you use to **Authorized JavaScript origins**, for example `http://127.0.0.1:5500` for VS Code Live Server or `http://localhost:8000` for Python's local server.
3. Set `GOOGLE_CLIENT_ID` to that client's ID in the API environment (or in `api/.env`), then restart the API.
4. Open the site through a local HTTP server, not `file://`. The API verifies Google's ID token before creating or signing in a user.

The client ID is public configuration; never put a Google client secret in frontend files.

## Routes

- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/google/config`
- `POST /api/auth/google`
- `GET /api/auth/me` (authenticated)
- `GET /api/addresses` (authenticated)
- `POST /api/addresses` (authenticated)
- `DELETE /api/addresses/:addressId` (authenticated)
- `GET /api/products`
- `GET /api/products/:id`
- `GET /api/admin/products` (authenticated admin)
- `POST /api/admin/products` (authenticated admin)
- `PATCH /api/admin/products/:id` (authenticated admin)
- `DELETE /api/admin/products/:id` (authenticated admin)
- `GET /api/admin/customers` (authenticated admin)
- `GET /api/admin/orders` (authenticated admin)
- `PATCH /api/admin/orders/:id/status` (authenticated admin)
- `GET /api/cart` (authenticated)
- `POST /api/cart/items` (authenticated)
- `PATCH /api/cart/items/:productId` (authenticated)
- `DELETE /api/cart/items/:productId` (authenticated)
- `GET /api/wishlist` (authenticated)
- `POST /api/wishlist/:productId` (authenticated)
- `DELETE /api/wishlist/:productId` (authenticated)
- `POST /api/payments/razorpay/order` (authenticated)
- `POST /api/payments/razorpay/verify` (authenticated)
- `POST /api/webhooks/razorpay` (Razorpay webhook signature)
- `POST /api/orders` (authenticated)
- `GET /api/orders` (authenticated)
- `GET /api/orders/:id` (authenticated)

Send the token returned by register/login with:

```http
Authorization: Bearer YOUR_TOKEN
```

Products are automatically seeded into MongoDB from `products.js` when the API starts. Users, embedded addresses, carts, wishlists, and orders are stored permanently in the `epris_fashion` database. The legacy `data/db.json` file is retained as a local reference and is no longer used by the server.

For production, use a strong `JWT_SECRET`, MongoDB Atlas or a secured MongoDB deployment, and restrict `CORS_ORIGIN` to the real frontend origin.

Online payments use Razorpay test mode. Never send `RAZORPAY_KEY_SECRET` to the browser. The server verifies `razorpay_signature` using HMAC-SHA256 before creating a paid order. Configure Razorpay to call `/api/webhooks/razorpay` and set `RAZORPAY_WEBHOOK_SECRET`; verified `payment.captured`, `payment.failed`, and `refund.processed` events update order status.
