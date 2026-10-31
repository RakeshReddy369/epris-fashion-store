let adminProducts = [];
let adminOrders = [];

function showAdminMessage(message, isError = false) {
    const element = document.getElementById('adminMessage');
    element.textContent = message;
    element.className = `admin-message ${isError ? 'error' : 'visible'}`;
    setTimeout(() => { element.textContent = ''; element.className = 'admin-message'; }, 4000);
}

function money(value) {
    return `₹${Number(value || 0).toLocaleString('en-IN')}`;
}

async function loadProducts() {
    const data = await apiRequest('/admin/products');
    adminProducts = data.products;
    document.getElementById('productCount').textContent = adminProducts.length;
    document.getElementById('productsTable').innerHTML = adminProducts.map(product => `
        <tr><td><div class="product-cell"><img src="${product.image}" alt=""><strong>${product.name}</strong></div></td><td>${product.category}</td><td>${money(product.price)}</td><td><span class="stock ${product.inventory < 10 ? 'low' : ''}">${product.inventory} units</span></td><td><button class="table-action" onclick="editProduct(${product.id})">Edit</button><button class="table-action danger" onclick="deleteProduct(${product.id})">Delete</button></td></tr>
    `).join('');
}

async function loadOrders() {
    const data = await apiRequest('/admin/orders');
    adminOrders = data.orders;
    document.getElementById('orderCount').textContent = adminOrders.length;
    document.getElementById('revenueTotal').textContent = money(adminOrders.reduce((total, order) => total + order.total, 0));
    document.getElementById('ordersTable').innerHTML = adminOrders.map(order => `
        <tr><td><strong>${order.id}</strong><small>${new Date(order.createdAt).toLocaleDateString()}</small></td><td>${order.customer?.name || 'Unknown'}<small>${order.customer?.email || ''}</small></td><td>${money(order.total)}</td><td>${order.payment.type} <small>${order.payment.status}</small></td><td><select onchange="updateOrderStatus('${order.id}', this.value)">${['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Refunded', 'Payment Failed'].map(status => `<option ${status === order.status ? 'selected' : ''}>${status}</option>`).join('')}</select></td></tr>
    `).join('');
}

async function loadCustomers() {
    const data = await apiRequest('/admin/customers');
    document.getElementById('customerCount').textContent = data.customers.length;
    document.getElementById('customersTable').innerHTML = data.customers.map(customer => `
        <tr><td><strong>${customer.name}</strong></td><td>${customer.email}<small>${customer.phone || 'No phone'}</small></td><td>${customer.orderCount}</td><td>${money(customer.totalSpent)}</td><td>${new Date(customer.createdAt).toLocaleDateString()}</td></tr>
    `).join('');
}

function openProductForm(product = null) {
    document.getElementById('productDialogTitle').textContent = product ? 'Edit product' : 'Add product';
    document.getElementById('productId').value = product?.id || '';
    document.getElementById('productName').value = product?.name || '';
    document.getElementById('productCategory').value = product?.category || '';
    document.getElementById('productPrice').value = product?.price || '';
    document.getElementById('productOriginalPrice').value = product?.originalPrice || '';
    document.getElementById('productInventory').value = product?.inventory ?? 0;
    document.getElementById('productImage').value = product?.image || '';
    document.getElementById('productDescription').value = product?.description || '';
    document.getElementById('productDialog').showModal();
}

function closeProductForm() {
    document.getElementById('productDialog').close();
}

function editProduct(productId) {
    openProductForm(adminProducts.find(product => product.id === productId));
}

async function saveProduct(event) {
    event.preventDefault();
    const id = document.getElementById('productId').value;
    const product = {
        name: document.getElementById('productName').value,
        category: document.getElementById('productCategory').value,
        price: Number(document.getElementById('productPrice').value),
        originalPrice: Number(document.getElementById('productOriginalPrice').value),
        inventory: Number(document.getElementById('productInventory').value),
        image: document.getElementById('productImage').value,
        description: document.getElementById('productDescription').value
    };
    try {
        await apiRequest(id ? `/admin/products/${id}` : '/admin/products', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(product) });
        closeProductForm();
        showAdminMessage('Product saved successfully.');
        await loadProducts();
    } catch (error) {
        showAdminMessage(error.message, true);
    }
}

async function deleteProduct(productId) {
    if (!confirm('Delete this product?')) return;
    try {
        await apiRequest(`/admin/products/${productId}`, { method: 'DELETE' });
        showAdminMessage('Product deleted.');
        await loadProducts();
    } catch (error) {
        showAdminMessage(error.message, true);
    }
}

