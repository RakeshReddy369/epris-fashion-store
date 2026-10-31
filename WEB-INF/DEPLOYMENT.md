# 🚀 EPRIS Fashion Store — Production Deployment Guide

This guide walks you through deploying the complete EPRIS Fashion Store to modern cloud hosting platforms.

---

## 🏗️ Architecture Overview

The application is structured into two decoupled components:
1. **Frontend**: Static Web Application (`WEB-INF/` — HTML5, CSS3, Vanilla ES6+ JS)
   - **Recommended Hosts**: **Vercel** or **Netlify**
   - **Pre-configured with**: `vercel.json` and `netlify.toml`
2. **Backend**: Node.js & Express REST API (`WEB-INF/api/`)
   - **Recommended Hosts**: **Railway** or **Render**
   - **Database**: File-based `db.json` (zero config) or **MongoDB Atlas** (production scale)
   - **Pre-configured with**: `Procfile`, `railway.json`, and `render.yaml`

---

## ⚡ Part 1: Deploy Backend (Railway or Render)

Deploy the backend first so you have your live API URL (e.g., `https://epris-api.up.railway.app`).

### Option A: Deploy to Railway (Recommended)

1. Push your repository to **GitHub**.
2. Sign in to [Railway.app](https://railway.app).
3. Click **New Project** → **Deploy from GitHub repo** → Select your repository.
4. Set the **Root Directory** in Railway project settings to:
   ```
   WEB-INF/api
   ```
5. Add the following **Environment Variables** in the Railway dashboard:
   | Variable | Value / Description |
   |---|---|
   | `PORT` | `3000` |
   | `NODE_ENV` | `production` |
   | `JWT_SECRET` | Generate a 64+ char random string |
   | `CORS_ORIGIN` | `*` (or your Netlify/Vercel frontend URL) |
   | `ADMIN_EMAIL` | `admin@epris.com` |
   | `ADMIN_PASSWORD` | `ChangeMe!2026` |
   | `RAZORPAY_KEY_ID` | Your Razorpay Key ID |
   | `RAZORPAY_KEY_SECRET` | Your Razorpay Secret |
   | `GOOGLE_CLIENT_ID` | Your Google OAuth 2.0 Web Client ID |
   | `EMAIL_USER` | Your email address (for transactional mail) |
   | `EMAIL_PASS` | Your Google App Password or SMTP password |
   | `MONGODB_URI` | *(Optional)* MongoDB connection string (e.g. MongoDB Atlas) |

6. Railway will automatically detect `railway.json` / `Procfile`, install dependencies, run health checks at `/api/health`, and assign you a live HTTPS domain!

---

### Option B: Deploy to Render

1. Sign in to [Render.com](https://render.com).
2. Click **New +** → **Web Service**.
3. Connect your GitHub repository.
4. Configure service:
   - **Root Directory**: `WEB-INF/api`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js` (or `node server-mongo.js` for MongoDB)
5. Under **Environment Variables**, fill in the variables listed in the table above.
6. Render deploys your API and provides a free HTTPS endpoint (e.g. `https://epris-api.onrender.com`).

---

## 🍃 Part 2: Database Migration to MongoDB (Optional)

If switching from the local JSON database to a cloud MongoDB cluster:

1. Create a free cluster on [MongoDB Atlas](https://www.mongodb.com/atlas).
2. Copy your connection URI (e.g. `mongodb+srv://admin:<password>@cluster0.mongodb.net/epris_fashion?retryWrites=true&w=majority`).
3. Add `MONGODB_URI` to your `api/.env`.
4. Run the automated migration script:
   ```bash
   cd WEB-INF/api
   npm run migrate:mongo
   ```
   *This migrates all products, users, wishlists, carts, reviews, and orders to MongoDB.*
5. Run the MongoDB-powered server:
   ```bash
   npm run start:mongo
   ```

---

## 🎨 Part 3: Deploy Frontend (Vercel or Netlify)

### Option A: Deploy to Vercel (Recommended)

1. Sign in to [Vercel](https://vercel.com).
2. Click **Add New...** → **Project** → Import your Git repository.
3. In **Root Directory**, click **Edit** and select:
   ```
   WEB-INF
   ```
4. Framework Preset: Leave as **Other**.
5. Click **Deploy**.
6. Set your backend API URL:
   - In [`WEB-INF/api-client.js`](./api-client.js), the app automatically routes requests to your deployed backend, or you can configure a custom URL by setting `localStorage.setItem('API_URL', 'https://your-backend.up.railway.app/api')` in browser console, or by specifying `window.EPRIS_API_URL`.

---

### Option B: Deploy to Netlify

1. Sign in to [Netlify](https://www.netlify.com).
2. Click **Add new site** → **Import an existing project**.
3. Choose GitHub and select your repository.
4. Build settings:
   - **Base directory**: `WEB-INF`
   - **Publish directory**: `.`
5. Click **Deploy Site**.
6. In `netlify.toml`, you can uncomment the proxy block to forward all `/api/*` calls directly to your Railway backend:
   ```toml
   [[redirects]]
     from = "/api/*"
     to = "https://your-backend.up.railway.app/api/:splat"
     status = 200
     force = true
   ```

---

## ⚡ Part 4: Production Asset Optimization (Minification)

Before deploying to production, run the automated minification suite:

```bash
cd WEB-INF/api
npm run build:minify
```

This generates `.min.css` and `.min.js` files, reducing asset payloads by ~24% for lightning-fast loads.

---

## ✅ Post-Deployment Verification Checklist

- [ ] **Health Check**: Visit `https://your-api.com/api/health` → Should return `{"status":"ok"}`.
- [ ] **Admin Seed**: Send `POST https://your-api.com/api/admin/seed` to initialize the admin user.
- [ ] **Catalog Browse**: Visit your frontend URL → 15 products should render with crisp local SVG vector imagery.
- [ ] **Reviews & Ratings**: Open any product detail page → View customer reviews and post a test review.
- [ ] **Wishlist Sync**: Log in, add an item to the wishlist, reload the page → Item persists from server.
- [ ] **Checkout Flow**: Complete checkout using Cash on Delivery or test Razorpay payment.
- [ ] **Admin Dashboard**: Log in as admin at `/admin.html` → Change order status to *Shipped* → Check customer email notifications.
