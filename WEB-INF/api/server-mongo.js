require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { OAuth2Client } = require('google-auth-library');
const Razorpay = require('razorpay');
const seedProducts = require('./products');
const { User, Product, Cart, Wishlist, Order, Review, Coupon } = require('./models');
const { sendOrderConfirmation, sendOrderStatusUpdate, sendWelcomeEmail } = require('./email');
const { createRazorpayOrder, verifyRazorpaySignature, keyId: razorpayKeyId } = require('./payment');

const app = express();
const port = Number(process.env.PORT) || 3000;
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/epris_fashion';
const jwtSecret = process.env.JWT_SECRET || 'development-secret-change-me';
const googleClientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
const facebookAppId = String(process.env.FACEBOOK_APP_ID || '').trim();
const googleOAuthClient = new OAuth2Client(googleClientId || undefined);
const razorpay = process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
    ? new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET })
    : null;

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));

app.post('/api/webhooks/razorpay', express.raw({ type: 'application/json' }), async (req, res, next) => {
    try {
        const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
        const receivedSignature = req.headers['x-razorpay-signature'];
        if (!webhookSecret || !receivedSignature) return res.status(401).json({ message: 'Webhook authentication failed' });

        const expectedSignature = crypto.createHmac('sha256', webhookSecret).update(req.body).digest('hex');
        if (expectedSignature.length !== receivedSignature.length || !crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(receivedSignature))) {
            return res.status(401).json({ message: 'Webhook authentication failed' });
        }

        const payload = JSON.parse(req.body.toString('utf8'));
        const event = payload.event;
        const paymentEntity = payload.payload?.payment?.entity;
        const refundEntity = payload.payload?.refund?.entity;
        const providerOrderId = paymentEntity?.order_id;
        const providerPaymentId = paymentEntity?.id || refundEntity?.payment_id;
        const statusByEvent = {
            'payment.captured': { orderStatus: 'Confirmed', paymentStatus: 'paid' },
            'payment.failed': { orderStatus: 'Payment Failed', paymentStatus: 'failed' },
            'refund.processed': { orderStatus: 'Refunded', paymentStatus: 'refunded' }
        };
        const status = statusByEvent[event];

        if (status && (providerOrderId || providerPaymentId)) {
            const paymentQuery = [];
            if (providerOrderId) paymentQuery.push({ 'payment.providerOrderId': providerOrderId });
            if (providerPaymentId) paymentQuery.push({ 'payment.providerPaymentId': providerPaymentId });
            await Order.updateOne(
                { $or: paymentQuery },
                { $set: { status: status.orderStatus, 'payment.status': status.paymentStatus } }
            );
        }

        res.json({ received: true });
    } catch (error) {
        next(error);
    }
});

