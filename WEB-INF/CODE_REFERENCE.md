# Interactive Features - Code Reference

## Quick Copy-Paste Examples

### 1. Toast Notifications

```javascript
// Show success message
showToast('Item added to cart!', 'success');

// Show error message
showToast('Product not found', 'error');

// Show info message
showToast('Welcome to EPRIS Fashion Store!', 'info');

// In HTML onclick
<button onclick="showToast('Welcome!', 'info')">Click Me</button>
```

---

### 2. Cart Counter

```javascript
// Manual update (auto-updates on cart change)
updateCartCount();

// In HTML - already integrated on all pages
// Just use: updateCartCount() after modifying cart

// Initialize on page load (auto-runs)
initCartCounter();
```

---

### 3. Product Search

```javascript
// Search in JavaScript
const result = searchProducts('shirt');
if (result) {
    console.log(result.name);  // Premium Casual T-Shirt
    console.log(result.price); // 1299
}

// Search from HTML (already in search button)
<button onclick="searchProduct()">🔍</button>

// This triggers prompt and shows toast with result
```

---

### 4. Product Filters

```javascript
// Filter by price only
const affordable = filterProducts(0, 1000);

// Filter by price and category
const menUnder1500 = filterProducts(0, 1500, 'Men');

// Filter expensive men's products
const expensiveMen = filterProducts(1500, 5000, 'Men');

// Get all products (no filter)
const allProducts = filterProducts(0, 10000);

// Use in forEach
const filtered = filterProducts(500, 2000, 'Men');
filtered.forEach(product => {
    console.log(product.name, product.price);
});
```

---

### 5. Image Zoom

```javascript
// Auto-enabled on product detail pages
// Just move mouse over main product image

// Manual enable (if needed)
enableImageZoom();

// Zoom follows cursor position automatically
// Zooms to 1.5x scale
// Smooth zoom out on mouse leave
```

---

### 6. Quick View Modal

```javascript
// Open quick view for product ID
createQuickViewModal(1); // Product 1

// In HTML button
<button onclick="createQuickViewModal(1)">Quick View</button>
<button onclick="createQuickViewModal(2)">Quick View</button>

// Add to cart from quick view
addToCartQuickView(3);

// Close modal (click outside or X button)
// Click outside modal closes it automatically
```

---

### 7. Page Animations

```javascript
// Auto-enables on all pages with DOMContentLoaded
// Automatically animates:
// - .product-card elements
// - .category-card elements  
// - .related-product-card elements

// Manual trigger (if needed)
addSmoothAnimations();

// Animation plays when elements enter viewport
// FadeInUp effect (0.6s duration)
```

---

## Complete HTML Integration

### Minimal Setup
```html
<!DOCTYPE html>
<html>
<head>
    <link rel="stylesheet" href="style.css">
    <script src="interactive-features.js" defer></script>
</head>
<body>
    <!-- Your content -->
    <script src="script.js"></script>
</body>
</html>
```

---

### Example Page Using All Features

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>EPRIS Store</title>
    <link rel="stylesheet" href="style.css">
    <script src="interactive-features.js" defer></script>
</head>
<body>
    <!-- Navigation with cart counter -->
    <header>
        <nav class="navbar">
            <div class="logo">EPRIS</div>
            <div class="nav-icons">
                <button onclick="searchProduct()">🔍</button>
                <button onclick="showCart()">🛒</button>
                <button onclick="login()">👤</button>
            </div>
        </nav>
    </header>

    <!-- Products with quick view -->
    <div class="product-container">
        <div class="product-card">
            <div class="product-image"></div>
            <h3>Premium T-Shirt</h3>
            <p>₹1299</p>
            <button onclick="createQuickViewModal(1)">Quick View</button>
            <button onclick="addProductToCart(1)">Add to Cart</button>
        </div>
    </div>

    <!-- JavaScript -->
    <script src="script.js"></script>
