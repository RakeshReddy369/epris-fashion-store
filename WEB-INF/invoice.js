/**
 * EPRIS Fashion Store - Branded Printable Invoice & QR Generator
 * Generates high-fidelity GST Tax Invoices for Print & PDF export.
 */

(function (root, factory) {
    if (typeof exports === 'object' && typeof module !== 'undefined') {
        module.exports = factory();
    } else {
        root.EprisInvoice = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /* ==========================================================================
       1. Standalone Pure-JS Vector QR Code Generator (GF256 + Reed-Solomon)
       ========================================================================== */
    const EXP = new Uint8Array(512);
    const LOG = new Uint8Array(256);
    let x = 1;
    for (let i = 0; i < 255; i++) {
        EXP[i] = x;
        EXP[i + 255] = x;
        LOG[x] = i;
        x <<= 1;
        if (x & 256) x ^= 0x11d;
    }

    function gmul(a, b) {
        if (a === 0 || b === 0) return 0;
        return EXP[LOG[a] + LOG[b]];
    }

    function rsPoly(degree) {
        let poly = [1];
        for (let i = 0; i < degree; i++) {
            const next = new Array(poly.length + 1).fill(0);
            const factor = EXP[i];
            for (let j = 0; j < poly.length; j++) {
                next[j] ^= poly[j];
                next[j + 1] ^= gmul(poly[j], factor);
            }
            poly = next;
        }
        return poly;
    }

    function rsRemainder(data, degree) {
        const gen = rsPoly(degree);
        const res = new Uint8Array(degree);
        for (let i = 0; i < data.length; i++) {
            const factor = data[i] ^ res[0];
            for (let j = 0; j < degree - 1; j++) {
                res[j] = res[j + 1] ^ gmul(gen[j + 1], factor);
            }
            res[degree - 1] = gmul(gen[degree], factor);
        }
        return res;
    }

    const QR_VERSIONS = [
        null,
        { v: 1, size: 21, dataWords: 16, ecWords: 10, blocks: 1 },
        { v: 2, size: 25, dataWords: 28, ecWords: 16, blocks: 1 },
        { v: 3, size: 29, dataWords: 44, ecWords: 26, blocks: 1 },
        { v: 4, size: 33, dataWords: 64, ecWords: 18, blocks: 2 },
        { v: 5, size: 37, dataWords: 86, ecWords: 24, blocks: 2 },
        { v: 6, size: 41, dataWords: 108, ecWords: 16, blocks: 4 }
    ];

    function selectQRVersion(byteCount) {
        for (let i = 1; i < QR_VERSIONS.length; i++) {
            if (byteCount <= (QR_VERSIONS[i].dataWords - 2)) return QR_VERSIONS[i];
        }
        return QR_VERSIONS[QR_VERSIONS.length - 1];
    }

    function encodeQRData(str, ver) {
        const utf8 = unescape(encodeURIComponent(str));
        const len = utf8.length;
        const bits = [];

        function pushBits(val, count) {
            for (let i = count - 1; i >= 0; i--) bits.push((val >> i) & 1);
        }

        pushBits(0b0100, 4); // Byte mode
        pushBits(len, 8);
        for (let i = 0; i < len; i++) pushBits(utf8.charCodeAt(i), 8);

        const totalBits = ver.dataWords * 8;
        const padBits = Math.min(4, totalBits - bits.length);
        for (let i = 0; i < padBits; i++) bits.push(0);
        while (bits.length % 8 !== 0) bits.push(0);

        const bytes = new Uint8Array(ver.dataWords);
        for (let i = 0; i < bits.length / 8; i++) {
            let b = 0;
            for (let j = 0; j < 8; j++) b = (b << 1) | bits[i * 8 + j];
            bytes[i] = b;
        }

        let pIdx = bits.length / 8;
        const pads = [0xEC, 0x11];
        let p = 0;
        while (pIdx < ver.dataWords) bytes[pIdx++] = pads[p++ % 2];
        return bytes;
    }

    function buildQRMatrix(ver, dataBlocks, ecBlocks) {
        const size = ver.size;
        const matrix = Array.from({ length: size }, () => new Int8Array(size).fill(-1));
        const res = Array.from({ length: size }, () => new Uint8Array(size));

        function setMod(r, c, val, isRes = true) {
            if (r >= 0 && r < size && c >= 0 && c < size) {
                matrix[r][c] = val ? 1 : 0;
                if (isRes) res[r][c] = 1;
            }
        }

        // 1. Finder patterns
        function drawFinder(row, col) {
            for (let r = -1; r <= 7; r++) {
                for (let c = -1; c <= 7; c++) {
                    const nr = row + r, nc = col + c;
                    if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
                    if ((r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
                        (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
                        (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
                        setMod(nr, nc, 1);
                    } else {
                        setMod(nr, nc, 0);
                    }
                }
            }
        }
        drawFinder(0, 0);
        drawFinder(0, size - 7);
        drawFinder(size - 7, 0);

        // 2. Alignment patterns
        if (ver.v >= 2) {
            const alignList = [[], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34]][ver.v] || [];
            for (const r of alignList) {
                for (const c of alignList) {
                    if (res[r][c]) continue;
                    for (let dr = -2; dr <= 2; dr++) {
                        for (let dc = -2; dc <= 2; dc++) {
                            const on = (Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0));
                            setMod(r + dr, c + dc, on ? 1 : 0);
                        }
                    }
                }
            }
        }

        // 3. Timing patterns
        for (let i = 8; i < size - 8; i++) {
            if (!res[6][i]) setMod(6, i, i % 2 === 0 ? 1 : 0);
            if (!res[i][6]) setMod(i, 6, i % 2 === 0 ? 1 : 0);
        }

        setMod(size - 8, 8, 1); // Dark module

        for (let i = 0; i < 9; i++) {
            res[8][i] = 1; res[i][8] = 1;
            res[8][size - 1 - i] = 1; res[size - 1 - i][8] = 1;
        }

        // Interleave bit stream
        const allBits = [];
        const numBlocks = ver.blocks;
        const dataPerBlock = ver.dataWords / numBlocks;

        for (let byteIdx = 0; byteIdx < dataPerBlock; byteIdx++) {
            for (let b = 0; b < numBlocks; b++) {
                const val = dataBlocks[b][byteIdx];
                for (let bit = 7; bit >= 0; bit--) allBits.push((val >> bit) & 1);
            }
        }
        for (let byteIdx = 0; byteIdx < ver.ecWords; byteIdx++) {
            for (let b = 0; b < numBlocks; b++) {
                const val = ecBlocks[b][byteIdx];
                for (let bit = 7; bit >= 0; bit--) allBits.push((val >> bit) & 1);
            }
        }

        let bitIndex = 0;
        let dir = -1;
        let col = size - 1;

        while (col > 0) {
            if (col === 6) col--;
            for (let i = 0; i < size; i++) {
                const r = dir === -1 ? size - 1 - i : i;
                for (let c = 0; c < 2; c++) {
                    const currentCol = col - c;
                    if (!res[r][currentCol]) {
                        const bit = bitIndex < allBits.length ? allBits[bitIndex++] : 0;
                        matrix[r][currentCol] = bit;
                    }
                }
            }
            dir = -dir;
            col -= 2;
        }

        // Mask 0: (r + c) % 2 === 0
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (!res[r][c] && ((r + c) % 2 === 0)) {
                    matrix[r][c] ^= 1;
                }
            }
        }

        // Format bits for ECC M + Mask 0
        const FORMAT_M_MASK0 = 0x5412;
        for (let i = 0; i < 15; i++) {
            const bit = (FORMAT_M_MASK0 >> (14 - i)) & 1;
            if (i < 6) setMod(8, i, bit);
            else if (i === 6) setMod(8, 7, bit);
            else if (i === 7) setMod(8, 8, bit);
            else if (i === 8) setMod(7, 8, bit);
            else setMod(14 - i, 8, bit);

            if (i < 8) setMod(size - 1 - i, 8, bit);
            else setMod(8, size - 15 + i, bit);
        }

        return matrix;
    }

    function generateQRSVG(text, size = 110) {
        const margin = 2;
        const fg = '#0f172a';
        const bg = '#ffffff';

        const utf8 = unescape(encodeURIComponent(text));
        const ver = selectQRVersion(utf8.length);
        const encoded = encodeQRData(text, ver);

        const numBlocks = ver.blocks;
        const dataPerBlock = ver.dataWords / numBlocks;
        const dataBlocks = [];
        const ecBlocks = [];

        for (let b = 0; b < numBlocks; b++) {
            const chunk = encoded.slice(b * dataPerBlock, (b + 1) * dataPerBlock);
            dataBlocks.push(chunk);
            ecBlocks.push(rsRemainder(chunk, ver.ecWords));
        }

        const matrix = buildQRMatrix(ver, dataBlocks, ecBlocks);
        const matrixSize = matrix.length;
        const totalSize = matrixSize + margin * 2;

        let pathData = '';
        for (let r = 0; r < matrixSize; r++) {
            let runStart = -1;
            for (let c = 0; c < matrixSize; c++) {
                if (matrix[r][c] === 1) {
                    if (runStart === -1) runStart = c;
                } else {
                    if (runStart !== -1) {
                        pathData += `M${runStart + margin},${r + margin}h${c - runStart}v1h-${c - runStart}z`;
                        runStart = -1;
                    }
                }
            }
            if (runStart !== -1) {
                pathData += `M${runStart + margin},${r + margin}h${matrixSize - runStart}v1h-${matrixSize - runStart}z`;
            }
        }

        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" width="${size}" height="${size}" shape-rendering="crispEdges">` +
            `<rect width="${totalSize}" height="${totalSize}" fill="${bg}"/>` +
            `<path d="${pathData}" fill="${fg}"/>` +
            `</svg>`;
    }

    /* ==========================================================================
       2. Currency & Number Helpers
       ========================================================================== */
    function formatINR(val) {
        const num = Number(val) || 0;
        return '₹' + num.toLocaleString('en-IN');
    }

    function numberToWordsINR(amount) {
        const num = Math.round(Number(amount) || 0);
        if (num === 0) return 'Zero Rupees Only';

        const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
            'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
        const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

        function convertThreeDigits(n) {
            let str = '';
            if (n >= 100) {
                str += ones[Math.floor(n / 100)] + ' Hundred ';
                n %= 100;
            }
            if (n >= 20) {
                str += tens[Math.floor(n / 10)] + ' ';
                n %= 10;
            }
            if (n > 0) {
                str += ones[n] + ' ';
            }
            return str;
        }

        let words = '';
        const crore = Math.floor(num / 10000000);
        let rem = num % 10000000;
        const lakh = Math.floor(rem / 100000);
        rem %= 100000;
        const thousand = Math.floor(rem / 1000);
        rem %= 1000;

        if (crore > 0) words += convertThreeDigits(crore) + 'Crore ';
        if (lakh > 0) words += convertThreeDigits(lakh) + 'Lakh ';
        if (thousand > 0) words += convertThreeDigits(thousand) + 'Thousand ';
        if (rem > 0) words += convertThreeDigits(rem);

        return words.trim() + ' Rupees Only';
    }

    /* ==========================================================================
       3. Invoice HTML Generator
       ========================================================================== */
    function generateInvoiceHTML(order) {
        if (!order) return '<p>No order details available.</p>';

        const orderId = order.id || 'ORD-000000';
        const invoiceNum = 'INV-2026-' + (orderId.replace(/^(ord_|ORD_)/, '').toUpperCase().slice(0, 10) || '99120');
        const rawDate = order.date || order.createdAt || new Date().toISOString();
        const invoiceDate = new Date(rawDate).toLocaleDateString('en-IN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
        const invoiceTime = new Date(rawDate).toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit'
        });

        const items = order.items && order.items.length ? order.items : [];
        let itemsSubtotal = 0;
        const rowsHTML = items.map((item, idx) => {
            const qty = Number(item.quantity) || 1;
            const price = Number(item.price) || 0;
            const lineTotal = price * qty;
            itemsSubtotal += lineTotal;
            const hsnCode = '6109' + ((idx % 3) + 1) + '0'; // Standard apparel HSN code

            return `
                <tr>
                    <td class="inv-col-idx">${idx + 1}</td>
                    <td class="inv-col-desc">
                        <strong>${escapeHTML(item.name || 'Apparel Product')}</strong>
                        <div class="inv-item-meta">
                            ${item.color ? `<span>Color: <b>${escapeHTML(item.color)}</b></span>` : ''}
                            ${item.size ? `<span>Size: <b>${escapeHTML(item.size)}</b></span>` : ''}
                        </div>
                    </td>
                    <td class="inv-col-center">${hsnCode}</td>
                    <td class="inv-col-right">${formatINR(price)}</td>
                    <td class="inv-col-center">${qty}</td>
                    <td class="inv-col-right"><strong>${formatINR(lineTotal)}</strong></td>
                </tr>
            `;
        }).join('');

        const subtotal = order.subtotal !== undefined ? Number(order.subtotal) : itemsSubtotal;
        const discount = Number(order.discount) || 0;
        const shipping = order.shipping !== undefined ? Number(order.shipping) : (order.delivery && order.delivery.cost ? Number(order.delivery.cost) : (order.total > 2000 ? 0 : 100));
        const tax = order.tax !== undefined ? Number(order.tax) : Math.round(Math.max(0, subtotal - discount) * 0.10);
        const cgst = Math.round(tax / 2);
        const sgst = tax - cgst;
        const grandTotal = order.total !== undefined ? Number(order.total) : (subtotal - discount + shipping + tax);

        const addr = order.address || {
            name: 'Valued Customer',
            street: 'Main Street',
            city: 'Bengaluru',
            state: 'Karnataka',
            zip: '560001',
            phone: '9876543210'
        };

        const paymentType = typeof order.payment === 'object' && order.payment ? (order.payment.type || 'cod') : (order.payment || 'cod');
        const paymentLabels = {
            card: 'Credit / Debit Card',
            upi: 'UPI Instant Payment',
            wallet: 'Digital Wallet',
            bank: 'Net Banking',
            cod: 'Cash on Delivery (COD)'
        };
        const paymentDisplay = paymentLabels[paymentType.toLowerCase()] || paymentType.toUpperCase();
        const isPaid = paymentType.toLowerCase() !== 'cod' || order.status === 'Delivered';

        // Verification QR URL
        const origin = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : 'https://epris.com';
        const verifyURL = `${origin}/order-confirmation.html?orderId=${encodeURIComponent(orderId)}`;
        const qrSVG = generateQRSVG(verifyURL, 110);

        return `
            <div class="epris-invoice" id="printableInvoice">
                <!-- Watermark Logo -->
                <div class="inv-watermark">EPRIS</div>

                <!-- Top Header: Brand & Invoice Meta -->
                <div class="inv-header">
                    <div class="inv-brand-block">
                        <div class="inv-logo">E P R I S</div>
                        <div class="inv-tagline">HAUTE COUTURE & LUXURY APPAREL</div>
                        <div class="inv-seller-info">
                            <strong>EPRIS Retail Private Limited</strong><br>
                            108 Fashion Avenue, Indiranagar, Stage II<br>
                            Bengaluru, Karnataka - 560038, India<br>
                            <span>GSTIN: <b>29AABCE1234F1Z5</b></span> | <span>CIN: U74999KA2026PTC123456</span><br>
                            Email: support@epris.com | Web: www.epris.com
                        </div>
                    </div>

                    <div class="inv-title-block">
                        <div class="inv-badge">ORIGINAL TAX INVOICE</div>
                        <table class="inv-meta-table">
                            <tr>
                                <td>Invoice No:</td>
                                <td><strong>${invoiceNum}</strong></td>
                            </tr>
                            <tr>
                                <td>Invoice Date:</td>
                                <td><strong>${invoiceDate}</strong></td>
                            </tr>
                            <tr>
                                <td>Order ID:</td>
                                <td><strong>${orderId}</strong></td>
                            </tr>
                            <tr>
                                <td>Order Time:</td>
                                <td>${invoiceTime}</td>
                            </tr>
                            <tr>
                                <td>Payment Mode:</td>
                                <td><strong>${paymentDisplay}</strong></td>
                            </tr>
                            <tr>
                                <td>Payment Status:</td>
                                <td>
                                    <span class="inv-status-pill ${isPaid ? 'paid' : 'pending'}">
                                        ${isPaid ? '✓ PAID' : '⏳ PENDING COD'}
                                    </span>
                                </td>
                            </tr>
                        </table>
                    </div>
                </div>

                <div class="inv-divider"></div>

                <!-- Addresses: Billing & Shipping -->
                <div class="inv-addresses-row">
                    <div class="inv-address-card">
                        <div class="inv-section-title">BILLED TO / CUSTOMER DETAILS</div>
                        <div class="inv-address-body">
                            <strong>${escapeHTML(addr.name || 'Valued Customer')}</strong><br>
                            ${escapeHTML(addr.street || '')}<br>
                            ${escapeHTML(addr.city || '')}, ${escapeHTML(addr.state || '')} - ${escapeHTML(addr.zip || '')}<br>
                            ${addr.phone ? `Phone: +91 ${escapeHTML(addr.phone)}<br>` : ''}
                            State Code: 29 (Karnataka)
                        </div>
                    </div>

                    <div class="inv-address-card">
                        <div class="inv-section-title">SHIPPED TO / DELIVERY ADDRESS</div>
                        <div class="inv-address-body">
                            <strong>${escapeHTML(addr.name || 'Valued Customer')}</strong><br>
                            ${escapeHTML(addr.street || '')}<br>
                            ${escapeHTML(addr.city || '')}, ${escapeHTML(addr.state || '')} - ${escapeHTML(addr.zip || '')}<br>
                            Dispatch Via: <strong>EPRIS Express Logistics (Air)</strong><br>
                            Estimated Delivery: <strong>3-5 Business Days</strong>
                        </div>
                    </div>
                </div>

                <!-- Items Table -->
                <table class="inv-items-table">
                    <thead>
                        <tr>
                            <th class="inv-col-idx">#</th>
                            <th class="inv-col-desc">ITEM DESCRIPTION</th>
                            <th class="inv-col-center">HSN/SAC</th>
                            <th class="inv-col-right">UNIT PRICE</th>
                            <th class="inv-col-center">QTY</th>
                            <th class="inv-col-right">NET AMOUNT</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHTML || '<tr><td colspan="6" style="text-align:center; padding:20px;">No items in this order.</td></tr>'}
                    </tbody>
                </table>

                <!-- Summary & QR Section -->
                <div class="inv-summary-row">
                    <!-- QR Verification & Words -->
                    <div class="inv-qr-block">
                        <div class="inv-qr-card">
                            <div class="inv-qr-code">${qrSVG}</div>
                            <div class="inv-qr-info">
                                <div class="inv-qr-title">Digital Verification</div>
                                <div class="inv-qr-desc">Scan QR code using camera to verify invoice authenticity and track live courier status.</div>
                                <div class="inv-qr-hash">AUTH-${orderId.slice(-6).toUpperCase()}</div>
                            </div>
                        </div>

                        <div class="inv-words-block">
                            <span class="inv-words-label">Amount in Words:</span>
                            <div class="inv-words-text">${numberToWordsINR(grandTotal)}</div>
                        </div>
                    </div>

                    <!-- Breakdown Table -->
                    <div class="inv-totals-block">
                        <table class="inv-totals-table">
                            <tr>
                                <td>Items Subtotal:</td>
                                <td class="inv-col-right">${formatINR(subtotal)}</td>
                            </tr>
                            ${discount > 0 ? `
                            <tr class="inv-discount-row">
                                <td>Promo Discount (${order.coupon || 'COUPON'}):</td>
                                <td class="inv-col-right">- ${formatINR(discount)}</td>
                            </tr>
                            ` : ''}
                            <tr>
                                <td>Shipping & Handling:</td>
                                <td class="inv-col-right">${shipping === 0 ? '<span class="inv-free-tag">FREE</span>' : formatINR(shipping)}</td>
                            </tr>
                            <tr>
                                <td>CGST (5.0%):</td>
                                <td class="inv-col-right">${formatINR(cgst)}</td>
                            </tr>
                            <tr>
                                <td>SGST (5.0%):</td>
                                <td class="inv-col-right">${formatINR(sgst)}</td>
                            </tr>
                            <tr class="inv-grand-total-row">
                                <td>GRAND TOTAL (INR):</td>
                                <td class="inv-col-right"><strong>${formatINR(grandTotal)}</strong></td>
                            </tr>
                        </table>
                    </div>
                </div>

                <!-- Footer / Declarations & Signatures -->
                <div class="inv-footer">
                    <div class="inv-terms">
                        <strong>Terms & Conditions:</strong>
                        <ol>
                            <li>All returns and size exchanges are accepted within 7 days of delivery in original condition with tags intact.</li>
                            <li>Goods sold are covered under EPRIS Luxury Brand Warranty against manufacturing defects.</li>
                            <li>All disputes are subject to the exclusive jurisdiction of the Courts at Bengaluru, Karnataka.</li>
                        </ol>
                    </div>

                    <div class="inv-signature-block">
                        <div class="inv-sign-box">
                            <div class="inv-seal-text">EPRIS RETAIL PVT LTD<br><span>VERIFIED & CERTIFIED</span></div>
                            <div class="inv-sign-line"></div>
                            <div class="inv-sign-caption">Authorized Signatory</div>
                        </div>
                    </div>
                </div>

                <div class="inv-bottom-note">
                    This is a computer-generated official tax invoice and complies with Rule 46 of the CGST Rules, 2017. No physical signature is required.
                </div>
            </div>
        `;
    }

    function escapeHTML(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /* ==========================================================================
       4. Print & Modal Handlers
       ========================================================================== */
    function printCurrentInvoice(order) {
        let printContainer = document.getElementById('eprisPrintableInvoiceContainer');
        if (!printContainer) {
            printContainer = document.createElement('div');
            printContainer.id = 'eprisPrintableInvoiceContainer';
            printContainer.className = 'print-only-container';
            document.body.appendChild(printContainer);
        }

        printContainer.innerHTML = generateInvoiceHTML(order);

        // Allow DOM to render and then trigger print dialog
        setTimeout(() => {
            window.print();
        }, 150);
    }

    function openInvoiceModal(orderOrId) {
        // Direct order object support
        if (typeof orderOrId === 'object' && orderOrId !== null) {
            return showModalWithOrder(orderOrId);
        }

        const orderId = String(orderOrId || '').trim();
        if (!orderId) {
            alert('Order ID is required.');
            return;
        }

        // 1. Check local storage
        const storedOrders = JSON.parse(localStorage.getItem('userOrders') || '[]');
        let order = storedOrders.find(o => String(o.id) === orderId);

        // 2. Check profile page memory
        if (!order && window.lastLoadedOrders && Array.isArray(window.lastLoadedOrders)) {
            order = window.lastLoadedOrders.find(o => String(o.id) === orderId);
        }

        // 3. Check admin panel memory
        if (!order && window.adminOrders && Array.isArray(window.adminOrders)) {
            order = window.adminOrders.find(o => String(o.id) === orderId);
        }

        if (!order) {
            // Fetch via API
            if (typeof apiRequest === 'function') {
                apiRequest('/orders/' + encodeURIComponent(orderId))
                    .then(data => {
                        if (data && data.order) {
                            showModalWithOrder(data.order);
                        } else {
                            alert('Order details could not be retrieved.');
                        }
                    })
                    .catch(err => {
                        console.error('Invoice fetch error:', err);
                        alert('Order details could not be retrieved.');
                    });
                return;
            } else {
                alert('Order not found.');
                return;
            }
        }

        showModalWithOrder(order);
    }

    function showModalWithOrder(order) {
        let modal = document.getElementById('eprisInvoiceModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'eprisInvoiceModal';
            modal.className = 'epris-invoice-modal-overlay no-print';
            modal.innerHTML = `
                <div class="epris-invoice-modal-dialog">
                    <div class="epris-invoice-modal-bar no-print">
                        <div class="epris-invoice-modal-title">
                            <span>📄</span> EPRIS Tax Invoice Preview
                        </div>
                        <div class="epris-invoice-modal-actions">
                            <button type="button" class="btn-inv-print" id="eprisModalPrintBtn">
                                🖨️ Print / Save as PDF
                            </button>
                            <button type="button" class="btn-inv-close" id="eprisModalCloseBtn" title="Close preview">✕</button>
                        </div>
                    </div>
                    <div class="epris-invoice-modal-content" id="eprisInvoiceModalBody"></div>
                </div>
            `;
            document.body.appendChild(modal);

            document.getElementById('eprisModalCloseBtn').addEventListener('click', closeInvoiceModal);
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeInvoiceModal();
            });
        }

        const body = document.getElementById('eprisInvoiceModalBody');
        body.innerHTML = generateInvoiceHTML(order);

        const printBtn = document.getElementById('eprisModalPrintBtn');
        printBtn.onclick = function () {
            printCurrentInvoice(order);
        };

        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    function closeInvoiceModal() {
        const modal = document.getElementById('eprisInvoiceModal');
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }
    }

    // Export public API
    return {
        generateQRSVG,
        generateInvoiceHTML,
        printCurrentInvoice,
        showModalWithOrder,
        openInvoiceModal,
        closeInvoiceModal,
        formatINR,
        numberToWordsINR
    };
});
