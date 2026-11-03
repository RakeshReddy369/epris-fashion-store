require('dotenv').config({ path: require('path').join(__dirname, '.env') });

// Automatically delegate to MongoDB Atlas if MONGODB_URI is configured
const configuredMongoUri = String(process.env.MONGODB_URI || process.env.MONGO_URI || '').trim();
if (configuredMongoUri.startsWith('mongodb')) {
    console.log('🍃 MONGODB_URI detected: Booting EPRIS store with MongoDB Atlas backend...');
    const mongoBackend = require('./server-mongo');
    if (require.main === module) {
        mongoBackend.start().catch(err => {
            console.error('❌ Failed to connect to MongoDB Atlas:', err.message);
            console.error('   Please verify connection string, credentials, and Network Access (0.0.0.0/0).');
            process.exit(1);
        });
    }
    module.exports = mongoBackend;
    return;
}

const express = require('express');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const products = require('./products');
const { readDatabase, writeDatabase } = require('./store');
const { sendOrderConfirmation, sendOrderStatusUpdate, sendWelcomeEmail } = require('./email');
const { createRazorpayOrder, verifyRazorpaySignature, keyId: razorpayKeyId } = require('./payment');

const app = express();
const port = Number(process.env.PORT) || 3000;
const jwtSecret = process.env.JWT_SECRET || 'development-secret-change-me';
const corsOrigin = process.env.CORS_ORIGIN || '*';
const googleClientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
const facebookAppId = String(process.env.FACEBOOK_APP_ID || '').trim();
const googleOAuthClient = new OAuth2Client(googleClientId || undefined);

app.use(cors({ origin: corsOrigin }));
app.use(express.json());
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
        role: user.role || 'customer',
        googleLinked: !!user.googleId,
        facebookLinked: !!user.facebookId
    };
}

function createToken(user) {
    return jwt.sign({ userId: user.id }, jwtSecret, { expiresIn: '7d' });
}

function authenticate(req, res, next) {
    const authorization = req.headers.authorization || '';
    const token = authorization.startsWith('Bearer ')
        ? authorization.slice(7)
        : null;

    if (!token) {
        return res.status(401).json({ message: 'Authentication required' });
    }

    try {
        req.userId = jwt.verify(token, jwtSecret).userId;
        next();
    } catch (error) {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
}

function findProduct(productId) {
    const database = readDatabase();
    const catalog = (database.products && database.products.length) ? database.products : products;
    return catalog.find(product => product.id === Number(productId));
}

function getCart(database, userId) {
    return database.carts.find(cart => cart.userId === userId) || {
        userId,
        items: []
    };
}

function saveCart(database, cart) {
    const index = database.carts.findIndex(savedCart => savedCart.userId === cart.userId);
    if (index === -1) {
        database.carts.push(cart);
    } else {
        database.carts[index] = cart;
    }
}

function validateAddress(address) {
    return !!(address && address.name && address.street && address.city && address.state && address.zip);
}

function buildOrderFromCart(database, userId, address, delivery, payment) {
    const cart = getCart(database, userId);
    if (!cart.items.length) {
        throw new Error('Cannot place an order with an empty cart');
    }
    if (!validateAddress(address)) {
        throw new Error('A complete shipping address is required');
    }

    const subtotal = cart.items.reduce((total, item) => total + Number(item.price || 0) * Number(item.quantity || 1), 0);
    const shipping = Number(delivery?.cost) || 0;
    const tax = Math.round(subtotal * 0.1);
    const order = {
        id: createId('ord'),
        userId,
        items: cart.items,
        address,
        delivery: { type: delivery?.type || 'standard', cost: shipping },
        payment: { type: payment?.type || 'cod' },
        subtotal,
        tax,
        shipping,
        discount,
        couponCode: appliedCode,
        total: Math.max(0, subtotal - discount + tax + shipping),
        status: 'Pending',
        createdAt: new Date().toISOString()
    };

    database.orders.push(order);
    cart.items = [];
    saveCart(database, cart);
    return order;
}

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'epris-fashion-api' });
});

// Automatically ensure admin account exists
async function ensureAdminUser() {
    const adminEmail = String(process.env.ADMIN_EMAIL || 'admin@epris.com').trim().toLowerCase();
    const adminPassword = String(process.env.ADMIN_PASSWORD || 'ChangeMe!2026').trim();
    const database = readDatabase();
    let admin = database.users.find(u => String(u.email).toLowerCase() === adminEmail);
    if (!admin) {
        admin = {
            id: createId('usr'),
            name: 'Admin',
            email: adminEmail,
            phone: '',
            passwordHash: await bcrypt.hash(adminPassword, 12),
            role: 'admin',
            addresses: [],
            createdAt: new Date().toISOString()
        };
        database.users.push(admin);
        writeDatabase(database);
        console.log('[Admin] Created admin account: ' + adminEmail);
    } else {
        admin.role = 'admin';
        admin.passwordHash = await bcrypt.hash(adminPassword, 12);
        writeDatabase(database);
        console.log('[Admin] Admin user confirmed: ' + adminEmail);
    }
}