app.use(express.json());
// Admin seed - accessible via GET or POST
app.all('/api/admin/seed', async (req, res) => {
    try {
        await ensureAdminUser();
        const adminEmail = String(process.env.ADMIN_EMAIL || 'admin@epris.com').trim().toLowerCase();
        res.json({
            status: 'ok',
            message: 'Admin account is ready for login on MongoDB',
            email: adminEmail,
            role: 'admin'
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

const frontendDir = path.join(__dirname, '..');
app.use(express.static(frontendDir));
app.use('/assets', express.static(path.join(__dirname, '../assets')));

app.get('/', (req, res) => {
    res.sendFile(path.join(frontendDir, 'index.html'));
});

function createId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function publicUser(user) {
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone || '',
        role: user.role,
        addresses: user.addresses || [],
        googleLinked: !!user.googleId,
        facebookLinked: !!user.facebookId
    };
}

function createToken(user) {
    return jwt.sign({ userId: user.id }, jwtSecret, { expiresIn: '7d' });
}

async function authenticate(req, res, next) {
    const authorization = req.headers.authorization || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : null;

    if (!token) return res.status(401).json({ message: 'Authentication required' });

    try {
        const payload = jwt.verify(token, jwtSecret);
        const user = await User.findOne({ id: payload.userId });
        if (!user) return res.status(401).json({ message: 'User no longer exists' });
        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
}

function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Administrator access required' });
    next();
}

function toProductResponse(product) {
    return product.toObject ? product.toObject() : product;
}

async function getOrCreateCart(userId) {
    return Cart.findOneAndUpdate(
        { userId },
        { $setOnInsert: { userId, items: [] } },
        { new: true, upsert: true }
    );
}

async function seedProductCollection() {
    for (const product of seedProducts) {
        await Product.updateOne({ id: product.id }, { $setOnInsert: product }, { upsert: true });
    }
    await Product.updateMany({ inventory: { $exists: false } }, { $set: { inventory: 0 } });
}

async function seedCoupons() {
    const defaultCoupons = [
        { code: 'WELCOME10', discountType: 'percentage', discountValue: 10, minOrderAmount: 999, description: '10% off on your first order above ₹999' },
        { code: 'EPRIS500', discountType: 'flat', discountValue: 500, minOrderAmount: 2499, description: 'Flat ₹500 discount on orders above ₹2,499' },
        { code: 'FREESHIP', discountType: 'shipping', discountValue: 100, minOrderAmount: 499, description: 'Free Express Shipping on orders above ₹499' },
        { code: 'FESTIVE25', discountType: 'percentage', discountValue: 25, minOrderAmount: 3999, description: '25% off festive clearance on orders above ₹3,999' }
    ];
    for (const cp of defaultCoupons) {
        await Coupon.updateOne({ code: cp.code }, { $setOnInsert: cp }, { upsert: true });
    }
}

async function ensureAdminUser() {
    const email = String(process.env.ADMIN_EMAIL || 'admin@epris.com').trim().toLowerCase();
    const password = String(process.env.ADMIN_PASSWORD || 'ChangeMe!2026');
    const passwordHash = await bcrypt.hash(password, 12);
    await User.updateOne(
        { email },
        { $set: { name: 'EPRIS Administrator', email, passwordHash, role: 'admin' }, $setOnInsert: { id: createId('usr') } },
        { upsert: true }
    );
    console.log(`🛡️ Admin account synchronized: ${email}`);
}

const deliveryRates = {
    standard: 100,
    express: 200,
    overnight: 350,
    free: 0
};

function getDelivery(delivery = {}) {
    const type = Object.prototype.hasOwnProperty.call(deliveryRates, delivery.type) ? delivery.type : 'standard';
    return { type, cost: deliveryRates[type] };
}

function getCartTotals(cart, delivery) {
    const subtotal = cart.items.reduce((total, item) => total + item.price * item.quantity, 0);
    const shipping = delivery.cost;
    const tax = Math.round(subtotal * 0.1);
    return { subtotal, tax, shipping, total: subtotal + tax + shipping };
}

function validateAddress(address) {
    return address && address.name && address.street && address.city && address.state && address.zip;
}

async function createOrderFromCart(userId, address, delivery, payment) {
    const cart = await getOrCreateCart(userId);
    if (!cart.items.length) throw Object.assign(new Error('Cannot place an order with an empty cart'), { statusCode: 400 });
    if (!validateAddress(address)) throw Object.assign(new Error('A complete shipping address is required'), { statusCode: 400 });

    const totals = getCartTotals(cart, delivery);
    const order = await Order.create({
        id: createId('ord'), userId, items: cart.items, address,
        delivery, payment, ...totals, status: payment.status === 'paid' ? 'Confirmed' : 'Pending'
    });
    cart.items = [];
    await cart.save();
    return order;
}

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'epris-fashion-api', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' });
});

// Authentication

// Facebook Authentication (Mongo)
app.get('/api/auth/facebook/config', (req, res) => {
    res.json({ appId: facebookAppId, configured: !!(facebookAppId && !facebookAppId.startsWith('your-')) });
});

app.post('/api/auth/facebook', async (req, res, next) => {
    try {
        const { accessToken } = req.body;
        let email, name, fbId;

        const token = req.body.accessToken || req.body.credential;
    if ((!facebookAppId || facebookAppId.startsWith('your-')) && (token?.startsWith('demo_') || req.body.credential?.startsWith('demo_'))) {
            email = String(req.body.email || 'demo.facebook@example.com').trim().toLowerCase();
            name = String(req.body.name || 'Facebook User').trim();
            fbId = 'fb_' + Buffer.from(email).toString('hex').slice(0, 16);
        } else {
            const activeToken = req.body.accessToken || req.body.credential;
        if (!activeToken) {
                return res.status(400).json({ message: 'Facebook accessToken is required' });
            }

            const fbRes = await fetch(`https://graph.facebook.com/me?fields=id,name,email&access_token=${encodeURIComponent(accessToken)}`);
            const fbData = await fbRes.json();
            if (!fbRes.ok || !fbData || !fbData.id) {
                return res.status(401).json({ message: fbData?.error?.message || 'Facebook token verification failed' });
            }

            fbId = fbData.id;
            name = fbData.name || 'Facebook User';
            email = fbData.email ? fbData.email.trim().toLowerCase() : `fb_${fbId}@facebook.user`;
        }

        let user = await User.findOne({ facebookId: fbId });
        if (!user) {
            user = await User.findOne({ email });
            if (user) {
                if (user.facebookId && user.facebookId !== fbId) {
                    return res.status(409).json({ message: 'This email is linked to a different Facebook account' });
                }
                user.facebookId = fbId;
                await user.save();
            } else {
                user = await User.create({
                    id: createId('usr'),
                    name,
                    email,
                    phone: '',
                    passwordHash: '',
                    facebookId: fbId,
                    role: 'customer'
                });
                sendWelcomeEmail(user).catch(() => {});
            }
        }

        res.json({ user: publicUser(user), token: createToken(user) });
    } catch (err) {
        next(err);
    }
});

app.post('/api/auth/register', async (req, res, next) => {
    try {
        const { name, email, password, phone = '' } = req.body;
        const normalizedEmail = String(email || '').trim().toLowerCase();
        if (!name || !normalizedEmail || !password) return res.status(400).json({ message: 'Name, email, and password are required' });
        if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });
        if (await User.exists({ email: normalizedEmail })) return res.status(409).json({ message: 'An account with this email already exists' });

        const user = await User.create({
            id: createId('usr'),
            name: String(name).trim(),
            email: normalizedEmail,
            phone: String(phone).trim(),
            passwordHash: await bcrypt.hash(password, 12)
        });
        sendWelcomeEmail(user).catch(() => {});
        res.status(201).json({ user: publicUser(user), token: createToken(user) });
    } catch (error) {
        next(error);
    }
});

