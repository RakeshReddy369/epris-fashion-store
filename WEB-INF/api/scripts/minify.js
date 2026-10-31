'use strict';

const fs = require('fs');
const path = require('path');

const webInfDir = path.resolve(__dirname, '../..');

function minifyCSS(css) {
    return css
        // Remove comments
        .replace(/\/\*[\s\S]*?\*\//g, '')
        // Remove whitespace around symbols
        .replace(/\s*([\{\}:;,>+~])\s*/g, '$1')
        // Remove trailing semicolons before closing brace
        .replace(/;}/g, '}')
        // Collapse multiple whitespace
        .replace(/\s+/g, ' ')
        .trim();
}

function minifyJS(js) {
    return js
        // Remove multiline comments
        .replace(/\/\*[\s\S]*?\*\//g, '')
        // Remove single line comments that are on their own line
        .replace(/^\s*\/\/.*$/gm, '')
        // Remove trailing whitespace on lines
        .replace(/[ \t]+$/gm, '')
        // Remove consecutive empty lines
        .replace(/\n\s*\n/g, '\n')
        .trim();
}

function runMinification() {
    console.log('⚡ Starting Production Minification Pass...\n');
    console.log('Target directory:', webInfDir);

    const cssFiles = [
        'style.css',
        'admin.css',
        'product-detail-concept.css',
        'wishlist-concept.css',
        'login-concept.css',
        'signup-concept.css',
        'profile-concept.css'
    ];

    const jsFiles = [
        'script.js',
        'api-client.js',
        'interactive-features.js',
        'admin.js',
        'invoice.js'
    ];

    let totalOriginal = 0;
    let totalMinified = 0;

    console.log('\n--- MINIFYING STYLESHEETS (CSS) ---');
    cssFiles.forEach(file => {
        const fullPath = path.join(webInfDir, file);
        if (fs.existsSync(fullPath)) {
            const raw = fs.readFileSync(fullPath, 'utf8');
            const min = minifyCSS(raw);
            const minPath = fullPath.replace(/\.css$/, '.min.css');
            fs.writeFileSync(minPath, min, 'utf8');

            const origSize = Buffer.byteLength(raw, 'utf8');
            const minSize = Buffer.byteLength(min, 'utf8');
            const saved = ((1 - minSize / origSize) * 100).toFixed(1);
            totalOriginal += origSize;
            totalMinified += minSize;

            console.log(`✓ ${file.padEnd(28)} ${(origSize / 1024).toFixed(1)} KB → ${(minSize / 1024).toFixed(1)} KB  (${saved}% saved)`);
        }
    });

    console.log('\n--- MINIFYING CLIENT SCRIPTS (JS) ---');
    jsFiles.forEach(file => {
        const fullPath = path.join(webInfDir, file);
        if (fs.existsSync(fullPath)) {
            const raw = fs.readFileSync(fullPath, 'utf8');
            const min = minifyJS(raw);
            const minPath = fullPath.replace(/\.js$/, '.min.js');
            fs.writeFileSync(minPath, min, 'utf8');

            const origSize = Buffer.byteLength(raw, 'utf8');
            const minSize = Buffer.byteLength(min, 'utf8');
            const saved = ((1 - minSize / origSize) * 100).toFixed(1);
            totalOriginal += origSize;
            totalMinified += minSize;

            console.log(`✓ ${file.padEnd(28)} ${(origSize / 1024).toFixed(1)} KB → ${(minSize / 1024).toFixed(1)} KB  (${saved}% saved)`);
        }
    });

    const totalSaved = ((1 - totalMinified / totalOriginal) * 100).toFixed(1);
    console.log('\n========================================');
    console.log(`✨ MINIFICATION COMPLETE!`);
    console.log(`Total Original: ${(totalOriginal / 1024).toFixed(1)} KB`);
    console.log(`Total Minified: ${(totalMinified / 1024).toFixed(1)} KB`);
    console.log(`Overall Savings: ${totalSaved}% reduction`);
    console.log('========================================\n');
}

runMinification();

