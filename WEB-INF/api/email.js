'use strict';

require('dotenv').config();
const nodemailer = require('nodemailer');

// ---------------------------------------------------------------------------
// Transporter setup
// ---------------------------------------------------------------------------
let transporter = null;

function getTransporter() {
    if (transporter) return transporter;

    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;

    if (!user || !pass || user.startsWith('your-')) {
        // Email not configured — return null so callers can skip gracefully
        return null;
    }

    transporter = nodemailer.createTransporter({
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: Number(process.env.EMAIL_PORT || 587),
        secure: process.env.EMAIL_SECURE === 'true',
        auth: { user, pass }
    });

    return transporter;
}

// ---------------------------------------------------------------------------
// Helper: send a raw email (returns true on success, false when not configured)
// ---------------------------------------------------------------------------
async function sendMail(to, subject, html) {
    const transport = getTransporter();
    if (!transport) {
        console.log(`[Email] Not configured — skipping email to ${to}: ${subject}`);
        return false;
    }

    try {
        const from = process.env.EMAIL_FROM || `EPRIS Fashion <${process.env.EMAIL_USER}>`;
        await transport.sendMail({ from, to, subject, html });
        console.log(`[Email] Sent "${subject}" → ${to}`);
        return true;
    } catch (err) {
        console.error('[Email] Send error:', err.message);
        return false;
    }
}

