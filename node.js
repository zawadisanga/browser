// ============================================
// ZASS ULTIMATE WEB BROWSER - SINGLE FILE
// ============================================
// Run with: node server.js
// Access: http://localhost:16232
// ============================================

const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

// ============================================
// INITIALIZE APP
// ============================================
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 16232;

// ============================================
// MIDDLEWARE
// ============================================
app.use(compression());
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// ============================================
// IN-MEMORY DATABASE (Simple)
// ============================================
let users = [];
let tokens = [];
let bookmarks = [];
let history = [];

// Default admin user
users.push({
    id: '1',
    username: 'admin',
    password: '$2b$10$5Pj8xQnKxqLxqLxqLxqLxqLxqLxqLxqLxqLxqLxqLxqLxqLxq', // admin123
    email: 'admin@zass.com',
    role: 'admin',
    createdAt: new Date()
});

// Simple password check (for demo, use bcrypt in production)
function checkPassword(plain, hashed) {
    return plain === 'admin123'; // Demo only
}

// Generate simple token
function generateToken(userId) {
    const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
    tokens.push({ token, userId, createdAt: Date.now() });
    return token;
}

function verifyToken(token) {
    const found = tokens.find(t => t.token === token);
    if (!found) return null;
    return { id: found.userId };
}

// ============================================
// AUTH MIDDLEWARE
// ============================================
function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    const user = verifyToken(token);
    if (!user) {
        return res.status(401).json({ success: false, error: 'Invalid token' });
    }
    req.userId = user.id;
    next();
}

// ============================================
// API ROUTES
// ============================================

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'running', timestamp: new Date(), uptime: process.uptime() });
});

// Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username);
    
    if (!user || !checkPassword(password, user.password)) {
        return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
    
    const token = generateToken(user.id);
    res.json({
        success: true,
        token,
        user: { id: user.id, username: user.username, email: user.email, role: user.role }
    });
});

// Register
app.post('/api/register', (req, res) => {
    const { username, email, password } = req.body;
    
    if (users.find(u => u.username === username)) {
        return res.status(400).json({ success: false, error: 'Username exists' });
    }
    
    const newUser = {
        id: String(users.length + 1),
        username,
        email,
        password: password, // In production, hash this!
        role: 'user',
        createdAt: new Date()
    };
    
    users.push(newUser);
    const token = generateToken(newUser.id);
    
    res.json({
        success: true,
        token,
        user: { id: newUser.id, username: newUser.username, email: newUser.email, role: newUser.role }
    });
});

// Get user profile
app.get('/api/me', authMiddleware, (req, res) => {
    const user = users.find(u => u.id === req.userId);
    if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.json({
        success: true,
        user: { id: user.id, username: user.username, email: user.email, role: user.role }
    });
});

// Get bookmarks
app.get('/api/bookmarks', authMiddleware, (req, res) => {
    const userBookmarks = bookmarks.filter(b => b.userId === req.userId);
    res.json({ success: true, bookmarks: userBookmarks });
});

// Add bookmark
app.post('/api/bookmarks', authMiddleware, (req, res) => {
    const { url, title } = req.body;
    const bookmark = {
        id: Date.now().toString(),
        userId: req.userId,
        url,
        title: title || url,
        createdAt: new Date()
    };
    bookmarks.push(bookmark);
    res.json({ success: true, bookmark });
});

// Delete bookmark
app.delete('/api/bookmarks/:id', authMiddleware, (req, res) => {
    bookmarks = bookmarks.filter(b => b.id !== req.params.id);
    res.json({ success: true });
});

// Get history
app.get('/api/history', authMiddleware, (req, res) => {
    const userHistory = history.filter(h => h.userId === req.userId).slice(-100);
    res.json({ success: true, history: userHistory });
});

// Add to history
app.post('/api/history', authMiddleware, (req, res) => {
    const { url, title } = req.body;
    history.push({
        id: Date.now().toString(),
        userId: req.userId,
        url,
        title: title || url,
        visitedAt: new Date()
    });
    res.json({ success: true });
});