// Admin seed - accessible via GET or POST
app.all('/api/admin/seed', async (req, res) => {
    try {
        await ensureAdminUser();
        const adminEmail = String(process.env.ADMIN_EMAIL || 'admin@epris.com').trim().toLowerCase();
        res.json({
            status: 'ok',
            message: 'Admin account is ready for login',
            email: adminEmail,
            role: 'admin'
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Authentication
app.get('/api/auth/google/config', (req, res) => {
    res.json({ clientId: googleClientId });
});

app.post('/api/auth/google', async (req, res) => {
    const credential = String(req.body.credential || '');
    if (!credential) return res.status(400).json({ message: 'Google credential is required' });

    let email, name, googleSub;

    // Development demo support if GOOGLE_CLIENT_ID is not configured
    if ((!googleClientId || googleClientId.startsWith('your-')) && credential.startsWith('demo_')) {
        email = String(req.body.email || 'demo.google@gmail.com').trim().toLowerCase();
        name = String(req.body.name || 'Google Demo User').trim();
        googleSub = 'g_sub_' + Buffer.from(email).toString('hex').slice(0, 16);
    } else {
        if (!googleClientId || googleClientId.startsWith('your-')) {
            return res.status(503).json({ message: 'Google sign-in is not configured on the server. Set GOOGLE_CLIENT_ID in api/.env.' });
        }

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

        email = payload.email.trim().toLowerCase();
        name = String(payload.name || email.split('@')[0]).trim();
        googleSub = payload.sub;
    }

    const database = readDatabase();
    let user = database.users.find(candidate => candidate.googleId === googleSub);

    if (!user) {
        user = database.users.find(candidate => String(candidate.email).trim().toLowerCase() === email);
        if (user) {
            if (user.googleId && user.googleId !== googleSub) {
                return res.status(409).json({ message: 'This email is linked to a different Google account' });
            }
            user.googleId = googleSub;
        } else {
            user = {
                id: createId('usr'),
                name,
                email,
                phone: '',
                passwordHash: '',
                googleId: googleSub,
                role: 'customer',
                addresses: [],
                createdAt: new Date().toISOString()
            };
            database.users.push(user);
        }
        writeDatabase(database);
    }

    res.json({ user: publicUser(user), token: createToken(user) });
});


// Facebook Authentication
app.get('/api/auth/facebook/config', (req, res) => {
    res.json({ appId: facebookAppId, configured: !!(facebookAppId && !facebookAppId.startsWith('your-')) });
});

app.post('/api/auth/facebook', async (req, res) => {
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

        try {
            const fbRes = await fetch(`https://graph.facebook.com/me?fields=id,name,email&access_token=${encodeURIComponent(accessToken)}`);
            const fbData = await fbRes.json();
            if (!fbRes.ok || !fbData || !fbData.id) {
                return res.status(401).json({ message: fbData?.error?.message || 'Facebook token verification failed' });
            }

            fbId = fbData.id;
            name = fbData.name || 'Facebook User';
            email = fbData.email ? fbData.email.trim().toLowerCase() : `fb_${fbId}@facebook.user`;
        } catch (err) {
            console.error('Facebook verification error:', err.message);
            return res.status(502).json({ message: 'Could not connect to Facebook verification service' });
        }
    }

    const database = readDatabase();
    let user = database.users.find(candidate => candidate.facebookId === fbId);

    if (!user) {
        user = database.users.find(candidate => String(candidate.email).trim().toLowerCase() === email);
        if (user) {
            if (user.facebookId && user.facebookId !== fbId) {
                return res.status(409).json({ message: 'This email is linked to a different Facebook account' });
            }
            user.facebookId = fbId;
        } else {
            user = {
                id: createId('usr'),
                name,
                email,
                phone: '',
                passwordHash: '',
                facebookId: fbId,
                role: 'customer',
                addresses: [],
                createdAt: new Date().toISOString()
            };
            database.users.push(user);
            sendWelcomeEmail(user).catch(() => {});
        }
        writeDatabase(database);
    }

    res.json({ user: publicUser(user), token: createToken(user) });
});

app.post('/api/auth/register', async (req, res) => {
    const { name, email, password, phone = '' } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!name || !normalizedEmail || !password) {
        return res.status(400).json({ message: 'Name, email, and password are required' });
    }
    if (password.length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const database = readDatabase();
    if (database.users.some(user => user.email === normalizedEmail)) {
        return res.status(409).json({ message: 'An account with this email already exists' });
    }

    const user = {
        id: createId('usr'),
        name: String(name).trim(),
        email: normalizedEmail,
        phone: String(phone).trim(),
        passwordHash: await bcrypt.hash(password, 12),
        createdAt: new Date().toISOString()
    };
    database.users.push(user);
    writeDatabase(database);

    // Send welcome email (non-blocking)
    sendWelcomeEmail(user).catch(() => {});

    res.status(201).json({ user: publicUser(user), token: createToken(user) });
});

app.post('/api/auth/login', async (req, res) => {
    const normalizedEmail = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const database = readDatabase();
    const user = database.users.find(candidate => candidate.email === normalizedEmail);

    if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
        return res.status(401).json({ message: 'Invalid email or password' });
    }

    res.json({ user: publicUser(user), token: createToken(user) });
});

app.get('/api/auth/me', authenticate, (req, res) => {
    const database = readDatabase();
    const user = database.users.find(candidate => candidate.id === req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user: publicUser(user) });
});

app.patch('/api/auth/me', authenticate, (req, res) => {
    const { name, phone = '' } = req.body;
    const database = readDatabase();
    const user = database.users.find(candidate => candidate.id === req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!name || !String(name).trim()) return res.status(400).json({ message: 'Name is required' });

    user.name = String(name).trim();
    user.phone = String(phone).trim();
    writeDatabase(database);
    res.json({ user: publicUser(user) });
});

app.post('/api/auth/change-password', authenticate, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const database = readDatabase();
    const user = database.users.find(candidate => candidate.id === req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!currentPassword || !newPassword) return res.status(400).json({ message: 'Current and new passwords are required' });
    if (newPassword.length < 6) return res.status(400).json({ message: 'New password must be at least 6 characters' });

    const isValid = await bcrypt.compare(String(currentPassword), user.passwordHash);
    if (!isValid) return res.status(401).json({ message: 'Current password is incorrect' });

    user.passwordHash = await bcrypt.hash(String(newPassword), 12);
    writeDatabase(database);
    res.json({ message: 'Password changed successfully' });
});

// Products
app.get('/api/products', (req, res) => {
    const search = String(req.query.search || '').trim().toLowerCase();
    const category = String(req.query.category || '').trim().toLowerCase();
    const minPrice = Number(req.query.minPrice ?? 0);
    const maxPrice = Number(req.query.maxPrice ?? Number.MAX_SAFE_INTEGER);

    const database = readDatabase();
    const catalog = (database.products && database.products.length) ? database.products : products;

    const filteredProducts = catalog.filter(product => {
        const matchesSearch = !search || `${product.name} ${product.category}`.toLowerCase().includes(search);
        const matchesCategory = !category || product.category.toLowerCase() === category;
        const matchesPrice = product.price >= minPrice && product.price <= maxPrice;
        return matchesSearch && matchesCategory && matchesPrice;
    });

    const allReviews = database.reviews || [];
    const productsWithRatings = filteredProducts.map(p => {
        const pReviews = allReviews.filter(r => r.productId === p.id);
        const avg = pReviews.length
            ? Number((pReviews.reduce((sum, r) => sum + r.rating, 0) / pReviews.length).toFixed(1))
            : (p.id % 2 === 0 ? 4.9 : 4.8);
        return {
            ...p,
            rating: avg,
            reviewCount: pReviews.length || (p.id <= 5 ? 3 : 1),
            isNew: p.id <= 4 || p.category === 'Shoes'
        };
    });

    res.json({ products: productsWithRatings, count: productsWithRatings.length });
});

app.get('/api/products/:id', (req, res) => {
    const database = readDatabase();
    const catalog = (database.products && database.products.length) ? database.products : products;
    const product = catalog.find(p => p.id === Number(req.params.id));
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json({ product });
});

// Product Reviews & Ratings
app.get('/api/products/:id/reviews', (req, res) => {
    const productId = Number(req.params.id);
    const database = readDatabase();
    const allReviews = database.reviews || [];
    const productReviews = allReviews.filter(r => Number(r.productId) === productId);

    const total = productReviews.length;
    const sum = productReviews.reduce((acc, r) => acc + Number(r.rating || 0), 0);
    const average = total > 0 ? Number((sum / total).toFixed(1)) : 5.0;

    const breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    productReviews.forEach(r => {
        const rate = Math.round(Number(r.rating || 5));
        if (breakdown[rate] !== undefined) breakdown[rate]++;
    });

    res.json({
        productId,
        averageRating: average,
        totalReviews: total,
        breakdown,
        reviews: productReviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    });
});

app.post('/api/products/:id/reviews', (req, res) => {
    const productId = Number(req.params.id);
    const { rating, title, comment, userName } = req.body;

    if (!rating || Number(rating) < 1 || Number(rating) > 5) {
        return res.status(400).json({ message: 'Rating must be a number between 1 and 5' });
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
            const database = readDatabase();
            const u = database.users.find(candidate => candidate.id === decoded.userId);
            if (u) {
                reviewerName = u.name;
                userId = u.id;
            }
        } catch (e) {
            // Optional auth
        }
    }

    const database = readDatabase();
    if (!database.reviews) database.reviews = [];

    const newReview = {
        id: createId('rev'),
        productId,
        userId,
        userName: reviewerName,
        rating: Number(rating),
        title: String(title || '').trim() || 'Product Review',
        comment: String(comment).trim(),
        verifiedPurchase: true,
        createdAt: new Date().toISOString()
    };

    database.reviews.push(newReview);
    writeDatabase(database);

    const productReviews = database.reviews.filter(r => Number(r.productId) === productId);
    const total = productReviews.length;
    const avg = Number((productReviews.reduce((sum, r) => sum + r.rating, 0) / total).toFixed(1));

    res.status(201).json({
        review: newReview,
        averageRating: avg,
        totalReviews: total
    });
});

