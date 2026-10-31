'use strict';

require('dotenv').config();

// ---------------------------------------------------------------------------
// Razorpay payment helper
// ---------------------------------------------------------------------------

const keyId     = process.env.RAZORPAY_KEY_ID     || '';
const keySecret = process.env.RAZORPAY_KEY_SECRET  || '';
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
        return { simulated: true, id: `sim_${Date.now()}`, amount: amountInRupees * 100, currency };
    }
    const order = await rz.orders.create({
        amount:   Math.round(amountInRupees * 100),
        currency,
        receipt:  receipt || `rcpt_${Date.now()}`,
        payment_capture: true
    });
    return order;
}

// Verify payment signature (call after frontend payment success callback)
function verifyRazorpaySignature(orderId, paymentId, signature) {
    if (!isConfigured) return true; // skip verification in demo mode
    const crypto = require('crypto');
    const expected = crypto
        .createHmac('sha256', keySecret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');
    return expected === signature;
}

module.exports = { isConfigured, createRazorpayOrder, verifyRazorpaySignature, keyId };