app.post('/api/auth/login', async (req, res, next) => {
    try {
        const normalizedEmail = String(req.body.email || '').trim().toLowerCase();
        const user = await User.findOne({ email: normalizedEmail });
        if (!user || !user.passwordHash || !(await bcrypt.compare(String(req.body.password || ''), user.passwordHash))) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }
        res.json({ user: publicUser(user), token: createToken(user) });
    } catch (error) {
        next(error);
    }
});

app.get('/api/auth/google/config', (req, res) => {
    res.json({ clientId: googleClientId });
});

app.post('/api/auth/google', async (req, res, next) => {
    if (!googleClientId) return res.status(503).json({ message: 'Google sign-in is not configured on the server' });

    try {
        const credential = String(req.body.credential || '');
        if (!credential) return res.status(400).json({ message: 'Google credential is required' });

        let ticket;
        try {
            ticket = await googleOAuthClient.verifyIdToken({ idToken: credential, audience: googleClientId });
        } catch (error) {
            console.warn('Google sign-in token verification failed:', error.message);
            return res.status(401).json({ message: 'Google sign-in could not be verified. Please try again.' });
        }

        const payload = ticket.getPayload();
        if (!payload || !payload.sub || !payload.email || payload.email_verified !== true) {
            return res.status(401).json({ message: 'Google did not provide a verified email address' });
        }

        const email = payload.email.trim().toLowerCase();
        let user = await User.findOne({ googleId: payload.sub });

        if (!user) {
            user = await User.findOne({ email });
            if (user) {
                if (user.googleId && user.googleId !== payload.sub) {
                    return res.status(409).json({ message: 'This email is linked to a different Google account' });
                }
                user.googleId = payload.sub;
                await user.save();
            } else {
                user = await User.create({
                    id: createId('usr'),
                    name: String(payload.name || email.split('@')[0]).trim(),
                    email,
                    googleId: payload.sub
                });
            }
        }

        res.json({ user: publicUser(user), token: createToken(user) });
    } catch (error) {
        next(error);
    }
});

app.get('/api/auth/me', authenticate, (req, res) => {
    res.json({ user: publicUser(req.user) });
});

app.patch('/api/auth/me', authenticate, async (req, res, next) => {
    try {
        const { name, phone = '' } = req.body;
        if (!name || !String(name).trim()) return res.status(400).json({ message: 'Name is required' });
        req.user.name = String(name).trim();
        req.user.phone = String(phone).trim();
        await req.user.save();
        res.json({ user: publicUser(req.user) });
    } catch (error) {
        next(error);
    }
});

app.post('/api/auth/change-password', authenticate, async (req, res, next) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) return res.status(400).json({ message: 'Current and new passwords are required' });
        if (newPassword.length < 6) return res.status(400).json({ message: 'New password must be at least 6 characters' });
        if (!(await bcrypt.compare(currentPassword, req.user.passwordHash))) return res.status(401).json({ message: 'Current password is incorrect' });
        req.user.passwordHash = await bcrypt.hash(newPassword, 12);
        await req.user.save();
        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        next(error);
    }
});

// Addresses are stored inside each MongoDB user document
app.get('/api/addresses', authenticate, (req, res) => {
    res.json({ addresses: req.user.addresses || [] });
});