// Cart
app.get('/api/cart', authenticate, (req, res) => {
    const database = readDatabase();
    res.json({ cart: getCart(database, req.userId) });
});

app.post('/api/cart/items', authenticate, (req, res) => {
    const { productId, quantity = 1, color = 'Black', size = 'M' } = req.body;
    const product = findProduct(productId);
    const requestedQuantity = Number(quantity);

    if (!product) return res.status(404).json({ message: 'Product not found' });
    if (!Number.isInteger(requestedQuantity) || requestedQuantity < 1) {
        return res.status(400).json({ message: 'Quantity must be a positive whole number' });
    }

    const database = readDatabase();
    const cart = getCart(database, req.userId);
    const existingItem = cart.items.find(item => item.productId === product.id && item.color === color && item.size === size);

    if (existingItem) {
        existingItem.quantity += requestedQuantity;
    } else {
        cart.items.push({
            productId: product.id,
            name: product.name,
            price: product.price,
            image: product.image,
            color,
            size,
            quantity: requestedQuantity
        });
    }

    saveCart(database, cart);
    writeDatabase(database);
    res.status(201).json({ cart });
});

app.patch('/api/cart/items/:productId', authenticate, (req, res) => {
    const quantity = Number(req.body.quantity);
    if (!Number.isInteger(quantity) || quantity < 0) {
        return res.status(400).json({ message: 'Quantity must be zero or a positive whole number' });
    }

    const database = readDatabase();
    const cart = getCart(database, req.userId);
    const item = cart.items.find(cartItem => cartItem.productId === Number(req.params.productId));
    if (!item) return res.status(404).json({ message: 'Cart item not found' });

    if (quantity === 0) {
        cart.items = cart.items.filter(cartItem => cartItem !== item);
    } else {
        item.quantity = quantity;
    }

    saveCart(database, cart);
    writeDatabase(database);
    res.json({ cart });
});