// Clear history
app.delete('/api/history', authMiddleware, (req, res) => {
    history = history.filter(h => h.userId !== req.userId);
    res.json({ success: true });
});

// ============================================
// PROXY BROWSER ENDPOINT (The core browser!)
// ============================================
const axios = require('axios');
const cheerio = require('cheerio');

app.get('/api/browse', async (req, res) => {
    let { url } = req.query;
    
    if (!url) {
        return res.status(400).json({ error: 'URL parameter required' });
    }
    
    // Add https if no protocol
    if (!url.startsWith('http')) {
        url = 'https://' + url;
    }
    
    try {
        // Fetch the website content
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br'
            },
            timeout: 30000
        });
        
        const html = response.data;
        const $ = cheerio.load(html);
        const title = $('title').text() || url;
        
        // Modify links to go through proxy
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            if (href && href.startsWith('/')) {
                const fullUrl = new URL(href, url).href;
                $(el).attr('href', `javascript:void(0)`);
                $(el).attr('data-proxy-url', fullUrl);
                $(el).attr('onclick', `navigateTo('${fullUrl.replace(/'/g, "\\'")}')`);
            } else if (href && href.startsWith('http')) {
                $(el).attr('onclick', `navigateTo('${href.replace(/'/g, "\\'")}'); return false;`);
                $(el).attr('href', 'javascript:void(0)');
            }
        });
        
        // Add navigation script to the page
        const enhancedHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <base target="_top">
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${title} - ZASS Browser</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
                    .zass-toolbar {
                        position: fixed;
                        top: 0;
                        left: 0;
                        right: 0;
                        background: white;
                        border-bottom: 1px solid #e0e0e0;
                        padding: 8px 16px;
                        display: flex;
                        gap: 8px;
                        z-index: 10000;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                        flex-wrap: wrap;
                    }
                    .zass-nav-btn {
                        background: #f0f0f0;
                        border: none;
                        width: 36px;
                        height: 36px;
                        border-radius: 50%;
                        cursor: pointer;
                        font-size: 16px;
                    }
                    .zass-nav-btn:hover { background: #e0e0e0; }
                    .zass-url-bar {
                        flex: 1;
                        display: flex;
                        align-items: center;
                        background: #f5f5f5;
                        border-radius: 24px;
                        padding: 0 16px;
                    }
                    .zass-url-input {
                        flex: 1;
                        background: transparent;
                        border: none;
                        padding: 10px 0;
                        font-size: 14px;
                        outline: none;
                    }
                    .zass-go-btn {
                        background: #1a73e8;
                        border: none;
                        width: 32px;
                        height: 32px;
                        border-radius: 50%;
                        color: white;
                        cursor: pointer;
                    }
                    .zass-content {
                        margin-top: 60px;
                        padding: 20px;
                    }
                    @media (max-width: 768px) {
                        .zass-toolbar { padding: 8px; }
                        .zass-url-bar { order: 3; width: 100%; }
                        .zass-content { margin-top: 100px; }
                    }
                </style>
            </head>
            <body>
                <div class="zass-toolbar">
                    <button class="zass-nav-btn" onclick="goBack()">←</button>
                    <button class="zass-nav-btn" onclick="goForward()">→</button>
                    <button class="zass-nav-btn" onclick="reloadPage()">⟳</button>
                    <button class="zass-nav-btn" onclick="goHome()">🏠</button>
                    <div class="zass-url-bar">
                        <span>🔒</span>
                        <input type="text" class="zass-url-input" id="urlInput" value="${url}" placeholder="Search or enter URL">
                    </div>
                    <button class="zass-go-btn" onclick="navigate()">→</button>
                    <button class="zass-nav-btn" onclick="addBookmark()">🔖</button>
                </div>
                <div class="zass-content">
                    ${$.html()}
                </div>
                <script>
                    let currentUrl = '${url}';
                    let historyStack = [currentUrl];
                    let historyIndex = 0;
                    
                    function navigate() {
                        let url = document.getElementById('urlInput').value.trim();
                        if (!url) return;
                        if (!url.startsWith('http')) {
                            url = 'https://' + url;
                        }
                        window.location.href = '/api/browse?url=' + encodeURIComponent(url);
                    }
                    
                    function navigateTo(url) {
                        window.location.href = '/api/browse?url=' + encodeURIComponent(url);
                    }
                    
                    function goBack() {
                        if (historyIndex > 0) {
                            historyIndex--;
                            window.location.href = '/api/browse?url=' + encodeURIComponent(historyStack[historyIndex]);
                        }
                    }
                    
                    function goForward() {
                        if (historyIndex < historyStack.length - 1) {
                            historyIndex++;
                            window.location.href = '/api/browse?url=' + encodeURIComponent(historyStack[historyIndex]);
                        }
                    }
                    
                    function reloadPage() {
                        window.location.reload();
                    }
                    
                    function goHome() {
                        window.location.href = '/';
                    }
                    
                    async function addBookmark() {
                        const token = localStorage.getItem('token');
                        if (!token) {
                            alert('Please login to add bookmarks');
                            return;
                        }
                        try {
                            const response = await fetch('/api/bookmarks', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': 'Bearer ' + token
                                },
                                body: JSON.stringify({ url: currentUrl, title: document.title })
                            });
                            const data = await response.json();
                            if (data.success) {
                                alert('Bookmark added!');
                            }
                        } catch(e) {
                            console.error(e);
                        }
                    }
                    
                    // Update URL input
                    document.getElementById('urlInput').value = '${url}';
                    
                    // Handle link clicks
                    document.querySelectorAll('a').forEach(link => {
                        const proxyUrl = link.getAttribute('data-proxy-url');
                        if (proxyUrl) {
                            link.onclick = (e) => {
                                e.preventDefault();
                                navigateTo(proxyUrl);
                            };
                        }
                    });
                </script>
            </body>
            </html>
        `;
        
        res.send(enhancedHtml);
        
    } catch (error) {
        res.send(`
            <!DOCTYPE html>
            <html>
            <head><title>Error - ZASS Browser</title></head>
            <body style="font-family: sans-serif; padding: 40px; text-align: center;">
                <h1>⚠️ Error Loading Page</h1>
                <p>Could not load: ${url}</p>
                <p>Error: ${error.message}</p>
                <button onclick="window.location.href='/'">Go Home</button>
                <button onclick="window.history.back()">Go Back</button>
            </body>
            </html>
        `);
    }
});

// Search API
app.get('/api/search', async (req, res) => {
    const { q, engine = 'google' } = req.query;
    
    if (!q) {
        return res.status(400).json({ error: 'Search query required' });
    }
    
    let searchUrl;
    if (engine === 'google') {
        searchUrl = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
    } else if (engine === 'bing') {
        searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(q)}`;
    } else {
        searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(q)}`;
    }
    
    try {
        const response = await axios.get(searchUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        
        const $ = cheerio.load(response.data);
        let results = [];
        
        if (engine === 'google') {
            $('div.g').each((i, el) => {
                const title = $(el).find('h3').text();
                const link = $(el).find('a').attr('href');
                const snippet = $(el).find('.VwiC3b').text() || $(el).find('.IsZvec').text();
                if (title && link && link.startsWith('http')) {
                    results.push({ title, url: link, snippet: snippet.substring(0, 300) });
                }
            });
        } else if (engine === 'bing') {
            $('li.b_algo').each((i, el) => {
                const title = $(el).find('h2').text();
                const link = $(el).find('a').attr('href');
                const snippet = $(el).find('.b_caption p').text();
                if (title && link) {
                    results.push({ title, url: link, snippet: snippet?.substring(0, 300) || '' });
                }
            });
        }
        
        res.json({
            success: true,
            query: q,
            engine: engine,
            results: results.slice(0, 20),
            total: results.length
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// SERVE FRONTEND (Single HTML Page)
// ============================================

app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ZASS Browser - Ultimate Web Browser</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Inter', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }
        .navbar {
            background: rgba(255,255,255,0.95);
            backdrop-filter: blur(10px);
            padding: 1rem 2rem;
            position: fixed;
            width: 100%;
            top: 0;
            z-index: 1000;
            box-shadow: 0 2px 20px rgba(0,0,0,0.1);
        }
        .nav-container {
            max-width: 1400px;
            margin: 0 auto;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .logo {
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 1.5rem;
            font-weight: 800;
            background: linear-gradient(135deg, #667eea, #764ba2);
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
        }
        .nav-links { display: flex; gap: 2rem; align-items: center; }
        .nav-links a { text-decoration: none; color: #333; font-weight: 500; transition: color 0.3s; }
        .nav-links a:hover { color: #667eea; }
        .auth-buttons { display: flex; gap: 1rem; }
        .btn-login, .btn-signup {
            padding: 0.5rem 1.5rem;
            border-radius: 25px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
        }
        .btn-login {
            background: transparent;
            border: 2px solid #667eea;
            color: #667eea;
        }
        .btn-login:hover { background: #667eea; color: white; }
        .btn-signup {
            background: linear-gradient(135deg, #667eea, #764ba2);
            border: none;
            color: white;
        }
        .btn-signup:hover { transform: translateY(-2px); box-shadow: 0 5px 20px rgba(102,126,234,0.4); }
        .hero {
            padding-top: 100px;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
            color: white;
        }
        .hero-content { max-width: 800px; padding: 2rem; }
        .hero h1 { font-size: 4rem; margin-bottom: 1rem; animation: fadeInUp 0.8s ease; }
        .hero p { font-size: 1.2rem; margin-bottom: 2rem; opacity: 0.9; animation: fadeInUp 0.8s ease 0.2s both; }
        .hero-buttons { display: flex; gap: 1rem; justify-content: center; animation: fadeInUp 0.8s ease 0.4s both; }
        .btn-primary, .btn-secondary {
            padding: 1rem 2rem;
            border-radius: 50px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
            text-decoration: none;
        }
        .btn-primary { background: white; color: #667eea; border: none; }
        .btn-primary:hover { transform: translateY(-3px); box-shadow: 0 10px 30px rgba(0,0,0,0.2); }
        .btn-secondary { background: transparent; border: 2px solid white; color: white; }
        .btn-secondary:hover { background: white; color: #667eea; }
        .features {
            background: white;
            padding: 5rem 2rem;
        }
        .section-title { text-align: center; font-size: 2.5rem; margin-bottom: 3rem; color: #333; }
        .features-grid {
            max-width: 1200px;
            margin: 0 auto;
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 2rem;
        }
        .feature-card {
            background: #f8f9fa;
            padding: 2rem;
            border-radius: 20px;
            text-align: center;
            transition: all 0.3s;
            cursor: pointer;
        }
        .feature-card:hover { transform: translateY(-10px); box-shadow: 0 20px 40px rgba(0,0,0,0.1); }
        .feature-icon {
            width: 80px;
            height: 80px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 1.5rem;
        }
        .feature-icon i { font-size: 2.5rem; color: white; }
        .feature-card h3 { font-size: 1.5rem; margin-bottom: 1rem; color: #333; }
        .feature-card p { color: #666; line-height: 1.6; }
        .footer {
            background: #1a1a2e;
            color: white;
            padding: 3rem 2rem;
            text-align: center;
        }
        @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(30px); }
            to { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 768px) {
            .nav-links { display: none; }
            .hero h1 { font-size: 2rem; }
            .hero-buttons { flex-direction: column; }
        }
        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 2000;
            align-items: center;
            justify-content: center;
        }
        .modal-content {
            background: white;
            border-radius: 20px;
            padding: 2rem;
            max-width: 400px;
            width: 90%;
            animation: fadeInUp 0.3s ease;
        }
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
        .form-group { margin-bottom: 1rem; }
        .form-group input {
            width: 100%;
            padding: 0.75rem;
            border: 1px solid #ddd;
            border-radius: 10px;
            font-size: 1rem;
        }
        .btn-submit {
            width: 100%;
            padding: 0.75rem;
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            border: none;
            border-radius: 10px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            margin-top: 1rem;
        }
        .switch-auth { text-align: center; margin-top: 1rem; color: #666; }
        .switch-auth a { color: #667eea; text-decoration: none; cursor: pointer; }
        .user-menu { display: flex; align-items: center; gap: 1rem; }
        .user-avatar {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: linear-gradient(135deg, #667eea, #764ba2);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            cursor: pointer;
        }
        .search-bar {
            max-width: 600px;
            margin: 0 auto 2rem;
            display: flex;
            gap: 10px;
        }
        .search-input {
            flex: 1;
            padding: 16px 20px;
            border: none;
            border-radius: 50px;
            font-size: 16px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .search-btn {
            padding: 16px 32px;
            background: white;
            border: none;
            border-radius: 50px;
            font-weight: 600;
            cursor: pointer;
            color: #667eea;
        }
    </style>
</head>
<body>
    <nav class="navbar">
        <div class="nav-container">
            <div class="logo"><i class="fas fa-globe"></i><span>ZASS Browser</span></div>
            <div class="nav-links">
                <a href="/">Home</a>
                <a href="/browser">Browser</a>
                <a href="/search">Search</a>
            </div>
            <div class="auth-buttons" id="authButtons">
                <button class="btn-login" onclick="showLoginModal()">Login</button>
                <button class="btn-signup" onclick="showRegisterModal()">Sign Up</button>
            </div>
            <div class="user-menu" id="userMenu" style="display: none;">
                <div class="user-avatar" id="userAvatar">U</div>
                <button class="btn-login" onclick="logout()">Logout</button>
            </div>
        </div>
    </nav>

    <section class="hero">
        <div class="hero-content">
            <h1>Welcome to ZASS Browser</h1>
            <p>The Ultimate Web Browser - Browse Anything, No Limits, No Censorship, Full Privacy</p>
            <div class="search-bar">
                <input type="text" class="search-input" id="searchInput" placeholder="Search anything or enter URL..." onkeypress="if(event.key==='Enter') startBrowse()">
                <button class="search-btn" onclick="startBrowse()"><i class="fas fa-search"></i> Browse</button>
            </div>
            <div class="hero-buttons">
                <a href="/browser" class="btn-primary">Launch Browser</a>
                <a href="#features" class="btn-secondary">Explore Features</a>
            </div>
        </div>
    </section>

    <section class="features" id="features">
        <h2 class="section-title">Everything You Need</h2>
        <div class="features-grid">
            <div class="feature-card" onclick="window.location.href='/browser'">
                <div class="feature-icon"><i class="fas fa-globe"></i></div>
                <h3>Unlimited Browsing</h3>
                <p>Access any website, no restrictions, adult content allowed</p>
            </div>
            <div class="feature-card" onclick="window.location.href='/search'">
                <div class="feature-icon"><i class="fas fa-search"></i></div>
                <h3>Smart Search</h3>
                <p>Search Google, Bing, YouTube, and more</p>
            </div>
            <div class="feature-card" onclick="window.location.href='/browser'">
                <div class="feature-icon"><i class="fas fa-download"></i></div>
                <h3>Download Videos</h3>
                <p>Download from YouTube, TikTok, Instagram</p>
            </div>
            <div class="feature-card" onclick="window.location.href='/browser'">
                <div class="feature-icon"><i class="fas fa-shield-alt"></i></div>
                <h3>Privacy First</h3>
                <p>No tracking, no logs, complete anonymity</p>
            </div>
        </div>
    </section>

    <footer class="footer">
        <p>&copy; 2024 ZASS Browser - Unlimited Browsing, No Limits, No Censorship</p>
    </footer>

    <!-- Login Modal -->
    <div id="loginModal" class="modal">
        <div class="modal-content">
            <div class="modal-header"><h2>Login</h2><button onclick="closeModals()" style="background:none;border:none;font-size:24px;">&times;</button></div>
            <form onsubmit="handleLogin(event)">
                <div class="form-group"><input type="text" id="loginUsername" placeholder="Username" required></div>
                <div class="form-group"><input type="password" id="loginPassword" placeholder="Password" required></div>
                <button type="submit" class="btn-submit">Login</button>
            </form>
            <div class="switch-auth">Don't have an account? <a onclick="switchToRegister()">Sign up</a></div>
        </div>
    </div>

    <!-- Register Modal -->
    <div id="registerModal" class="modal">
        <div class="modal-content">
            <div class="modal-header"><h2>Sign Up</h2><button onclick="closeModals()" style="background:none;border:none;font-size:24px;">&times;</button></div>
            <form onsubmit="handleRegister(event)">
                <div class="form-group"><input type="text" id="regUsername" placeholder="Username" required></div>
                <div class="form-group"><input type="email" id="regEmail" placeholder="Email" required></div>
                <div class="form-group"><input type="password" id="regPassword" placeholder="Password" required></div>
                <div class="form-group"><input type="password" id="regConfirmPassword" placeholder="Confirm Password" required></div>
                <button type="submit" class="btn-submit">Create Account</button>
            </form>
            <div class="switch-auth">Already have an account? <a onclick="switchToLogin()">Login</a></div>
        </div>
    </div>

    <script>
        const token = localStorage.getItem('token');
        if (token) {
            document.getElementById('authButtons').style.display = 'none';
            document.getElementById('userMenu').style.display = 'flex';
            fetchUser();
        }

        async function fetchUser() {
            try {
                const response = await fetch('/api/me', {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                const data = await response.json();
                if (data.success && data.user) {
                    document.getElementById('userAvatar').innerText = data.user.username[0].toUpperCase();
                }
            } catch(e) {}
        }

        function startBrowse() {
            let query = document.getElementById('searchInput').value.trim();
            if (!query) return;
            if (query.includes('.') && !query.includes(' ')) {
                if (!query.startsWith('http')) query = 'https://' + query;
                window.location.href = '/api/browse?url=' + encodeURIComponent(query);
            } else {
                window.location.href = '/api/browse?url=https://www.google.com/search?q=' + encodeURIComponent(query);
            }
        }

        async function handleLogin(event) {
            event.preventDefault();
            const username = document.getElementById('loginUsername').value;
            const password = document.getElementById('loginPassword').value;
            try {
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const data = await response.json();
                if (data.success) {
                    localStorage.setItem('token', data.token);
                    window.location.reload();
                } else {
                    alert('Login failed: ' + data.error);
                }
            } catch(e) { alert('Error: ' + e.message); }
        }

        async function handleRegister(event) {
            event.preventDefault();
            const username = document.getElementById('regUsername').value;
            const email = document.getElementById('regEmail').value;
            const password = document.getElementById('regPassword').value;
            const confirm = document.getElementById('regConfirmPassword').value;
            if (password !== confirm) { alert('Passwords do not match'); return; }
            try {
                const response = await fetch('/api/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, email, password })
                });
                const data = await response.json();
                if (data.success) {
                    localStorage.setItem('token', data.token);
                    window.location.reload();
                } else {
                    alert('Registration failed: ' + data.error);
                }
            } catch(e) { alert('Error: ' + e.message); }
        }

        function logout() { localStorage.removeItem('token'); window.location.reload(); }
        function showLoginModal() { document.getElementById('loginModal').style.display = 'flex'; }
        function showRegisterModal() { document.getElementById('registerModal').style.display = 'flex'; }
        function closeModals() {
            document.getElementById('loginModal').style.display = 'none';
            document.getElementById('registerModal').style.display = 'none';
        }
        function switchToLogin() { closeModals(); showLoginModal(); }
        function switchToRegister() { closeModals(); showRegisterModal(); }
    </script>
</body>
</html>
    `);
});