app.post('/api/addresses', authenticate, async (req, res, next) => {
    try {
        const { type = 'home', name, phone = '', street, city, state, zip, isDefault = false } = req.body;
        if (!name || !street || !city || !state || !zip) return res.status(400).json({ message: 'Name, street, city, state, and ZIP are required' });
        if (isDefault) req.user.addresses.forEach(address => { address.isDefault = false; });
        req.user.addresses.push({ type, name, phone, street, city, state, zip, isDefault });
        await req.user.save();
        res.status(201).json({ addresses: req.user.addresses });
    } catch (error) {
        next(error);
    }
});

app.delete('/api/addresses/:addressId', authenticate, async (req, res, next) => {
    try {
        const address = req.user.addresses.id(req.params.addressId);
        if (!address) return res.status(404).json({ message: 'Address not found' });
        address.deleteOne();
        await req.user.save();
        res.json({ addresses: req.user.addresses });
    } catch (error) {
        next(error);
    }
});

// Products
app.get('/api/products', async (req, res, next) => {
    try {
        const search = String(req.query.search || '').trim();
        const filters = {};
        if (search) filters.$or = [{ name: new RegExp(search, 'i') }, { category: new RegExp(search, 'i') }];
        if (req.query.category) filters.category = new RegExp(`^${String(req.query.category)}$`, 'i');
        if (req.query.minPrice !== undefined || req.query.maxPrice !== undefined) {
            filters.price = {};
            if (req.query.minPrice !== undefined) filters.price.$gte = Number(req.query.minPrice);
            if (req.query.maxPrice !== undefined) filters.price.$lte = Number(req.query.maxPrice);
        }
        const result = await Product.find(filters).sort({ id: 1 }).lean();
        const reviews = await Review.find({}).lean();
        const productsWithRatings = result.map(p => {
            const prodReviews = reviews.filter(r => r.productId === p.id);
            const avgRating = prodReviews.length
                ? Number((prodReviews.reduce((sum, r) => sum + (Number(r.rating) || 5), 0) / prodReviews.length).toFixed(1))
                : Number((4.5 + ((p.id * 3) % 5) * 0.1).toFixed(1));
            return {
                ...p,
                rating: avgRating,
                reviewCount: prodReviews.length || (12 + (p.id * 7) % 45),
                isNew: p.id % 3 === 0
            };
        });
        res.json({ products: productsWithRatings, count: productsWithRatings.length });
    } catch (error) {
        next(error);
    }
});

app.get('/api/products/:id', async (req, res, next) => {
    try {
        const product = await Product.findOne({ id: Number(req.params.id) }).lean();
        if (!product) return res.status(404).json({ message: 'Product not found' });
        res.json({ product });
    } catch (error) {
        next(error);
    }
});

// Admin management
app.get('/api/admin/products', authenticate, requireAdmin, async (req, res, next) => {
    try {
        res.json({ products: await Product.find().sort({ id: 1 }).lean() });
    } catch (error) {
        next(error);
    }
});

app.post('/api/admin/products', authenticate, requireAdmin, async (req, res, next) => {
    try {
        const { name, price, originalPrice, category, image, description, inventory = 0 } = req.body;
        if (!name || price === undefined || originalPrice === undefined || !category || !image || !description) {
            return res.status(400).json({ message: 'Name, prices, category, image, and description are required' });
        }
        const lastProduct = await Product.findOne().sort({ id: -1 }).lean();
        const product = await Product.create({
            id: (lastProduct?.id || 0) + 1, name, price, originalPrice, category, image, description, inventory
        });
        res.status(201).json({ product });
    } catch (error) {
        next(error);
    }
});

app.patch('/api/admin/products/:id', authenticate, requireAdmin, async (req, res, next) => {
    try {
        const allowedFields = ['name', 'price', 'originalPrice', 'category', 'image', 'description', 'inventory'];
        const updates = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowedFields.includes(key)));
        const product = await Product.findOneAndUpdate({ id: Number(req.params.id) }, { $set: updates }, { new: true, runValidators: true }).lean();
        if (!product) return res.status(404).json({ message: 'Product not found' });
        res.json({ product });
    } catch (error) {
        next(error);
    }
});

app.delete('/api/admin/products/:id', authenticate, requireAdmin, async (req, res, next) => {
    try {
        const product = await Product.findOneAndDelete({ id: Number(req.params.id) }).lean();
        if (!product) return res.status(404).json({ message: 'Product not found' });
        res.json({ message: 'Product deleted' });
    } catch (error) {
        next(error);
    }
});