app.delete('/api/cart/items/:productId', authenticate, (req, res) => {
    const database = readDatabase();
    const cart = getCart(database, req.userId);
    const originalLength = cart.items.length;
    cart.items = cart.items.filter(item => item.productId !== Number(req.params.productId));

    if (cart.items.length === originalLength) {
        return res.status(404).json({ message: 'Cart item not found' });
    }

    saveCart(database, cart);
    writeDatabase(database);
    res.json({ cart });
});

// Wishlist
app.get('/api/wishlist', authenticate, (req, res) => {
    const database = readDatabase();
    const wishlist = database.wishlists.find(item => item.userId === req.userId) || { userId: req.userId, productIds: [] };
    res.json({ products: wishlist.productIds.map(findProduct).filter(Boolean) });
});

app.post('/api/wishlist/:productId', authenticate, (req, res) => {
    const product = findProduct(req.params.productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const database = readDatabase();
    let wishlist = database.wishlists.find(item => item.userId === req.userId);
    if (!wishlist) {
        wishlist = { userId: req.userId, productIds: [] };
        database.wishlists.push(wishlist);
    }
    if (!wishlist.productIds.includes(product.id)) wishlist.productIds.push(product.id);
    writeDatabase(database);
    res.status(201).json({ product });
});

app.delete('/api/wishlist/:productId', authenticate, (req, res) => {
    const database = readDatabase();
    const wishlist = database.wishlists.find(item => item.userId === req.userId);
    if (!wishlist) return res.status(404).json({ message: 'Wishlist item not found' });

    const productId = Number(req.params.productId);
    const originalLength = wishlist.productIds.length;
    wishlist.productIds = wishlist.productIds.filter(id => id !== productId);
    if (wishlist.productIds.length === originalLength) {
        return res.status(404).json({ message: 'Wishlist item not found' });
    }

    writeDatabase(database);
    res.json({ message: 'Product removed from wishlist' });
});

// Addresses
app.get('/api/addresses', authenticate, (req, res) => {
    const database = readDatabase();
    const user = database.users.find(candidate => candidate.id === req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ addresses: user.addresses || [] });
});

app.post('/api/addresses', authenticate, (req, res) => {
    const { type = 'home', name, phone = '', street, city, state, zip, isDefault = false } = req.body;
    const database = readDatabase();
    const user = database.users.find(candidate => candidate.id === req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!name || !street || !city || !state || !zip) {
        return res.status(400).json({ message: 'Name, street, city, state, and ZIP are required' });
    }

    if (isDefault) {
        user.addresses = (user.addresses || []).map(address => ({ ...address, isDefault: false }));
    }

    const address = {
        id: createId('adr'),
        type,
        name: String(name).trim(),
        phone: String(phone).trim(),
        street: String(street).trim(),
        city: String(city).trim(),
        state: String(state).trim(),
        zip: String(zip).trim(),
        isDefault: Boolean(isDefault)
    };

    user.addresses = user.addresses || [];
    user.addresses.push(address);
    writeDatabase(database);
    res.status(201).json({ addresses: user.addresses });
});