// ---------------------------------------------------------------------------
// Shared template wrapper
// ---------------------------------------------------------------------------
function template(content) {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { margin: 0; padding: 0; background: #f4f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #15171a; }
  .wrap { max-width: 620px; margin: 32px auto; background: white; border: 1px solid #e0e2e6; }
  .header { background: #17191c; padding: 26px 36px; }
  .header h1 { margin: 0; color: white; font-size: 22px; letter-spacing: 3px; }
  .header h1 span { color: #c84a35; }
  .body { padding: 36px; }
  .body h2 { margin-top: 0; font-size: 22px; }
  .body p { line-height: 1.7; color: #444; }
  .info-box { background: #f8f9fb; border: 1px solid #e4e6ea; border-radius: 4px; padding: 20px 24px; margin: 24px 0; }
  .info-box h3 { margin-top: 0; font-size: 13px; color: #888; letter-spacing: 1px; text-transform: uppercase; }
  table.items { width: 100%; border-collapse: collapse; margin-top: 8px; }
  table.items th { text-align: left; font-size: 11px; color: #888; letter-spacing: 1px; padding: 6px 0; border-bottom: 1px solid #e4e6ea; }
  table.items td { padding: 10px 0; border-bottom: 1px solid #f0f1f3; font-size: 14px; }
  .total-row td { font-weight: 700; font-size: 16px; border-bottom: none; padding-top: 14px; }
  .status-badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 700; }
  .status-Confirmed, .status-Processing { background: #e6f3ff; color: #1a6fc4; }
  .status-Shipped { background: #fff3d6; color: #b45309; }
  .status-Delivered { background: #e8f5ef; color: #1a7a4a; }
  .status-Cancelled, .status-Refunded { background: #fde8e8; color: #b83d35; }
  .btn { display: inline-block; margin-top: 8px; padding: 13px 26px; background: #17191c; color: white; text-decoration: none; font-weight: 700; border-radius: 3px; }
  .footer { background: #f8f9fb; border-top: 1px solid #e0e2e6; padding: 20px 36px; font-size: 12px; color: #888; text-align: center; }
</style>
</head>
<body>
<div class="wrap">
  <div class="header"><h1>EPR<span>I</span>S</h1></div>
  <div class="body">${content}</div>
  <div class="footer">
    EPRIS Fashion Store &nbsp;|&nbsp; support@epris.com &nbsp;|&nbsp; +91 7981512162<br>
    <small>You received this email because you placed an order on EPRIS.</small>
  </div>
</div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Money formatter
// ---------------------------------------------------------------------------
function money(n) {
    return `₹${Number(n || 0).toLocaleString('en-IN')}`;
}

// ---------------------------------------------------------------------------
// Email: Order Confirmation
// ---------------------------------------------------------------------------
async function sendOrderConfirmation(user, order) {
    const itemRows = (order.items || []).map(item => `
        <tr>
            <td>${item.name} <small style="color:#888">${item.size || ''} / ${item.color || ''}</small></td>
            <td style="text-align:center">${item.quantity}</td>
            <td style="text-align:right">${money(item.price * item.quantity)}</td>
        </tr>`).join('');

    const html = template(`
        <h2>Your order is confirmed! 🎉</h2>
        <p>Hi ${user.name || 'there'},</p>
        <p>Thank you for shopping with EPRIS. We've received your order and we're getting it ready!</p>

        <div class="info-box">
            <h3>Order Details</h3>
            <p style="margin:0 0 4px"><strong>Order ID:</strong> ${order.id}</p>
            <p style="margin:0 0 4px"><strong>Date:</strong> ${new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
            <p style="margin:0"><strong>Status:</strong> <span class="status-badge status-Confirmed">Confirmed</span></p>
        </div>

        <div class="info-box">
            <h3>Items Ordered</h3>
            <table class="items">
                <thead><tr><th>Product</th><th style="text-align:center">Qty</th><th style="text-align:right">Price</th></tr></thead>
                <tbody>
                    ${itemRows}
                    <tr><td colspan="2" style="border:none;padding-top:10px;color:#888;font-size:13px">Delivery (${order.delivery?.type || 'standard'})</td><td style="text-align:right;border:none;padding-top:10px;font-size:13px">${order.shipping === 0 ? 'FREE' : money(order.shipping)}</td></tr>
                    <tr><td colspan="2" style="border:none;color:#888;font-size:13px">Tax (10%)</td><td style="text-align:right;border:none;font-size:13px">${money(order.tax)}</td></tr>
                    <tr class="total-row"><td colspan="2">Total</td><td style="text-align:right">${money(order.total)}</td></tr>
                </tbody>
            </table>
        </div>

        <div class="info-box">
            <h3>Shipping Address</h3>
            <p style="margin:0">${order.address?.name}<br>${order.address?.street}<br>${order.address?.city}, ${order.address?.state} ${order.address?.zip}<br>${order.address?.phone ? `📞 ${order.address.phone}` : ''}</p>
        </div>

        <div class="info-box">
            <h3>Payment</h3>
            <p style="margin:0"><strong>${(order.payment?.type || 'cod').toUpperCase()}</strong></p>
        </div>

        <p>We'll send you another email when your order ships. You can track your order anytime from your profile page.</p>
        <p>Happy shopping! 🛍️</p>`);

    return sendMail(user.email, `Order Confirmed — ${order.id} | EPRIS Fashion`, html);
}

// ---------------------------------------------------------------------------
// Email: Order Status Update
// ---------------------------------------------------------------------------
async function sendOrderStatusUpdate(user, order) {
    const messages = {
        Confirmed: {
            headline: 'Your order has been confirmed ✅', body: "We've confirmed your order and it will be processed shortly." },
        Processing:     { headline: 'Your order is being processed 🔧', body: 'Our team is carefully picking and packing your items.' },
        Shipped: { headline: 'Your order is on its way! 🚚', body: 'Your package has been handed over to our delivery partner and is now on its way to you.' },
        Delivered: { headline: 'Your order has been delivered 🎉', body: 'We hope you love your new items! If you have any issues, please contact our support team.' },
        Cancelled: { headline: 'Your order has been cancelled ❌', body: 'Your order has been cancelled. If you paid online, a refund will be processed within 5-7 business days.' },
        Refunded: { headline: 'Your refund is being processed 💳', body: 'We are processing your refund. It should appear in your account within 5-7 business days.' },
    'Payment Failed': { headline: 'Payment failed for your order ⚠️', body: 'Unfortunately your payment could not be processed. Please try again or contact support.' }
};

const info = messages[order.status] || { headline: `Order status updated to ${order.status}`, body: 'Please check your order details on the website.' };

const html = template(`
        <h2>${info.headline}</h2>
        <p>Hi ${user.name || 'there'},</p>
        <p>${info.body}</p>

        <div class="info-box">
            <h3>Order Summary</h3>
            <p style="margin:0 0 4px"><strong>Order ID:</strong> ${order.id}</p>
            <p style="margin:0 0 4px"><strong>Total:</strong> ${money(order.total)}</p>
            <p style="margin:0"><strong>Status:</strong> <span class="status-badge status-${order.status}">${order.status}</span></p>
        </div>

        <p style="text-align:center"><a class="btn" href="http://localhost:5500/profile.html">View My Orders</a></p>`);

return sendMail(user.email, `Order Update — ${order.status} | EPRIS Fashion`, html);
}

// ---------------------------------------------------------------------------
// Email: Welcome (on registration)
// ---------------------------------------------------------------------------
async function sendWelcomeEmail(user) {
    const html = template(`
        <h2>Welcome to EPRIS! 👋</h2>
        <p>Hi ${user.name || 'there'},</p>
        <p>Your account has been created successfully. Start exploring our latest collection!</p>
        <p>Here's what you can do:</p>
        <ul style="line-height:2;color:#444">
            <li>Browse hundreds of fashion items across Men, Women & Shoes</li>
            <li>Save your favourites to your wishlist ❤️</li>
            <li>Fast checkout with saved addresses</li>
            <li>Track all your orders in one place</li>
        </ul>
        <p style="text-align:center"><a class="btn" href="http://localhost:5500/index.html">Start Shopping</a></p>`);

    return sendMail(user.email, 'Welcome to EPRIS Fashion! 🎉', html);
}

module.exports = { sendOrderConfirmation, sendOrderStatusUpdate, sendWelcomeEmail };