</body>
</html>
```

---

## Common Use Cases

### Show Toast After Action
```javascript
function myFunction() {
    // Do something
    console.log('Action completed');
    
    // Show feedback
    showToast('Action completed successfully!', 'success');
}
```

### Add Item and Update Counter
```javascript
function addItem(productId) {
    // Add to cart
    let cart = JSON.parse(localStorage.getItem('cart')) || [];
    cart.push({id: productId, name: 'Product'});
    localStorage.setItem('cart', JSON.stringify(cart));
    
    // Show notification
    showToast('Item added to cart!', 'success');
    
    // Update counter
    updateCartCount();
}
```

### Search and Handle Results
```javascript
function handleSearch() {
    const query = prompt('Search for product:');
    
    if (query) {
        const found = searchProducts(query);
        
        if (found) {
            showToast(`Found: ${found.name}`, 'success');
            window.location.href = `product-detail.html?id=${found.id}`;
        } else {
            showToast('Product not found', 'error');
        }
    }
}
```

### Filter and Display
```javascript
function showMenProducts() {
    const filtered = filterProducts(0, 10000, 'Men');
    showToast(`Found ${filtered.length} men's items!`, 'info');
    
    filtered.forEach(product => {
        console.log(`${product.name} - ₹${product.price}`);
    });
}
```

---

## API Reference

### showToast(message, type)
```javascript
showToast(message, type)
// message: String - Message to display
// type: 'success' | 'error' | 'info' (default: 'info')
```

### updateCartCount()
```javascript
updateCartCount()
// No parameters
// Updates cart badge with current count from localStorage
```

### searchProducts(query)
```javascript
searchProducts(query)
// query: String - Search term
// Returns: Product object or undefined
```

### filterProducts(minPrice, maxPrice, category)
```javascript
filterProducts(minPrice, maxPrice, category)
// minPrice: Number - Minimum price
// maxPrice: Number - Maximum price
// category: String (optional) - Product category
// Returns: Array of matching products
```

### enableImageZoom()
```javascript
enableImageZoom()
// No parameters
// Auto-enables on .main-image img element
```

### createQuickViewModal(productId)
```javascript
createQuickViewModal(productId)
// productId: Number - Product ID to display
// Creates and shows modal popup
```

### addToCartQuickView(productId)
```javascript
addToCartQuickView(productId)
// productId: Number - Product ID
// Adds to cart and shows toast
```

### addSmoothAnimations()
```javascript
addSmoothAnimations()
// No parameters
// Auto-enables on supported elements
```

---

## CSS Classes & Animations

### Available Keyframe Animations
```css
@keyframes slideIn       /* Toast appear */
@keyframes slideOut      /* Toast disappear */
@keyframes bounce        /* Cart counter */
@keyframes fadeInUp      /* Page elements */
```

### Modal Classes
```css
.quick-view-modal       /* Modal container */
.quick-view-content     /* Modal content box */
.quick-view-grid        /* Layout grid */
.quick-view-image       /* Product image */
.quick-view-details     /* Product details */
.quick-view-btn         /* Action button */
.close-modal            /* Close button */
```

---

## Troubleshooting Snippets

### Debug Toast
```javascript
// Test toast functionality
console.log('Testing toasts...');
showToast('Success test', 'success');
setTimeout(() => showToast('Error test', 'error'), 1000);
setTimeout(() => showToast('Info test', 'info'), 2000);
```

### Debug Cart
```javascript
// Check cart in console
console.log('Cart:', JSON.parse(localStorage.getItem('cart')));
console.log('Cart count element:', document.getElementById('cart-count'));
updateCartCount();
```

### Debug Search
```javascript
// Test search function
console.log('Testing search...');
console.log('Found:', searchProducts('shirt'));
console.log('Found:', searchProducts('men'));
console.log('Not found:', searchProducts('xyz'));
```

### Debug Filters
```javascript
// Test filter function
console.log('All products:', products);
console.log('Under ₹1500:', filterProducts(0, 1500));
console.log('Men only:', filterProducts(0, 10000, 'Men'));
```

---

## Production Checklist

- [ ] All scripts loaded in correct order
- [ ] interactive-features.js before closing </body> tag optional (defer attribute)
- [ ] No console errors
- [ ] Toasts appear correctly
- [ ] Cart counter updates
- [ ] Search works
- [ ] Image zoom works
- [ ] Quick view modal opens/closes
- [ ] Animations play smoothly
- [ ] Mobile responsive
- [ ] All browsers tested

---

## Performance Tips

1. **Defer script loading**
   ```html
   <script src="interactive-features.js" defer></script>
   ```

2. **Minimize DOM queries**
   - Features cache selectors
   - No repeated queries

3. **Use event delegation**
   - Modal uses delegation
   - Reduces memory usage

4. **Optimize images**
   - Zoom works better with optimized images
   - Use WebP format when possible

---

## Browser Compatibility

✅ Chrome 90+
✅ Firefox 88+
✅ Safari 14+
✅ Edge 90+
✅ Mobile browsers

**Features using:**
- Intersection Observer (98% support)
- ES6+ (99% support)
- CSS3 Animations (100% support)

---

## Version History

**v1.0** - Complete
- All 7 features
- Full documentation
- Production ready

---

*Last Updated: August 22, 2026*
*Status: ✅ Complete*