app.delete('/api/addresses/:addressId', authenticate, (req, res) => {
    const database = readDatabase();
    const user = database.users.find(candidate => candidate.id === req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const previousLength = (user.addresses || []).length;
    user.addresses = (user.addresses || []).filter(address => String(address.id) !== String(req.params.addressId));
    if (user.addresses.length === previousLength) {
        return res.status(404).json({ message: 'Address not found' });
    }

    writeDatabase(database);
    res.json({ addresses: user.addresses });
});


// Default coupons
const defaultCoupons = [
    { code: 'WELCOME10', discountType: 'percentage', discountValue: 10, minOrderAmount: 500, maxDiscountAmount: 1000, isActive: true, usedCount: 0, description: '10% off on orders above ₹500' },
    { code: 'EPRIS500', discountType: 'flat', discountValue: 500, minOrderAmount: 2000, maxDiscountAmount: null, isActive: true, usedCount: 0, description: 'Flat ₹500 off on orders above ₹2,000' },
    { code: 'FREESHIP', discountType: 'shipping', discountValue: 100, minOrderAmount: 1000, maxDiscountAmount: null, isActive: true, usedCount: 0, description: 'Free Delivery on orders above ₹1,000' },
    { code: 'FESTIVE25', discountType: 'percentage', discountValue: 25, minOrderAmount: 2500, maxDiscountAmount: 2000, isActive: true, usedCount: 0, description: '25% festive discount on orders above ₹2,500' }
];

function getCoupons(database) {
    if (!database.coupons) {
        database.coupons = [...defaultCoupons];
        writeDatabase(database);
    }
    return database.coupons;
}

// Public: Validate Coupon
app.post('/api/coupons/validate', (req, res) => {
    const { code = '', subtotal = 0, shipping = 100 } = req.body;
    const cleanCode = String(code).trim().toUpperCase();
    if (!cleanCode) return res.status(400).json({ valid: false, message: 'Please enter a coupon code' });

    const database = readDatabase();
    const coupons = getCoupons(database);
    const coupon = coupons.find(c => c.code.toUpperCase() === cleanCode);

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
});

// Admin: Get all coupons
app.get('/api/admin/coupons', authenticate, requireAdmin, (req, res) => {
    const database = readDatabase();
    res.json({ coupons: getCoupons(database) });
});

// Admin: Create new coupon
app.post('/api/admin/coupons', authenticate, requireAdmin, (req, res) => {
    const { code, discountType, discountValue, minOrderAmount = 0, maxDiscountAmount = null, description = '' } = req.body;
    if (!code || !discountType || discountValue === undefined) {
        return res.status(400).json({ message: 'Code, discount type, and value are required' });
    }
    const cleanCode = String(code).trim().toUpperCase();
    const database = readDatabase();
    const coupons = getCoupons(database);

    if (coupons.some(c => c.code.toUpperCase() === cleanCode)) {
        return res.status(409).json({ message: 'A coupon with code "' + cleanCode + '" already exists' });
    }

    const newCoupon = {
        code: cleanCode,
        discountType,
        discountValue: Number(discountValue),
        minOrderAmount: Number(minOrderAmount) || 0,
        maxDiscountAmount: maxDiscountAmount ? Number(maxDiscountAmount) : null,
        isActive: true,
        usedCount: 0,
        description: description || `${cleanCode} promo coupon`,
        createdAt: new Date().toISOString()
    };
    coupons.push(newCoupon);
    writeDatabase(database);
    res.status(201).json({ coupon: newCoupon });
});

// Admin: Toggle coupon active/disabled
app.patch('/api/admin/coupons/:code/toggle', authenticate, requireAdmin, (req, res) => {
    const cleanCode = String(req.params.code).trim().toUpperCase();
    const database = readDatabase();
    const coupons = getCoupons(database);
    const coupon = coupons.find(c => c.code.toUpperCase() === cleanCode);
    if (!coupon) return res.status(404).json({ message: 'Coupon not found' });

    coupon.isActive = !coupon.isActive;
    writeDatabase(database);
    res.json({ message: 'Coupon status updated', coupon });
});

// Admin: Delete coupon
app.delete('/api/admin/coupons/:code', authenticate, requireAdmin, (req, res) => {
    const cleanCode = String(req.params.code).trim().toUpperCase();
    const database = readDatabase();
    const coupons = getCoupons(database);
    const initialLen = coupons.length;
    database.coupons = coupons.filter(c => c.code.toUpperCase() !== cleanCode);
    if (database.coupons.length === initialLen) {
        return res.status(404).json({ message: 'Coupon not found' });
    }
    writeDatabase(database);
    res.json({ message: 'Coupon deleted successfully' });
});

// Orders
app.post('/api/orders', authenticate, (req, res) => {
    const { address, delivery = { type: 'standard', cost: 100 }, payment = { type: 'cod' }, couponCode = '', items: customItems } = req.body;
    const database = readDatabase();
    const cart = getCart(database, req.userId);
    const orderItems = (Array.isArray(customItems) && customItems.length > 0) ? customItems : cart.items;

    if (!orderItems.length) return res.status(400).json({ message: 'Cannot place an order with an empty cart' });
    if (!address || !address.name || !address.street || !address.city || !address.state || !address.zip) {
        return res.status(400).json({ message: 'A complete shipping address is required' });
    }

    const subtotal = orderItems.reduce((total, item) => total + (Number(item.price) || 0) * (Number(item.quantity) || 1), 0);
    let shipping = Number(delivery.cost) || 0;
    const tax = Math.round(subtotal * 0.1);
    let discount = 0;
    let appliedCode = '';

    if (couponCode) {
        const coupons = getCoupons(database);
        const cp = coupons.find(c => c.code.toUpperCase() === String(couponCode).trim().toUpperCase() && c.isActive);
        if (cp && subtotal >= (cp.minOrderAmount || 0)) {
            appliedCode = cp.code;
            if (cp.discountType === 'percentage') {
                discount = Math.round((subtotal * cp.discountValue) / 100);
                if (cp.maxDiscountAmount) discount = Math.min(discount, cp.maxDiscountAmount);
            } else if (cp.discountType === 'flat') {
                discount = Math.min(cp.discountValue, subtotal);
            } else if (cp.discountType === 'shipping') {
                discount = Math.min(cp.discountValue, shipping);
            }
            cp.usedCount = (cp.usedCount || 0) + 1;
        }
    }

    const paymentType = payment && payment.type ? payment.type : 'cod';
    const isCod = paymentType === 'cod';
    const isUpi = paymentType === 'upi';
    const isCard = paymentType === 'card';
    const isWallet = paymentType === 'wallet';
    const isBank = paymentType === 'bank';

    if (!isCod && !isUpi && !isCard && !isWallet && !isBank) {
        return res.status(400).json({ message: 'Invalid payment method selected' });
    }

    let isPaid = false;
    let orderStatus = 'Pending';
    let paymentStatus = 'pending';

    // 1. Credit / Debit Card (Must be cryptographically verified online)
    if (isCard) {
        const { providerOrderId, providerPaymentId, providerSignature } = payment;
        if (!providerOrderId || !providerPaymentId || !providerSignature) {
            return res.status(400).json({ message: 'Payment verification failed: Missing card transaction authentication. Order cannot be placed without verified payment.' });
        }
        const isValid = verifyRazorpaySignature(providerOrderId, providerPaymentId, providerSignature);
        if (!isValid) {
            return res.status(400).json({ message: 'Payment verification failed: Invalid cryptographic bank signature. Order cannot be placed without verified payment.' });
        }
        isPaid = true;
        orderStatus = 'Confirmed';
        paymentStatus = 'paid';
    }
    // 2. Digital Wallet (Amazon Pay, Mobikwik) & Net Banking (Direct Bank Transfer)
    else if (isWallet || isBank) {
        const { providerOrderId, providerPaymentId, providerSignature } = payment;
        if (providerSignature && providerOrderId && providerPaymentId) {
            const isValid = verifyRazorpaySignature(providerOrderId, providerPaymentId, providerSignature);
            if (!isValid) {
                return res.status(400).json({ message: 'Payment verification failed: Invalid cryptographic bank signature. Order cannot be placed without verified payment.' });
            }
            isPaid = true;
            orderStatus = 'Confirmed';
            paymentStatus = 'paid';
        } else if (providerPaymentId && String(providerPaymentId).trim().length >= 6) {
            isPaid = false;
            orderStatus = 'Payment Verification Pending';
            paymentStatus = 'pending_verification';
        } else {
            return res.status(400).json({ message: 'Payment verification failed: A valid 12-digit transaction UTR reference or completed gateway payment is required before your order can be placed.' });
        }
    }
    // 3. Dynamic UPI QR (Rakesh)
    else if (isUpi) {
        const utr = payment && (payment.providerPaymentId || payment.utrNumber);
        if (!utr || String(utr).trim().length < 6) {
            return res.status(400).json({ message: 'Please provide a valid 12-digit UPI UTR / Reference number from your payment receipt.' });
        }
        isPaid = false;
        orderStatus = 'Payment Verification Pending';
        paymentStatus = 'pending_verification';
    }
    // 4. Cash on Delivery (COD)
    else if (isCod) {
        isPaid = false;
        orderStatus = 'Confirmed';
        paymentStatus = 'pending';
    }

    const order = {
        id: createId('ord'),
        userId: req.userId,
        items: orderItems,
        address,
        delivery: { type: delivery.type, cost: shipping },
        payment: {
            type: payment.type || 'cod',
            status: paymentStatus,
            providerOrderId: payment.providerOrderId || null,
            providerPaymentId: payment.providerPaymentId || payment.utrNumber || (isPaid ? ('PAY_' + Date.now()) : null),
            walletProvider: payment.walletProvider || undefined,
            bankCode: payment.bankCode || undefined,
            paidAt: isPaid ? (payment.paidAt || new Date().toISOString()) : null
        },
        subtotal,
        tax,
        shipping,
        discount,
        couponCode: appliedCode,
        total: Math.max(0, subtotal - discount + tax + shipping),
        status: orderStatus,
        createdAt: new Date().toISOString()
    };

    database.orders.push(order);
    if (Array.isArray(customItems) && customItems.length > 0) {
        const purchasedIds = new Set(customItems.map(i => String(i.productId || i.id)));
        cart.items = cart.items.filter(i => !purchasedIds.has(String(i.productId || i.id)));
    } else {
        cart.items = [];
    }
    saveCart(database, cart);
    writeDatabase(database);

    // Send order confirmation email (non-blocking)
    const buyer = database.users.find(u => u.id === req.userId);
    if (buyer) sendOrderConfirmation(buyer, order).catch(() => {});

    res.status(201).json({ order });
});

app.get('/api/orders', authenticate, (req, res) => {
    const database = readDatabase();
    const orders = database.orders.filter(order => order.userId === req.userId);
    res.json({ orders });
});

app.get('/api/orders/:id', authenticate, (req, res) => {
    const database = readDatabase();
    const currentUser = database.users.find(u => u.id === req.userId);
    const isAdmin = currentUser && currentUser.role === 'admin';
    const order = database.orders.find(candidate => candidate.id === req.params.id && (isAdmin || candidate.userId === req.userId));
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json({ order });
});

// Admin middleware
function requireAdmin(req, res, next) {
    const database = readDatabase();
    const user = database.users.find(u => u.id === req.userId);
    if (!user || user.role !== 'admin') {
        return res.status(403).json({ message: 'Administrator access required' });
    }
    next();
}

function getProducts(database) {
    if (!database.products || !database.products.length) {
        database.products = products.map(p => ({ ...p }));
        writeDatabase(database);
    }
    return database.products;
}

// Admin: Products
app.get('/api/admin/products', authenticate, requireAdmin, (req, res) => {
    const database = readDatabase();
    res.json({ products: getProducts(database) });
});

app.post('/api/admin/products', authenticate, requireAdmin, (req, res) => {
    const { name, category, price, originalPrice, inventory, image, description } = req.body;
    if (!name || !category || price == null) {
        return res.status(400).json({ message: 'Name, category, and price are required' });
    }
    const database = readDatabase();
    const allProducts = getProducts(database);
    const newProduct = {
        id: Math.max(0, ...allProducts.map(p => p.id)) + 1,
        name: String(name).trim(),
        category: String(category).trim(),
        price: Number(price),
        originalPrice: Number(originalPrice || price),
        inventory: Number(inventory || 0),
        image: String(image || '').trim(),
        description: String(description || '').trim(),
        freeTrial: false
    };
    allProducts.push(newProduct);
    database.products = allProducts;
    writeDatabase(database);
    res.status(201).json({ product: newProduct });
});

app.patch('/api/admin/products/:id', authenticate, requireAdmin, (req, res) => {
    const database = readDatabase();
    const allProducts = getProducts(database);
    const index = allProducts.findIndex(p => p.id === Number(req.params.id));
    if (index === -1) return res.status(404).json({ message: 'Product not found' });
    const { name, category, price, originalPrice, inventory, image, description } = req.body;
    if (name != null) allProducts[index].name = String(name).trim();
    if (category != null) allProducts[index].category = String(category).trim();
    if (price != null) allProducts[index].price = Number(price);
    if (originalPrice != null) allProducts[index].originalPrice = Number(originalPrice);
    if (inventory != null) allProducts[index].inventory = Number(inventory);
    if (image != null) allProducts[index].image = String(image).trim();
    if (description != null) allProducts[index].description = String(description).trim();
    database.products = allProducts;
    writeDatabase(database);
    res.json({ product: allProducts[index] });
});

app.delete('/api/admin/products/:id', authenticate, requireAdmin, (req, res) => {
    const database = readDatabase();
    const allProducts = getProducts(database);
    const index = allProducts.findIndex(p => p.id === Number(req.params.id));
    if (index === -1) return res.status(404).json({ message: 'Product not found' });
    allProducts.splice(index, 1);
    database.products = allProducts;
    writeDatabase(database);
    res.json({ message: 'Product deleted' });
});

// Admin: Orders
app.get('/api/admin/orders', authenticate, requireAdmin, (req, res) => {
    const database = readDatabase();
    const orders = database.orders.map(order => {
        const customer = database.users.find(u => u.id === order.userId);
        return {
            ...order,
            customer: customer ? { name: customer.name, email: customer.email } : null,
            payment: { ...order.payment, status: order.payment?.status || (order.status === 'Delivered' ? 'paid' : 'pending') }
        };
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ orders });
});

app.patch('/api/admin/orders/:id/status', authenticate, requireAdmin, (req, res) => {
    const { status } = req.body;
    const validStatuses = ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Refunded', 'Payment Failed', 'Payment Verification Pending'];
    if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ message: `Status must be one of: ${validStatuses.join(', ')}` });
    }
    const database = readDatabase();
    const order = database.orders.find(o => o.id === req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    order.status = status;
    if (status === 'Confirmed' && order.payment) {
        order.payment.status = 'paid';
        order.payment.paidAt = new Date().toISOString();
    }
    writeDatabase(database);

    // Send status update email (non-blocking)
    const customer = database.users.find(u => u.id === order.userId);
    if (customer) sendOrderStatusUpdate(customer, order).catch(() => {});

    res.json({ order });
});

