const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
    type: { type: String, enum: ['home', 'work', 'other'], default: 'home' },
    name: { type: String, required: true, trim: true },
    phone: { type: String, default: '', trim: true },
    street: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    zip: { type: String, required: true, trim: true },
    isDefault: { type: Boolean, default: false }
}, { _id: true });

const userSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    phone: { type: String, default: '', trim: true },
    passwordHash: { type: String, default: '' },
    googleId: { type: String, unique: true, sparse: true },
    facebookId: { type: String, unique: true, sparse: true },
    role: { type: String, enum: ['customer', 'admin'], default: 'customer', index: true },
    addresses: { type: [addressSchema], default: [] },
    createdAt: { type: Date, default: Date.now }
});

const productSchema = new mongoose.Schema({
    id: { type: Number, required: true, unique: true, index: true },
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    originalPrice: { type: Number, required: true, min: 0 },
    category: { type: String, required: true, index: true },
    image: { type: String, required: true },
    description: { type: String, required: true },
    inventory: { type: Number, required: true, min: 0, default: 0 },
    freeTrial: { type: Boolean, default: false },
    fitNote: { type: String, default: '' }
});

const cartItemSchema = new mongoose.Schema({
    productId: { type: Number, required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    image: { type: String, required: true },
    color: { type: String, default: 'Black' },
    size: { type: String, default: 'M' },
    quantity: { type: Number, required: true, min: 1 }
}, { _id: false });

const cartSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true, index: true },
    items: { type: [cartItemSchema], default: [] },
    updatedAt: { type: Date, default: Date.now }
});

const wishlistSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true, index: true },
    productIds: { type: [Number], default: [] },
    updatedAt: { type: Date, default: Date.now }
});

const orderSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    items: { type: [cartItemSchema], required: true },
    address: { type: addressSchema, required: true },
    delivery: {
        type: { type: String, required: true },
        cost: { type: Number, required: true, min: 0 }
    },
    payment: {
        type: { type: String, required: true },
        status: { type: String, required: true, default: 'pending' },
        providerOrderId: { type: String, default: '' },
        providerPaymentId: { type: String, default: '' },
        providerSignature: { type: String, default: '' }
    },
    subtotal: { type: Number, required: true, min: 0 },
    tax: { type: Number, required: true, min: 0 },
    shipping: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    status: { type: String, default: 'Pending' },
    createdAt: { type: Date, default: Date.now }
});

const reviewSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true, index: true },
    productId: { type: Number, required: true, index: true },
    userId: { type: String, default: '' },
    userName: { type: String, required: true, trim: true },
    userEmail: { type: String, default: '', trim: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, required: true, trim: true },
    comment: { type: String, required: true, trim: true },
    verifiedPurchase: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

module.exports = {
    User: mongoose.model('User', userSchema),
    Product: mongoose.model('Product', productSchema),
    Cart: mongoose.model('Cart', cartSchema),
    Wishlist: mongoose.model('Wishlist', wishlistSchema),
    Order: mongoose.model('Order', orderSchema),
    Review: mongoose.model('Review', reviewSchema)
};