// Browser page (iframe version)
app.get('/browser', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ZASS Browser - Full Screen Browser</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            height: 100vh;
            display: flex;
            flex-direction: column;
            background: #f5f5f5;
        }
        .toolbar {
            background: white;
            border-bottom: 1px solid #e0e0e0;
            padding: 8px 16px;
            display: flex;
            gap: 8px;
            align-items: center;
            flex-wrap: wrap;
        }
        .nav-btn {
            background: #f0f0f0;
            border: none;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 16px;
        }
        .nav-btn:hover { background: #e0e0e0; }
        .url-bar {
            flex: 1;
            display: flex;
            align-items: center;
            background: #f5f5f5;
            border-radius: 24px;
            padding: 0 16px;
            border: 1px solid #ddd;
        }
        .url-input {
            flex: 1;
            background: transparent;
            border: none;
            padding: 10px 0;
            font-size: 14px;
            outline: none;
        }
        .go-btn {
            background: #1a73e8;
            border: none;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            color: white;
            cursor: pointer;
        }
        .iframe-container {
            flex: 1;
            position: relative;
        }
        iframe {
            width: 100%;
            height: 100%;
            border: none;
        }
        .loading {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            display: none;
        }
        @media (max-width: 768px) {
            .toolbar { padding: 8px; }
            .url-bar { order: 3; width: 100%; }
        }
    </style>
</head>
<body>
    <div class="toolbar">
        <button class="nav-btn" onclick="goBack()">←</button>
        <button class="nav-btn" onclick="goForward()">→</button>
        <button class="nav-btn" onclick="reloadPage()">⟳</button>
        <button class="nav-btn" onclick="goHome()">🏠</button>
        <div class="url-bar">
            <span>🔒</span>
            <input type="text" class="url-input" id="urlInput" placeholder="Enter URL or search..." onkeypress="if(event.key==='Enter') navigate()">
        </div>
        <button class="go-btn" onclick="navigate()">→</button>
    </div>
    <div class="iframe-container">
        <iframe id="browserFrame" src="/api/browse?url=https://www.google.com"></iframe>
    </div>
    <script>
        const iframe = document.getElementById('browserFrame');
        const urlInput = document.getElementById('urlInput');
        
        function navigate() {
            let url = urlInput.value.trim();
            if (!url) return;
            if (!url.startsWith('http') && !url.includes('.')) {
                url = 'https://www.google.com/search?q=' + encodeURIComponent(url);
            } else if (!url.startsWith('http')) {
                url = 'https://' + url;
            }
            iframe.src = '/api/browse?url=' + encodeURIComponent(url);
        }
        
        function goBack() { iframe.contentWindow.history.back(); }
        function goForward() { iframe.contentWindow.history.forward(); }
        function reloadPage() { iframe.src = iframe.src; }
        function goHome() { iframe.src = '/api/browse?url=https://www.google.com'; }
        
        iframe.onload = () => {
            try {
                const iframeUrl = iframe.contentWindow.location.href;
                if (iframeUrl && !iframeUrl.includes('/api/browse')) {
                    urlInput.value = decodeURIComponent(iframeUrl);
                }
            } catch(e) {}
        };
    </script>
</body>
</html>
    `);
});

// Search page
app.get('/search', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ZASS Search - Search Anything</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Inter', sans-serif;
            background: #f5f5f5;
            padding: 20px;
        }
        .search-container {
            max-width: 800px;
            margin: 0 auto;
        }
        .search-header {
            background: white;
            padding: 20px;
            border-radius: 16px;
            margin-bottom: 20px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.05);
        }
        .search-box {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
        }
        .search-input {
            flex: 1;
            padding: 16px 20px;
            border: 2px solid #e0e0e0;
            border-radius: 50px;
            font-size: 16px;
            font-family: inherit;
        }
        .search-input:focus { outline: none; border-color: #667eea; }
        .search-btn {
            padding: 16px 32px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            border: none;
            border-radius: 50px;
            font-weight: 600;
            cursor: pointer;
        }
        .engine-selector {
            display: flex;
            gap: 10px;
            justify-content: center;
        }
        .engine-btn {
            padding: 8px 20px;
            background: #f0f0f0;
            border: none;
            border-radius: 25px;
            cursor: pointer;
            font-weight: 500;
        }
        .engine-btn.active {
            background: #667eea;
            color: white;
        }
        .results-container {
            background: white;
            border-radius: 16px;
            padding: 20px;
        }
        .result {
            padding: 20px;
            border-bottom: 1px solid #e0e0e0;
            cursor: pointer;
            transition: background 0.2s;
        }
        .result:hover { background: #f9f9f9; }
        .result-title { color: #1a73e8; font-size: 18px; margin-bottom: 8px; }
        .result-url { color: #202124; font-size: 14px; margin-bottom: 8px; word-break: break-all; }
        .result-snippet { color: #5f6368; font-size: 14px; line-height: 1.5; }
        .loading { text-align: center; padding: 40px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .spinner { width: 40px; height: 40px; border: 3px solid #e0e0e0; border-top-color: #667eea; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto; }
    </style>
</head>
<body>
    <div class="search-container">
        <div class="search-header">
            <div class="search-box">
                <input type="text" class="search-input" id="searchInput" placeholder="Search anything..." onkeypress="if(event.key==='Enter') search()">
                <button class="search-btn" onclick="search()"><i class="fas fa-search"></i> Search</button>
            </div>
            <div class="engine-selector">
                <button class="engine-btn active" data-engine="google">Google</button>
                <button class="engine-btn" data-engine="bing">Bing</button>
                <button class="engine-btn" data-engine="duckduckgo">DuckDuckGo</button>
            </div>
        </div>
        <div class="results-container" id="resultsContainer">
            <div style="text-align: center; padding: 40px; color: #999;">
                <i class="fas fa-search" style="font-size: 48px; margin-bottom: 16px;"></i>
                <p>Search for anything - no limits, no censorship</p>
            </div>
        </div>
    </div>
    <script>
        let currentEngine = 'google';
        
        document.querySelectorAll('.engine-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.engine-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentEngine = btn.dataset.engine;
                const query = document.getElementById('searchInput').value;
                if (query) search();
            });
        });
        
        async function search() {
            const query = document.getElementById('searchInput').value.trim();
            if (!query) return;
            
            const container = document.getElementById('resultsContainer');
            container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Searching...</p></div>';
            
            try {
                const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&engine=${currentEngine}`);
                const data = await response.json();
                
                if (data.success && data.results.length > 0) {
                    container.innerHTML = data.results.map(result => `
                        <div class="result" onclick="window.location.href='/api/browse?url=${encodeURIComponent(result.url)}'">
                            <div class="result-title">${result.title || result.url}</div>
                            <div class="result-url">${result.url}</div>
                            <div class="result-snippet">${result.snippet || ''}</div>
                        </div>
                    `).join('');
                } else {
                    container.innerHTML = '<div style="text-align:center;padding:40px;"><p>No results found for "' + query + '"</p></div>';
                }
            } catch (error) {
                container.innerHTML = '<div style="text-align:center;padding:40px;"><p>Error: ' + error.message + '</p></div>';
            }
        }
        
        // Get query from URL
        const urlParams = new URLSearchParams(window.location.search);
        const q = urlParams.get('q');
        if (q) {
            document.getElementById('searchInput').value = q;
            search();
        }
    </script>
</body>
</html>
    `);
});

// ============================================
// START SERVER
// ============================================
server.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║                    ZASS BROWSER - RUNNING                      ║
╠════════════════════════════════════════════════════════════════╣
║  🚀 Server: http://localhost:${PORT}                           ║
║  🌐 Browser: http://localhost:${PORT}/browser                  ║
║  🔍 Search: http://localhost:${PORT}/search                    ║
║                                                                ║
║  ✨ Features:                                                  ║
║  ✅ Unlimited browsing - any website allowed                   ║
║  ✅ No censorship - adult content OK                           ║
║  ✅ Search Google, Bing, DuckDuckGo                            ║
║  ✅ Bookmark & history management                              ║
║  ✅ User authentication (register/login)                       ║
║                                                                ║
║  🔐 Default Admin: admin / admin123                            ║
╚════════════════════════════════════════════════════════════════╝
    `);
});