// Admin: Customers
app.get('/api/admin/customers', authenticate, requireAdmin, (req, res) => {
    const database = readDatabase();
    const customers = database.users.map(user => {
        const userOrders = database.orders.filter(o => o.userId === user.id);
        const bookedMap = new Map();
        userOrders.forEach(o => {
            (o.items || []).forEach(item => {
                const current = bookedMap.get(item.name) || 0;
                bookedMap.set(item.name, current + (item.quantity || 1));
            });
        });
        const bookedProducts = [];
        bookedMap.forEach((qty, name) => {
            bookedProducts.push({ name, quantity: qty });
        });

        return {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone || '',
            role: user.role || 'customer',
            createdAt: user.createdAt,
            orderCount: userOrders.length,
            totalSpent: userOrders.reduce((sum, o) => sum + (o.total || 0), 0),
            bookedProducts
        };
    });
    res.json({ customers });
});


// ---------------------------------------------------------------------------
// Razorpay Payment Routes
// ---------------------------------------------------------------------------

// GET /api/payment/config  returns Razorpay key for frontend
app.get('/api/payment/config', (req, res) => {
    res.json({ keyId: razorpayKeyId || '', configured: !!(razorpayKeyId && !razorpayKeyId.includes('your_')) });
});

// POST /api/payment/create-order  creates a Razorpay order for the given amount
app.post('/api/payment/create-order', authenticate, async (req, res) => {
    const { amount, currency = 'INR' } = req.body;
    if (!amount || isNaN(Number(amount))) {
        return res.status(400).json({ message: 'amount (in rupees) is required' });
    }
    try {
        const rzOrder = await createRazorpayOrder(Number(amount), currency, `epris_${Date.now()}`);
        res.json({ order: rzOrder, simulated: !!rzOrder.simulated });
    } catch (err) {
        console.error('[Razorpay] create-order error:', err.message);
        res.status(502).json({ message: 'Payment gateway error. Please try again.' });
    }
});

