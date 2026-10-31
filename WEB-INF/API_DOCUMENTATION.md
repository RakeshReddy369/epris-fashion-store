# EPRIS Fashion Store - API Documentation

Complete REST API reference for the EPRIS Fashion Store backend.

## 📌 Base URL
```
http://localhost:3000/api  (Development)
https://api.epris.com/api   (Production)
```

## 🔐 Authentication

All protected endpoints require the `Authorization` header:
```
Authorization: Bearer <jwt_token>
```

## 📋 API Endpoints

---

## 🔑 Authentication Endpoints

### Register User
**POST** `/auth/register`

Register a new user account.

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "SecurePass123",
  "phone": "9876543210"
}
```

**Response (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "usr_1234567890_abc123",
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "9876543210"
  }
}
```

**Error (400):**
```json
{
  "error": "Email already registered"
}
```

---

### Login User
**POST** `/auth/login`

Authenticate user and receive JWT token.

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "SecurePass123"
}
```

**Response (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "usr_1234567890_abc123",
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

**Error (401):**
```json
{
  "error": "Invalid email or password"
}
```

---

### Get Current User
**GET** `/auth/me`

Get authenticated user's profile.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "user": {
    "id": "usr_1234567890_abc123",
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "9876543210"
  }
}
```

**Error (401):**
```json
{
  "error": "Unauthorized"
}
```

---

## 📦 Product Endpoints

### Get All Products
**GET** `/products`

Retrieve all available products.

**Query Parameters:**
- `category` (optional): Filter by category (men, women, shoes)
- `limit` (optional): Number of products to return (default: 50)
- `offset` (optional): Starting position (default: 0)

**Response (200):**
```json
{
  "products": [
    {
      "id": 1,
      "name": "Premium Casual T-Shirt",
      "category": "men",
      "price": 1299,
      "description": "High-quality cotton t-shirt",
      "image": "https://images.unsplash.com/...",
      "rating": 4.5,
      "reviews": 128,
      "inStock": true
    },
    ...
  ]
}
```

---

### Get Product Details
**GET** `/products/:id`

Get detailed information about a specific product.

**Response (200):**
```json
{
  "product": {
    "id": 1,
    "name": "Premium Casual T-Shirt",
    "category": "men",
    "price": 1299,
    "description": "High-quality cotton t-shirt perfect for everyday wear",
    "image": "https://images.unsplash.com/...",
    "sizes": ["S", "M", "L", "XL", "XXL"],
    "colors": ["Black", "White", "Navy", "Grey"],
    "rating": 4.5,
    "reviews": 128,
    "inStock": true,
    "sku": "PCTSHIRT001"
  }
}
```

**Error (404):**
```json
{
  "error": "Product not found"
}
```

---

## 🛒 Cart Endpoints

### Get User's Cart
**GET** `/cart`

Retrieve the current user's shopping cart.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "cart": {
    "id": "cart_1234567890",
    "userId": "usr_1234567890_abc123",
    "items": [
      {
        "productId": 1,
        "name": "Premium Casual T-Shirt",
        "price": 1299,
        "quantity": 2,
        "color": "Black",
        "size": "M",
        "image": "https://images.unsplash.com/..."
      }
    ],
    "subtotal": 2598
  }
}
```

---

### Add Item to Cart
**POST** `/cart/items`

Add a product to the user's cart.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "productId": 1,
  "quantity": 2,
  "color": "Black",
  "size": "M"
}
```

**Response (200):**
```json
{
  "message": "Item added to cart",
  "cart": {
    "items": [...],
    "subtotal": 2598
  }
}
```

**Error (400):**
```json
{
  "error": "Product out of stock"
}
```

---

### Update Cart Item
**PUT** `/cart/items/:productId`

Update quantity or details of a cart item.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "quantity": 3,
  "color": "White",
  "size": "L"
}
```

**Response (200):**
```json
{
  "message": "Cart updated",
  "cart": {...}
}
```

---

### Remove Item from Cart
**DELETE** `/cart/items/:productId`

Remove a specific product from cart.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "message": "Item removed from cart",
  "cart": {...}
}
```

---

### Clear Cart
**DELETE** `/cart`