app.get('/api/admin/customers', authenticate, requireAdmin, async (req, res, next) => {
    try {
        const customers = await User.find({ role: 'customer' }).select('-passwordHash').sort({ createdAt: -1 }).lean();
        const customerIds = customers.map(customer => customer.id);
        const orderCounts = await Order.aggregate([
            { $match: { userId: { $in: customerIds } } },
            { $group: { _id: '$userId', orderCount: { $sum: 1 }, totalSpent: { $sum: '$total' } } }
        ]);
        const stats = new Map(orderCounts.map(item => [item._id, item]));
        res.json({ customers: customers.map(customer => ({
            ...customer,
            orderCount: stats.get(customer.id)?.orderCount || 0,
            totalSpent: stats.get(customer.id)?.totalSpent || 0
        })) });
    } catch (error) {
        next(error);
    }
});

app.get('/api/admin/orders', authenticate, requireAdmin, async (req, res, next) => {
    try {
        const orders = await Order.find().sort({ createdAt: -1 }).lean();
        const users = await User.find({ id: { $in: orders.map(order => order.userId) } }).select('id name email').lean();
        const usersById = new Map(users.map(user => [user.id, user]));
        res.json({ orders: orders.map(order => ({ ...order, customer: usersById.get(order.userId) || null })) });
    } catch (error) {
        next(error);
    }
});

app.patch('/api/admin/orders/:id/status', authenticate, requireAdmin, async (req, res, next) => {
    try {
        const allowedStatuses = ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Refunded', 'Payment Failed'];
        if (!allowedStatuses.includes(req.body.status)) return res.status(400).json({ message: 'Invalid order status' });
        const order = await Order.findOneAndUpdate({ id: req.params.id }, { $set: { status: req.body.status } }, { new: true }).lean();
        if (!order) return res.status(404).json({ message: 'Order not found' });
        const customer = await User.findOne({ id: order.userId }).lean();
        if (customer) sendOrderStatusUpdate(customer, order).catch(() => {});
        res.json({ order });
    } catch (error) {
        next(error);
    }
});

// Cart
app.get('/api/cart', authenticate, async (req, res, next) => {
    try {
        res.json({ cart: await getOrCreateCart(req.user.id) });
    } catch (error) {
        next(error);
    }
});

app.post('/api/cart/items', authenticate, async (req, res, next) => {
    try {
        const { productId, quantity = 1, color = 'Black', size = 'M' } = req.body;
        const requestedQuantity = Number(quantity);
        const product = await Product.findOne({ id: Number(productId) }).lean();
        if (!product) return res.status(404).json({ message: 'Product not found' });
        if (!Number.isInteger(requestedQuantity) || requestedQuantity < 1) return res.status(400).json({ message: 'Quantity must be a positive whole number' });

        const cart = await getOrCreateCart(req.user.id);
        const existingItem = cart.items.find(item => item.productId === product.id && item.color === color && item.size === size);
        if (existingItem) {
            existingItem.quantity += requestedQuantity;
        } else {
            cart.items.push({ productId: product.id, name: product.name, price: product.price, image: product.image, color, size, quantity: requestedQuantity });
        }
        cart.updatedAt = new Date();
        await cart.save();
        res.status(201).json({ cart });
    } catch (error) {
        next(error);
    }
});

app.patch('/api/cart/items/:productId', authenticate, async (req, res, next) => {
    try {
        const quantity = Number(req.body.quantity);
        if (!Number.isInteger(quantity) || quantity < 0) return res.status(400).json({ message: 'Quantity must be zero or a positive whole number' });
        const cart = await getOrCreateCart(req.user.id);
        const item = cart.items.find(cartItem => cartItem.productId === Number(req.params.productId));
        if (!item) return res.status(404).json({ message: 'Cart item not found' });
        if (quantity === 0) cart.items = cart.items.filter(cartItem => cartItem !== item);
        else item.quantity = quantity;
        cart.updatedAt = new Date();
        await cart.save();
        res.json({ cart });
    } catch (error) {
        next(error);
    }
});

app.delete('/api/cart/items/:productId', authenticate, async (req, res, next) => {
    try {
        const cart = await getOrCreateCart(req.user.id);
        const originalLength = cart.items.length;
        cart.items = cart.items.filter(item => item.productId !== Number(req.params.productId));
        if (cart.items.length === originalLength) return res.status(404).json({ message: 'Cart item not found' });
        cart.updatedAt = new Date();
        await cart.save();
        res.json({ cart });
    } catch (error) {
        next(error);
    }
});

