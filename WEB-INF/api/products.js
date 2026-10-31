(function (global) {
const products = [
    {
        id: 1,
        name: 'Premium Casual T-Shirt',
        price: 1299,
        originalPrice: 1999,
        category: 'Men',
        image: 'assets/images/product-1.svg',
        description: 'High-quality premium cotton t-shirt perfect for everyday wear.',
        inventory: 50,
        freeTrial: true,
        fitNote: 'Regular fit. Model is 6\'1" wearing size M.'
    },
    {
        id: 2,
        name: 'Classic Polo Shirt',
        price: 899,
        originalPrice: 1299,
        category: 'Men',
        image: 'assets/images/product-2.svg',
        description: 'Elegant polo shirt for casual and semi-formal occasions.',
        inventory: 35,
        freeTrial: true,
        fitNote: 'Classic tailored fit across chest and shoulders.'
    },
    {
        id: 3,
        name: 'Denim Jacket',
        price: 1799,
        originalPrice: 2499,
        category: 'Men',
        image: 'assets/images/product-3.svg',
        description: 'Classic denim jacket with perfect fit and durability.',
        inventory: 20,
        freeTrial: true,
        fitNote: 'Relaxed trucker fit. Great for layering over hoodies.'
    },
    {
        id: 4,
        name: 'Casual Shorts',
        price: 699,
        originalPrice: 999,
        category: 'Men',
        image: 'assets/images/product-4.svg',
        description: 'Comfortable shorts for summer wear.',
        inventory: 40,
        freeTrial: true,
        fitNote: 'Standard 7" inseam with elastic drawstring waist.'
    },
    {
        id: 5,
        name: 'Premium Hoodie',
        price: 1499,
        originalPrice: 2199,
        category: 'Men',
        image: 'assets/images/product-5.svg',
        description: 'Warm and cozy hoodie for all seasons.',
        inventory: 25,
        freeTrial: true,
        fitNote: 'Slightly oversized street fit with ribbed hems.'
    },
    {
        id: 6,
        name: 'Women\'s Summer Dress',
        price: 1299,
        originalPrice: 1999,
        category: 'Women',
        image: 'assets/images/product-6.svg',
        description: 'Beautiful floral summer dress, perfect for casual outings.',
        inventory: 30,
        freeTrial: true,
        fitNote: 'Flowy A-line silhouette. Flattering on all body types.'
    },
    {
        id: 7,
        name: 'Women\'s Denim Shorts',
        price: 799,
        originalPrice: 1199,
        category: 'Women',
        image: 'assets/images/product-7.svg',
        description: 'Comfortable denim shorts for summer wear.',
        inventory: 45,
        freeTrial: true,
        fitNote: 'High-waisted with gentle stretch denim.'
    },
    {
        id: 8,
        name: 'Women\'s Blazer',
        price: 1999,
        originalPrice: 2799,
        category: 'Women',
        image: 'assets/images/product-8.svg',
        description: 'Elegant professional blazer for formal occasions.',
        inventory: 15,
        freeTrial: true,
        fitNote: 'Structured shoulders with single-breasted closure.'
    },
    {
        id: 9,
        name: 'Classic Sneakers',
        price: 1999,
        originalPrice: 2999,
        category: 'Shoes',
        image: 'assets/images/product-9.svg',
        description: 'Comfortable everyday sneakers with excellent support.',
        inventory: 50,
        freeTrial: true,
        fitNote: 'True to standard sneaker sizing with cushioned insole.'
    },
    {
        id: 10,
        name: 'Leather Formal Shoes',
        price: 2499,
        originalPrice: 3499,
        category: 'Shoes',
        image: 'assets/images/product-10.svg',
        description: 'Premium leather shoes for formal wear.',
        inventory: 20,
        freeTrial: true,
        fitNote: 'Genuine leather derby fit. We suggest your regular dress shoe size.'
    },
    {
        id: 11,
        name: 'Running Shoes',
        price: 2299,
        originalPrice: 3299,
        category: 'Shoes',
        image: 'assets/images/product-11.svg',
        description: 'High-performance running shoes with comfort technology.',
        inventory: 35,
        freeTrial: true,
        fitNote: 'Responsive sole with breathable upper mesh.'
    },
    {
        id: 12,
        name: 'Women\'s Elegant Top',
        price: 899,
        originalPrice: 1399,
        category: 'Women',
        image: 'assets/images/product-12.svg',
        description: 'Stylish top perfect for casual and formal settings.',
        inventory: 40,
        freeTrial: true,
        fitNote: 'Draped relaxed fit. Size down for a closer cut.'
    },
    {
        id: 13,
        name: 'Men\'s Cargo Pants',
        price: 1199,
        originalPrice: 1799,
        category: 'Men',
        image: 'assets/images/product-13.svg',
        description: 'Durable cargo pants with multiple pockets.',
        inventory: 25,
        freeTrial: true,
        fitNote: 'Straight leg with utility pocketing and mid-rise.'
    },
    {
        id: 14,
        name: 'Women\'s Jeans',
        price: 1099,
        originalPrice: 1599,
        category: 'Women',
        image: 'assets/images/product-14.svg',
        description: 'Classic blue jeans, comfortable and stylish.',
        inventory: 55,
        freeTrial: true,
        fitNote: 'High-rise silhouette with 2% comfort stretch.'
    },
    {
        id: 15,
        name: 'Formal Shirt',
        price: 899,
        originalPrice: 1299,
        category: 'Men',
        image: 'assets/images/product-15.svg',
        description: 'Crisp formal white shirt for office wear.',
        inventory: 30,
        freeTrial: true,
        fitNote: 'Slim modern dress cut with spread collar.'
    }
];

if (typeof window !== 'undefined') {
    window.EPRISProductCatalog = products;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = products;
}
})(typeof globalThis !== 'undefined' ? globalThis : this);
