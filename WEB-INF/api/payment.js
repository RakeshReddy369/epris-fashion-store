'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// ---------------------------------------------------------------------------
// Razorpay payment helper
// ---------------------------------------------------------------------------

const keyId     = process.env.RAZORPAY_KEY_ID     || 'rzp_test_TvDOh0kaCItKFM';
const keySecret = process.env.RAZORPAY_KEY_SECRET  || 'Fb7znuMJiXAjRAA35FJZ5Cml';
const isConfigured = !!(keyId && keySecret && !keyId.includes('your_'));

let razorpay = null;

function getRazorpay() {
    if (!isConfigured) return null;
    if (razorpay) return razorpay;
    try {
        const Razorpay = require('razorpay');
        razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
        return razorpay;
    } catch (err) {
        console.error('[Razorpay] Init error:', err.message);
        return null;
    }
}

// Create a Razorpay order (amount in paise)
async function createRazorpayOrder(amountInRupees, currency = 'INR', receipt = '') {
    const rz = getRazorpay();
    if (!rz) {
        throw new Error('Razorpay payment gateway is not configured or offline. Please check your credentials in .env.');
    }
    const order = await rz.orders.create({
        amount:   Math.round(amountInRupees * 100),
        currency,
        receipt:  receipt || `rcpt_${Date.now()}`,
        payment_capture: true
    });
    return order;
}

// Verify payment signature (cryptographic HMAC-SHA256 verification)
function verifyRazorpaySignature(orderId, paymentId, signature) {
    if (!isConfigured || !orderId || !paymentId || !signature) return false;
    try {
        const crypto = require('crypto');
        const expected = crypto
            .createHmac('sha256', keySecret)
            .update(`${orderId}|${paymentId}`)
            .digest('hex');
        return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch (err) {
        console.error('[Razorpay] Verification error:', err.message);
        return false;
    }
}

module.exports = { isConfigured, createRazorpayOrder, verifyRazorpaySignature, keyId };