// Wishlist
app.get('/api/wishlist', authenticate, async (req, res, next) => {
    try {
        const wishlist = await Wishlist.findOne({ userId: req.user.id }).lean();
        const wishlistProducts = wishlist ? await Product.find({ id: { $in: wishlist.productIds } }).lean() : [];
        res.json({ products: wishlistProducts });
    } catch (error) {
        next(error);
    }
});

app.post('/api/wishlist/:productId', authenticate, async (req, res, next) => {
    try {
        const product = await Product.findOne({ id: Number(req.params.productId) }).lean();
        if (!product) return res.status(404).json({ message: 'Product not found' });
        const wishlist = await Wishlist.findOneAndUpdate(
            { userId: req.user.id },
            { $addToSet: { productIds: product.id }, $set: { updatedAt: new Date() } },
            { new: true, upsert: true }
        );
        res.status(201).json({ product, wishlist });
    } catch (error) {
        next(error);
    }
});

app.delete('/api/wishlist/:productId', authenticate, async (req, res, next) => {
    try {
        const wishlist = await Wishlist.findOneAndUpdate(
            { userId: req.user.id },
            { $pull: { productIds: Number(req.params.productId) }, $set: { updatedAt: new Date() } },
            { new: true }
        );
        if (!wishlist) return res.status(404).json({ message: 'Wishlist item not found' });
        res.json({ wishlist });
    } catch (error) {
        next(error);
    }
});

// Razorpay payments
app.post('/api/payments/razorpay/order', authenticate, async (req, res, next) => {
    try {
        if (!razorpay) return res.status(503).json({ message: 'Razorpay is not configured on the server' });
        const cart = await getOrCreateCart(req.user.id);
        if (!cart.items.length) return res.status(400).json({ message: 'Cannot pay for an empty cart' });
        const delivery = getDelivery(req.body.delivery);
        const totals = getCartTotals(cart, delivery);
        const razorpayOrder = await razorpay.orders.create({
            amount: totals.total * 100,
            currency: 'INR',
            receipt: createId('receipt'),
            notes: { userId: req.user.id }
        });
        res.status(201).json({
            keyId: process.env.RAZORPAY_KEY_ID,
            razorpayOrderId: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency,
            totals
        });
    } catch (error) {
        next(error);
    }
});

app.post('/api/payments/razorpay/verify', authenticate, async (req, res, next) => {
    try {
        if (!process.env.RAZORPAY_KEY_SECRET) return res.status(503).json({ message: 'Razorpay is not configured on the server' });
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, address, delivery } = req.body;
        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !validateAddress(address)) {
            return res.status(400).json({ message: 'Payment details and a complete address are required' });
        }

        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest('hex');
        if (expectedSignature.length !== razorpay_signature.length) {
            return res.status(400).json({ message: 'Payment signature verification failed' });
        }
        const signaturesMatch = crypto.timingSafeEqual(
            Buffer.from(expectedSignature),
            Buffer.from(razorpay_signature)
        );
        if (!signaturesMatch) return res.status(400).json({ message: 'Payment signature verification failed' });

        const order = await createOrderFromCart(req.user.id, address, getDelivery(delivery), {
            type: 'razorpay', status: 'paid', providerOrderId: razorpay_order_id,
            providerPaymentId: razorpay_payment_id, providerSignature: razorpay_signature
        });
        res.status(201).json({ order });
    } catch (error) {
        next(error);
    }
});

// Orders

// MongoDB Coupon Endpoints
app.post('/api/coupons/validate', async (req, res, next) => {
    try {
        const { code = '', subtotal = 0, shipping = 100 } = req.body;
        const cleanCode = String(code).trim().toUpperCase();
        if (!cleanCode) return res.status(400).json({ valid: false, message: 'Please enter a coupon code' });

        const coupon = await Coupon.findOne({ code: cleanCode });
        if (!coupon || !coupon.isActive) {
            return res.status(404).json({ valid: false, message: 'Coupon "' + cleanCode + '" is invalid or expired' });
        }

        const orderSubtotal = Number(subtotal) || 0;
        if (orderSubtotal < (coupon.minOrderAmount || 0)) {
            return res.status(400).json({
                valid: false,
                message: 'Coupon requires a minimum order of ₹' + coupon.minOrderAmount + ' (Current: ₹' + orderSubtotal + ')'
            });
        }

        let discountAmount = 0;
        if (coupon.discountType === 'percentage') {
            discountAmount = Math.round((orderSubtotal * coupon.discountValue) / 100);
            if (coupon.maxDiscountAmount) {
                discountAmount = Math.min(discountAmount, coupon.maxDiscountAmount);
            }
        } else if (coupon.discountType === 'flat') {
            discountAmount = Math.min(coupon.discountValue, orderSubtotal);
        } else if (coupon.discountType === 'shipping') {
            discountAmount = Math.min(coupon.discountValue, Number(shipping) || 100);
        }

        res.json({
            valid: true,
            code: coupon.code,
            discountType: coupon.discountType,
            discountValue: coupon.discountValue,
            discountAmount,
            message: 'Coupon ' + coupon.code + ' applied! You saved ₹' + discountAmount
        });
    } catch (err) {
        next(err);
    }
});