async function updateOrderStatus(orderId, status) {
    try {
        await apiRequest(`/admin/orders/${orderId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
        showAdminMessage('Order status updated.');
    } catch (error) {
        showAdminMessage(error.message, true);
        await loadOrders();
    }
}


let adminCoupons = [];

async function loadCoupons() {
    try {
        const data = await apiRequest('/admin/coupons');
        adminCoupons = data.coupons || [];
        const tbody = document.getElementById('couponsTable');
        if (!tbody) return;
        tbody.innerHTML = adminCoupons.map(coupon => {
            let discountDisplay = '';
            if (coupon.discountType === 'percentage') {
                discountDisplay = `${coupon.discountValue}% OFF`;
            } else if (coupon.discountType === 'shipping') {
                discountDisplay = 'FREE DELIVERY';
            } else {
                discountDisplay = money(coupon.discountValue) + ' FLAT';
            }

            return `
            <tr>
                <td><strong style="color:#d4fa42;letter-spacing:0.5px;">${coupon.code}</strong><small>${coupon.description || ''}</small></td>
                <td><span style="text-transform:capitalize;">${coupon.discountType}</span></td>
                <td><strong>${discountDisplay}</strong></td>
                <td>${coupon.minOrderAmount ? money(coupon.minOrderAmount) : '₹0 (None)'}</td>
                <td>${coupon.usedCount || 0} times</td>
                <td><span class="stock ${coupon.isActive ? '' : 'low'}">${coupon.isActive ? 'Active' : 'Disabled'}</span></td>
                <td>
                    <button class="table-action" onclick="toggleCoupon('${coupon.code}')">${coupon.isActive ? 'Disable' : 'Enable'}</button>
                    <button class="table-action danger" onclick="deleteCoupon('${coupon.code}')">Delete</button>
                </td>
            </tr>
            `;
        }).join('');
    } catch (err) {
        showAdminMessage(err.message, true);
    }
}

function openCouponForm() {
    document.getElementById('couponCodeInput').value = '';
    document.getElementById('couponTypeInput').value = 'percentage';
    document.getElementById('couponValueInput').value = '10';
    document.getElementById('couponMinSpendInput').value = '500';
    document.getElementById('couponMaxDiscountInput').value = '';
    document.getElementById('couponDescriptionInput').value = '';
    document.getElementById('couponDialog').showModal();
}

function closeCouponForm() {
    document.getElementById('couponDialog').close();
}

async function saveCoupon(event) {
    event.preventDefault();
    const coupon = {
        code: document.getElementById('couponCodeInput').value.trim().toUpperCase(),
        discountType: document.getElementById('couponTypeInput').value,
        discountValue: Number(document.getElementById('couponValueInput').value),
        minOrderAmount: Number(document.getElementById('couponMinSpendInput').value) || 0,
        maxDiscountAmount: document.getElementById('couponMaxDiscountInput').value ? Number(document.getElementById('couponMaxDiscountInput').value) : null,
        description: document.getElementById('couponDescriptionInput').value.trim()
    };
    try {
        await apiRequest('/admin/coupons', {
            method: 'POST',
            body: JSON.stringify(coupon)
        });
        closeCouponForm();
        showAdminMessage('Coupon "' + coupon.code + '" created successfully.');
        await loadCoupons();
    } catch (err) {
        showAdminMessage(err.message, true);
    }
}

async function toggleCoupon(code) {
    try {
        await apiRequest('/admin/coupons/' + encodeURIComponent(code) + '/toggle', { method: 'PATCH' });
        showAdminMessage('Coupon status updated.');
        await loadCoupons();
    } catch (err) {
        showAdminMessage(err.message, true);
    }
}

async function deleteCoupon(code) {
    if (!confirm('Are you sure you want to delete coupon "' + code + '"?')) return;
    try {
        await apiRequest('/admin/coupons/' + encodeURIComponent(code), { method: 'DELETE' });
        showAdminMessage('Coupon deleted.');
        await loadCoupons();
    } catch (err) {
        showAdminMessage(err.message, true);
    }
}

async function logoutAdmin() {
    await logoutUser();
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const user = await requireAuthentication('login.html');
        if (!user || user.role !== 'admin') {
            alert('Administrator access required');
            window.location.href = 'index.html';
            return;
        }
        document.querySelectorAll('.admin-tabs button').forEach(button => {
            button.addEventListener('click', () => {
                document.querySelectorAll('.admin-tabs button, .admin-panel').forEach(element => element.classList.remove('active'));
                button.classList.add('active');
                document.getElementById(button.dataset.panel).classList.add('active');
            });
        });
        await Promise.all([loadProducts(), loadOrders(), loadCustomers(), loadCoupons()]);
    } catch (error) {
        showAdminMessage(error.message, true);
    }
});