Remove all items from cart.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "message": "Cart cleared"
}
```

---

## 📍 Address Endpoints

### Get Saved Addresses
**GET** `/addresses`

Retrieve all saved addresses for the user.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "addresses": [
    {
      "id": "addr_1234567890",
      "name": "Home",
      "street": "123 Main Street",
      "city": "Mumbai",
      "state": "Maharashtra",
      "zip": "400001",
      "phone": "9876543210",
      "type": "home",
      "default": true
    }
  ]
}
```

---

### Add New Address
**POST** `/addresses`

Save a new delivery address.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Home",
  "street": "123 Main Street",
  "city": "Mumbai",
  "state": "Maharashtra",
  "zip": "400001",
  "phone": "9876543210",
  "type": "home"
}
```

**Response (201):**
```json
{
  "message": "Address added",
  "address": {
    "id": "addr_1234567890",
    "name": "Home",
    "street": "123 Main Street",
    "city": "Mumbai",
    "state": "Maharashtra",
    "zip": "400001",
    "phone": "9876543210",
    "type": "home"
  }
}
```

---

### Delete Address
**DELETE** `/addresses/:addressId`

Remove a saved address.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "message": "Address deleted"
}
```

---

## 📦 Order Endpoints

### Get All User Orders
**GET** `/orders`

Retrieve all orders for the authenticated user.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "orders": [
    {
      "id": "ord_1234567890_abc123",
      "userId": "usr_1234567890_abc123",
      "items": [
        {
          "productId": 1,
          "name": "Premium Casual T-Shirt",
          "price": 1299,
          "quantity": 1,
          "color": "Black",
          "size": "M"
        }
      ],
      "address": {
        "name": "John Doe",
        "street": "123 Main Street",
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
  ]
}
```

---

### Get Order Details
**GET** `/orders/:orderId`

Get details of a specific order.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "order": {
    "id": "ord_1234567890_abc123",
    "userId": "usr_1234567890_abc123",
    "items": [...],
    "address": {...},
    "delivery": {...},
    "payment": {...},
    "subtotal": 1299,
    "tax": 130,
    "shipping": 200,
    "total": 1629,
    "status": "Pending",
    "createdAt": "2026-09-06T18:00:00.000Z"
  }
}
```

**Error (404):**
```json
{
  "error": "Order not found"
}
```

---

### Create Order
**POST** `/orders`

Place a new order.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "address": {
    "name": "John Doe",
    "phone": "9876543210",
    "street": "123 Main Street",
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
  }
}
```

**Response (201):**
```json
{
  "order": {
    "id": "ord_1234567890_abc123",
    "userId": "usr_1234567890_abc123",
    "items": [...],
    "address": {...},
    "delivery": {...},
    "payment": {...},
    "subtotal": 1299,
    "tax": 130,
    "shipping": 200,
    "total": 1629,
    "status": "Pending",
    "createdAt": "2026-09-06T18:00:00.000Z"
  }
}
```

**Error (400):**
```json
{
  "error": "Cart is empty"
}
```

---

## 📝 Wishlist (Client-Side Only)

Wishlist is stored in browser's localStorage. API endpoints coming soon.

### Storage Format:
```json
{
  "wishlist": [
    {
      "id": 1,
      "name": "Product Name",
      "price": 1299
    }
  ]
}
```

---

## 🔍 Common Query Parameters

### Pagination
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20)
- `offset` - Starting index (default: 0)

### Filtering
- `category` - Product category
- `priceMin` - Minimum price
- `priceMax` - Maximum price
- `search` - Search query

### Sorting
- `sortBy` - Sort field (price, rating, newest)
- `order` - asc or desc (default: desc)

---

## 📊 Response Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 500 | Server Error |

---

## 🚨 Error Handling

All error responses follow this format:
```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

---

## 💡 Rate Limiting

- 100 requests per minute per IP
- 1000 requests per hour per user

---

## 🔒 Security Notes

1. Always use HTTPS in production
2. Store JWT tokens securely (httpOnly cookies recommended)
3. Validate all input on client and server
4. Never expose sensitive data in responses
5. Implement CSRF protection
6. Use Content Security Policy (CSP) headers

---

**Last Updated**: September 6, 2026
**API Version**: 1.0.0