app.get('/api/admin/coupons', authenticate, requireAdmin, async (req, res, next) => {
    try {
        const coupons = await Coupon.find().sort({ createdAt: -1 });
        res.json({ coupons });
    } catch (err) {
        next(err);
    }
});

app.post('/api/admin/coupons', authenticate, requireAdmin, async (req, res, next) => {
    try {
        const { code, discountType, discountValue, minOrderAmount = 0, maxDiscountAmount = null, description = '' } = req.body;
        if (!code || !discountType || discountValue === undefined) {
            return res.status(400).json({ message: 'Code, discount type, and value are required' });
        }
        const cleanCode = String(code).trim().toUpperCase();
        const existing = await Coupon.findOne({ code: cleanCode });
        if (existing) {
            return res.status(409).json({ message: 'A coupon with code "' + cleanCode + '" already exists' });
        }

        const coupon = await Coupon.create({
            code: cleanCode,
            discountType,
            discountValue: Number(discountValue),
            minOrderAmount: Number(minOrderAmount) || 0,
            maxDiscountAmount: maxDiscountAmount ? Number(maxDiscountAmount) : null,
            description: description || cleanCode + ' promo coupon'
        });
        res.status(201).json({ coupon });
    } catch (err) {
        next(err);
    }
});

app.patch('/api/admin/coupons/:code/toggle', authenticate, requireAdmin, async (req, res, next) => {
    try {
        const cleanCode = String(req.params.code).trim().toUpperCase();
        const coupon = await Coupon.findOne({ code: cleanCode });
        if (!coupon) return res.status(404).json({ message: 'Coupon not found' });
        coupon.isActive = !coupon.isActive;
        await coupon.save();
        res.json({ message: 'Coupon status updated', coupon });
    } catch (err) {
        next(err);
    }
});

app.delete('/api/admin/coupons/:code', authenticate, requireAdmin, async (req, res, next) => {
    try {
        const cleanCode = String(req.params.code).trim().toUpperCase();
        const deleted = await Coupon.findOneAndDelete({ code: cleanCode });
        if (!deleted) return res.status(404).json({ message: 'Coupon not found' });
        res.json({ message: 'Coupon deleted successfully' });
    } catch (err) {
        next(err);
    }
});

app.post('/api/orders', authenticate, async (req, res, next) => {
    try {
        const { address, delivery = { type: 'standard', cost: 100 }, payment = { type: 'cod' }, couponCode = '' } = req.body;
        const cart = await getOrCreateCart(req.user.id);
        if (!cart.items.length) return res.status(400).json({ message: 'Cannot place an order with an empty cart' });
        if (!address || !address.name || !address.street || !address.city || !address.state || !address.zip) return res.status(400).json({ message: 'A complete shipping address is required' });

        const subtotal = cart.items.reduce((total, item) => total + item.price * item.quantity, 0);
        const shipping = Number(delivery.cost) || 0;
        const tax = Math.round(subtotal * 0.1);
        const order = await Order.create({
            id: createId('ord'), userId: req.user.id, items: cart.items, address,
            delivery: { type: delivery.type, cost: shipping }, payment: { type: payment.type },
            subtotal, tax, shipping, discount,
            couponCode: appliedCode,
            total: Math.max(0, subtotal - discount + tax + shipping), status: 'Pending'
        });
        cart.items = [];
        await cart.save();
        res.status(201).json({ order });
    } catch (error) {
        next(error);
    }
});

app.get('/api/orders', authenticate, async (req, res, next) => {
    try {
        res.json({ orders: await Order.find({ userId: req.user.id }).sort({ createdAt: -1 }).lean() });
    } catch (error) {
        next(error);
    }
});

app.get('/api/orders/:id', authenticate, async (req, res, next) => {
    try {
        const order = await Order.findOne({ id: req.params.id, userId: req.user.id }).lean();
        if (!order) return res.status(404).json({ message: 'Order not found' });
        res.json({ order });
    } catch (error) {
        next(error);
    }
});


// ---------------------------------------------------------------------------
// Payment Routes (Standardized)
// ---------------------------------------------------------------------------
app.get('/api/payment/config', (req, res) => {
    res.json({ keyId: razorpayKeyId || '', configured: !!(razorpayKeyId && !razorpayKeyId.includes('your_')) });
});

