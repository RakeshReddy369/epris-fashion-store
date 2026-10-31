'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const { User, Product, Cart, Wishlist, Order, Review, Coupon } = require('./models');
const productsSeed = require('./products');

const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/epris_fashion';
const dbJsonPath = path.join(__dirname, 'data', 'db.json');

async function migrate() {
    console.log('🔄 Connecting to MongoDB at:', mongoUri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@'));
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB successfully.\n');

    if (!fs.existsSync(dbJsonPath)) {
        console.error('❌ data/db.json not found at:', dbJsonPath);
        process.exit(1);
    }

    const db = JSON.parse(fs.readFileSync(dbJsonPath, 'utf8'));
    const summary = { users: 0, products: 0, carts: 0, wishlists: 0, orders: 0, reviews: 0 };

    // 1. Migrate Products
    console.log('📦 Migrating Products...');
    const catalog = (db.products && db.products.length) ? db.products : productsSeed;
    for (const p of catalog) {
        await Product.findOneAndUpdate(
            { id: p.id },
            {
                name: p.name,
                price: p.price,
                originalPrice: p.originalPrice || p.price,
                category: p.category,
                image: p.image,
                description: p.description,
                inventory: p.inventory || 0,
                freeTrial: p.freeTrial || false,
                fitNote: p.fitNote || ''
            },
            { upsert: true, new: true }
        );
        summary.products++;
    }

    // 2. Migrate Users
    console.log('👤 Migrating Users...');
    if (Array.isArray(db.users)) {
        for (const u of db.users) {
            await User.findOneAndUpdate(
                { id: u.id },
                {
                    name: u.name,
                    email: u.email,
                    phone: u.phone || '',
                    passwordHash: u.passwordHash || '',
                    googleId: u.googleId,
                    role: u.role || 'customer',
                    addresses: u.addresses || [],
                    createdAt: u.createdAt || new Date()
                },
                { upsert: true, new: true }
            );
            summary.users++;
        }
    }

    // 3. Migrate Carts
    console.log('🛒 Migrating Carts...');
    if (Array.isArray(db.carts)) {
        for (const c of db.carts) {
            if (c.userId && c.items) {
                await Cart.findOneAndUpdate(
                    { userId: c.userId },
                    { items: c.items, updatedAt: new Date() },
                    { upsert: true, new: true }
                );
                summary.carts++;
            }
        }
    }

    // 4. Migrate Wishlists
    console.log('💖 Migrating Wishlists...');
    if (Array.isArray(db.wishlists)) {
        for (const w of db.wishlists) {
            if (w.userId) {
                await Wishlist.findOneAndUpdate(
                    { userId: w.userId },
                    { productIds: w.productIds || [], updatedAt: new Date() },
                    { upsert: true, new: true }
                );
                summary.wishlists++;
            }
        }
    }

    // 5. Migrate Orders
    console.log('📦 Migrating Orders...');
    if (Array.isArray(db.orders)) {
        for (const o of db.orders) {
            if (o.id && o.userId) {
                await Order.findOneAndUpdate(
                    { id: o.id },
                    {
                        userId: o.userId,
                        items: o.items || [],
                        address: o.address || {},
                        delivery: o.delivery || { type: 'standard', cost: 100 },
                        payment: o.payment || { type: 'cod', status: 'pending' },
                        subtotal: o.subtotal || 0,
                        tax: o.tax || 0,
                        shipping: o.shipping || 0,
                        total: o.total || 0,
                        status: o.status || 'Pending',
                        createdAt: o.createdAt || new Date()
                    },
                    { upsert: true, new: true }
                );
                summary.orders++;
            }
        }
    }

    // 6. Migrate Reviews
    console.log('⭐ Migrating Reviews...');
    if (Array.isArray(db.reviews)) {
        for (const r of db.reviews) {
            if (r.id && r.productId) {
                await Review.findOneAndUpdate(
                    { id: r.id },
                    {
                        productId: r.productId,
                        userId: r.userId || '',
                        userName: r.userName || 'Customer',
                        userEmail: r.userEmail || '',
                        rating: r.rating || 5,
                        title: r.title || 'Product Review',
                        comment: r.comment || '',
                        verifiedPurchase: r.verifiedPurchase !== false,
                        createdAt: r.createdAt || new Date()
                    },
                    { upsert: true, new: true }
                );
                summary.reviews++;
            }
        }
    }

    
    // 7. Migrate Coupons
    console.log('🎟️ Migrating Coupons...');
    if (Array.isArray(db.coupons)) {
        for (const c of db.coupons) {
            if (c.code) {
                await Coupon.findOneAndUpdate(
                    { code: c.code.toUpperCase() },
                    {
                        code: c.code.toUpperCase(),
                        discountType: c.discountType,
                        discountValue: c.discountValue,
                        minOrderAmount: c.minOrderAmount || 0,
                        maxDiscountAmount: c.maxDiscountAmount || null,
                        isActive: c.isActive !== false,
                        description: c.description || ''
                    },
                    { upsert: true, new: true }
                );
                summary.coupons = (summary.coupons || 0) + 1;
            }
        }
    }

    console.log('\n========================================');
    console.log('🎉 MIGRATION COMPLETED SUCCESSFULLY!');
    console.log(`- Products:  ${summary.products}`);
    console.log(`- Users:     ${summary.users}`);
    console.log(`- Carts:     ${summary.carts}`);
    console.log(`- Wishlists: ${summary.wishlists}`);
    console.log(`- Orders:    ${summary.orders}`);
    console.log(`- Reviews:   ${summary.reviews}`);
    console.log(`- Coupons:   ${summary.coupons || 0}`);
    console.log('========================================\n');

    await mongoose.disconnect();
}

migrate().catch(err => {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
});