// POST /api/payment/verify  verifies Razorpay signature after successful payment
app.post('/api/payment/verify', authenticate, async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({ message: 'razorpay_order_id, razorpay_payment_id, and razorpay_signature are required' });
    }

    const isValid = verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    if (!isValid) {
        return res.status(400).json({ message: 'Payment verification failed  invalid signature' });
    }

    // If an epris orderId is provided, mark it as Confirmed + record payment info
    if (orderId) {
        const database = readDatabase();
        const order = database.orders.find(o => o.id === orderId && o.userId === req.userId);
        if (order) {
            order.status = 'Confirmed';
            order.payment = {
                ...order.payment,
                type: 'card',
                status: 'paid',
                razorpayOrderId: razorpay_order_id,
                razorpayPaymentId: razorpay_payment_id,
                paidAt: new Date().toISOString()
            };
            writeDatabase(database);

            // Send confirmation email
            const user = database.users.find(u => u.id === req.userId);
            if (user) sendOrderConfirmation(user, order).catch(() => {});
        }
    }

    res.json({ verified: true, paymentId: razorpay_payment_id });
});

// ---------------------------------------------------------------------------
// Native UPI QR Payment Routes (JSON Store)
// ---------------------------------------------------------------------------
app.get('/api/payment/upi-config', (req, res) => {
    res.json({
        upiId: process.env.UPI_ID || 'rakeshreddy056012-1@okaxis',
        upiName: process.env.UPI_NAME || 'Rakesh',
        upiAid: process.env.UPI_AID || 'uGICAgKCg7MbVOw',
        qrImage: process.env.UPI_QR_IMAGE || 'assets/images/rakesh-upi-qr.jpg'
    });
});