app.post('/api/payment/create-order', authenticate, async (req, res, next) => {
    try {
        const { amount, currency = 'INR' } = req.body;
        if (!amount || isNaN(Number(amount))) return res.status(400).json({ message: 'amount is required' });
        const rzOrder = await createRazorpayOrder(Number(amount), currency, `epris_${Date.now()}`);
        res.json({ order: rzOrder, simulated: !!rzOrder.simulated });
    } catch (err) {
        next(err);
    }
});

app.post('/api/payment/verify', authenticate, async (req, res, next) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;
        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ message: 'Missing payment details' });
        }
        const isValid = verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
        if (!isValid) return res.status(400).json({ message: 'Invalid payment signature' });

        if (orderId) {
            const order = await Order.findOne({ id: orderId, userId: req.user.id });
            if (order) {
                order.status = 'Confirmed';
                order.payment = {
                    type: 'card',
                    status: 'paid',
                    providerOrderId: razorpay_order_id,
                    providerPaymentId: razorpay_payment_id,
                    providerSignature: razorpay_signature
                };
                await order.save();
                const user = await User.findOne({ id: req.user.id }).lean();
                if (user) sendOrderConfirmation(user, order).catch(() => {});
            }
        }
        res.json({ verified: true, paymentId: razorpay_payment_id });
    } catch (err) {
        next(err);
    }
});

// ---------------------------------------------------------------------------
// Product Reviews & Ratings (Mongo)
// ---------------------------------------------------------------------------
app.get('/api/products/:id/reviews', async (req, res, next) => {
    try {
        const productId = Number(req.params.id);
        const reviews = await Review.find({ productId }).sort({ createdAt: -1 }).lean();
        const total = reviews.length;
        const sum = reviews.reduce((acc, r) => acc + Number(r.rating || 0), 0);
        const average = total > 0 ? Number((sum / total).toFixed(1)) : 5.0;

        const breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
        reviews.forEach(r => {
            const rate = Math.round(Number(r.rating || 5));
            if (breakdown[rate] !== undefined) breakdown[rate]++;
        });

        res.json({ productId, averageRating: average, totalReviews: total, breakdown, reviews });
    } catch (err) {
        next(err);
    }
});

app.post('/api/products/:id/reviews', async (req, res, next) => {
    try {
        const productId = Number(req.params.id);
        const { rating, title, comment, userName } = req.body;
        if (!rating || Number(rating) < 1 || Number(rating) > 5) {
            return res.status(400).json({ message: 'Rating must be 1 to 5' });
        }
        if (!comment || !String(comment).trim()) {
            return res.status(400).json({ message: 'Review comment is required' });
        }

        let reviewerName = String(userName || '').trim() || 'Verified Customer';
        let userId = '';

        const authHeader = req.headers.authorization || '';
        if (authHeader.startsWith('Bearer ')) {
            try {
                const token = authHeader.slice(7);
                const decoded = jwt.verify(token, jwtSecret);
                const u = await User.findOne({ id: decoded.userId }).lean();
                if (u) { reviewerName = u.name; userId = u.id; }
            } catch (e) {}
        }

        const newReview = await Review.create({
            id: createId('rev'),
            productId,
            userId,
            userName: reviewerName,
            rating: Number(rating),
            title: String(title || '').trim() || 'Product Review',
            comment: String(comment).trim(),
            verifiedPurchase: true
        });

        const allReviews = await Review.find({ productId }).lean();
        const total = allReviews.length;
        const avg = Number((allReviews.reduce((sum, r) => sum + r.rating, 0) / total).toFixed(1));

        res.status(201).json({ review: newReview, averageRating: avg, totalReviews: total });
    } catch (err) {
        next(err);
    }
});

app.use((error, req, res, next) => {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
});

async function start() {
    console.log('🍃 Connecting to MongoDB Atlas at:', mongoUri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@'));
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    console.log('✅ Connected to MongoDB Atlas successfully.');
    await seedProductCollection();
    await seedCoupons();
    await ensureAdminUser();
    return new Promise((resolve) => {
        const server = app.listen(port, () => {
            console.log('\n======================================================');
            console.log(`🚀 EPRIS Fashion Store (MongoDB Atlas) running at http://localhost:${port}`);
            console.log(`   - Storefront: http://localhost:${port}/`);
            console.log(`   - Admin:      http://localhost:${port}/admin.html`);
            console.log(`   - API Base:   http://localhost:${port}/api`);
            console.log('======================================================\n');
            resolve(server);
        });
    });
}

module.exports = { app, start };
