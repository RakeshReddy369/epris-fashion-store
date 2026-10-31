# 🍃 MongoDB Atlas Cloud Setup & Migration Guide

Connecting your EPRIS Fashion Store to **MongoDB Atlas (Free Cloud Tier)** keeps all customer accounts, orders, reviews, and coupon codes permanently stored in the cloud so they never reset when Render restarts.

---

## Step 1: Create a Free MongoDB Atlas Account (2 Minutes)

1. Go to [mongodb.com/cloud/atlas/register](https://www.mongodb.com/cloud/atlas/register) and create a free account (no credit card required).
2. Choose the **M0 Free** cluster plan (Shared, 512 MB storage — free forever).
3. Select your preferred cloud provider (AWS or Google Cloud) and nearest region (e.g. `Mumbai (ap-south-1)` or `Singapore`).
4. Click **Create Deployment**.

---

## Step 2: Configure Database User & Network Access (Important!)

1. **Create Database User**:
   - Go to **Database Access** in the left sidebar.
   - Click **+ Add New Database User**.
   - Authentication Method: **Password**.
   - Username: `epris_user` (or your choice).
   - Password: Choose a password (avoid `@`, `:`, or `/` in password, or URL-encode them).
   - Built-in Role: **Read and write to any database**.
   - Click **Add User**.

2. **Allow Access from Anywhere (`0.0.0.0/0`)**:
   - Go to **Network Access** in the left sidebar.
   - Click **+ Add IP Address**.
   - Click **Allow Access from Anywhere** (adds `0.0.0.0/0`).
   - *Why is this required?* Cloud hosting platforms like Render and Railway use dynamic outbound IP addresses, so they need `0.0.0.0/0` to connect.
   - Click **Confirm**.

---

## Step 3: Get Your Connection String

1. Go to **Database** in the left sidebar.
2. Click **Connect** next to your cluster.
3. Select **Drivers** (Node.js).
4. Copy the connection string. It looks like this:
   ```text
   mongodb+srv://epris_user:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
5. Replace `<password>` with your database user password and insert the database name `/epris_fashion` before `?`:
   ```text
   mongodb+srv://epris_user:YourPassword123@cluster0.xxxxx.mongodb.net/epris_fashion?retryWrites=true&w=majority
   ```

---

## Step 4: Connect to Render (Live Site)

1. Open your [Render Dashboard](https://dashboard.render.com).
2. Click on your **epris-fashion-store** web service.
3. In the left navigation, click **Environment**.
4. Click **Add Environment Variable**:
   - **Key**: `MONGODB_URI`
   - **Value**: `mongodb+srv://epris_user:YourPassword123@cluster0.xxxxx.mongodb.net/epris_fashion?retryWrites=true&w=majority`
5. Click **Save Changes**.
6. Render will automatically redeploy. Your store will detect `MONGODB_URI` on startup and connect to MongoDB Atlas!

---

## Step 5: Migrate Local Data to Atlas (Optional 1-Click)

To copy all your current products, coupons (`WELCOME10`, `EPRIS500`, `FREESHIP`), orders, and reviews from local `db.json` into your Atlas cloud database:

Run this command in PowerShell:

```powershell
$env:MONGODB_URI="mongodb+srv://epris_user:YourPassword123@cluster0.xxxxx.mongodb.net/epris_fashion?retryWrites=true&w=majority"
npm run migrate:mongo
```

You will see:
```text
✅ Connected to MongoDB successfully.
📦 Migrating Products... (15 migrated)
👤 Migrating Users...
🛒 Migrating Carts...
💖 Migrating Wishlists...
📦 Migrating Orders...
⭐ Migrating Reviews...
🎟️ Migrating Coupons... (4 migrated)
🎉 MIGRATION COMPLETED SUCCESSFULLY!
```

---

## Step 6: Log In as Admin on MongoDB

Once connected, your admin account is automatically synchronized on server boot:
- **URL**: `https://<your-render-url>/login.html`
- **Email**: `admin@epris.com`
- **Password**: `ChangeMe!2026` (or the value of `ADMIN_PASSWORD` in your Render Environment Variables).
- Or click the **⚡ Fill Admin Credentials** button directly on `login.html`!