app.post('/api/payment/upi/confirm', authenticate, (req, res) => {
    const { orderId, utrNumber } = req.body;
    if (!orderId) return res.status(400).json({ message: 'orderId is required' });
    const database = readDatabase();
    const order = database.orders.find(o => o.id === orderId && o.userId === req.userId);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    order.status = 'Confirmed';
    order.payment = {
        ...order.payment,
        type: 'upi',
        status: 'paid',
        providerPaymentId: String(utrNumber || '').trim() || ('UPI_' + Date.now()),
        paidAt: new Date().toISOString()
    };
    writeDatabase(database);

    const buyer = database.users.find(u => u.id === req.userId);
    if (buyer) sendOrderConfirmation(buyer, order).catch(() => {});

    res.json({ success: true, order });
});

app.use((error, req, res, next) => {
    console.error(error);
    res.status(500).json({ message: error.message || 'Internal server error' });
});

if (require.main === module) {
    ensureAdminUser().catch(console.error);
    app.listen(port, () => {
        console.log('\n======================================================');
        console.log(`🚀 EPRIS Fashion Store is running at http://localhost:${port}`);
        console.log(`   - Storefront: http://localhost:${port}/`);
        console.log(`   - Login:      http://localhost:${port}/login.html`);
        console.log(`   - Sign Up:    http://localhost:${port}/signup.html`);
        console.log(`   - API Base:   http://localhost:${port}/api`);
        console.log('======================================================\n');
    });
}

module.exports = { app };
