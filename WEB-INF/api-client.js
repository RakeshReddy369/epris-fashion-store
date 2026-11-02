let currentApiBaseUrl = (function() {
    if (typeof window !== 'undefined') {
        if (window.EPRIS_API_URL) return window.EPRIS_API_URL.replace(/\/+$/, '');
        const stored = localStorage.getItem('API_URL');
        if (stored) return stored.replace(/\/+$/, '');
        // If loaded via file:// or VS Code Live Server (port 5500, 5501, 8080)
        if (window.location.protocol === 'file:' || window.location.port === '5500' || window.location.port === '5501' || window.location.port === '8080') {
            return 'http://localhost:3000/api';
        }
        return `${window.location.origin}/api`;
    }
    return 'http://localhost:3000/api';
})();

const API_BASE_URL = currentApiBaseUrl;

function getAuthToken() {
    return localStorage.getItem('authToken');
}

function getAuthHeaders() {
    const token = getAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiRequest(path, options = {}) {
    let response;
    try {
        response = await fetch(`${currentApiBaseUrl}${path}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders(),
                ...(options.headers || {})
            }
        });
    } catch (networkErr) {
        // If localhost:3000 failed, automatically retry with fallback port 3001
        if (currentApiBaseUrl.includes(':3000')) {
            try {
                const altUrl = currentApiBaseUrl.replace(':3000', ':3001');
                response = await fetch(`${altUrl}${path}`, {
                    ...options,
                    headers: {
                        'Content-Type': 'application/json',
                        ...getAuthHeaders(),
                        ...(options.headers || {})
                    }
                });
                currentApiBaseUrl = altUrl; // Cache working URL
            } catch (fallbackErr) {
                throw new Error('Cannot connect to EPRIS server. Please make sure your backend server is running in terminal (npm run dev).');
            }
        } else {
            throw new Error(`Cannot connect to server at ${currentApiBaseUrl}. Please ensure your backend server is running.`);
        }
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.message || 'Request failed');
    }
    return data;
}

function saveAuthenticatedUser(data) {
    localStorage.setItem('authToken', data.token);
    localStorage.setItem('userId', data.user.id);
    localStorage.setItem('userName', data.user.name);
    localStorage.setItem('userEmail', data.user.email);
    localStorage.setItem('userPhone', data.user.phone || '');
    localStorage.setItem('userRole', data.user.role || 'customer');
    if (data.user.googleLinked || (data.user.email && data.user.email.endsWith('@gmail.com'))) {
        localStorage.setItem('isGoogleUser', 'true');
    }
    if (data.user.facebookLinked || (data.user.email && (data.user.email.includes('facebook') || data.user.email.startsWith('fb_')))) {
        localStorage.setItem('isFacebookUser', 'true');
    }
}

function clearAuthentication() {
    ['authToken', 'userId', 'userName', 'userEmail', 'userPhone', 'userRole', 'isGoogleUser', 'isFacebookUser'].forEach(key => localStorage.removeItem(key));
}

async function requireAuthentication(redirect = 'login.html') {
    if (!getAuthToken()) {
        window.location.href = redirect;
        return null;
    }

    try {
        const data = await apiRequest('/auth/me');
        saveAuthenticatedUser({ ...data, token: getAuthToken() });
        return data.user;
    } catch (error) {
        clearAuthentication();
        window.location.href = redirect;
        return null;
    }
}

async function logoutUser() {
    clearAuthentication();
    window.location.href = 'login.html';
}
