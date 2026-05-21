const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const axios = require('axios');
const { JSDOM } = require('jsdom');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(compression());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ============ BROWSER PROXY ENDPOINTS ============

// Main browser page
app.get('/browser', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'browser.html'));
});

// Browse endpoint - fetches and returns HTML content
app.get('/api/browser/browse', async (req, res) => {
    const targetUrl = req.query.url;
    
    if (!targetUrl) {
        return res.status(400).json({ 
            success: false, 
            error: 'URL parameter is required' 
        });
    }
    
    try {
        // Validate and format URL
        let url = targetUrl;
        if (!url.startsWith('http')) {
            url = 'https://' + url;
        }
        
        // Fetch the webpage
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br'
            },
            timeout: 30000,
            maxRedirects: 5
        });
        
        let html = response.data;
        
        // Get title from HTML
        let title = url;
        try {
            const dom = new JSDOM(html);
            title = dom.window.document.title || url;
        } catch (e) {
            title = url;
        }
        
        // Modify HTML to work in iframe (fix relative paths, add base tag)
        html = html.replace(/<head>/i, `<head><base href="${url}/">`);
        
        // Remove X-Frame-Options headers that block iframe embedding
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        
        res.json({
            success: true,
            url: url,
            title: title,
            html: html,
            status: response.status
        });
        
    } catch (error) {
        console.error('Browse error:', error.message);
        
        // Return error page
        const errorHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Error - ZASS Browser</title>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        height: 100vh;
                        margin: 0;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                    }
                    .error-container {
                        text-align: center;
                        padding: 40px;
                    }
                    h1 { font-size: 48px; margin-bottom: 20px; }
                    p { font-size: 18px; margin-bottom: 30px; opacity: 0.9; }
                    .url { background: rgba(255,255,255,0.2); padding: 10px 20px; border-radius: 8px; display: inline-block; margin-bottom: 20px; }
                    button {
                        background: white;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 8px;
                        font-size: 16px;
                        cursor: pointer;
                        color: #667eea;
                        font-weight: bold;
                    }
                    button:hover { transform: scale(1.05); }
                </style>
            </head>
            <body>
                <div class="error-container">
                    <h1>🌐 Connection Error</h1>
                    <div class="url">${targetUrl}</div>
                    <p>${error.message || 'Failed to load the webpage'}</p>
                    <button onclick="window.location.href='/browser'">← Back to Browser</button>
                </div>
            </body>
            </html>
        `;
        
        res.json({
            success: false,
            error: error.message,
            html: errorHtml,
            url: targetUrl,
            title: 'Error'
        });
    }
});

// Search endpoint
app.get('/api/browser/search', async (req, res) => {
    const query = req.query.q;
    const engine = req.query.engine || 'google';
    
    if (!query) {
        return res.status(400).json({ success: false, error: 'Search query required' });
    }
    
    let searchUrl;
    if (engine === 'google') {
        searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    } else if (engine === 'bing') {
        searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
    } else if (engine === 'duckduckgo') {
        searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
    } else if (engine === 'youtube') {
        searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    } else {
        searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    }
    
    res.json({
        success: true,
        url: searchUrl,
        query: query,
        engine: engine
    });
});

// ============ BOOKMARKS API ============
let bookmarks = [];

app.get('/api/browser/bookmarks', (req, res) => {
    res.json({ success: true, bookmarks });
});

app.post('/api/browser/bookmarks', (req, res) => {
    const { url, title } = req.body;
    
    if (!url) {
        return res.status(400).json({ success: false, error: 'URL required' });
    }
    
    const bookmark = {
        id: Date.now(),
        url,
        title: title || url,
        createdAt: new Date().toISOString()
    };
    
    // Check if already exists
    if (!bookmarks.find(b => b.url === url)) {
        bookmarks.unshift(bookmark);
    }
    
    res.json({ success: true, bookmark });
});

app.delete('/api/browser/bookmarks/:id', (req, res) => {
    const id = parseInt(req.params.id);
    bookmarks = bookmarks.filter(b => b.id !== id);
    res.json({ success: true });
});

// ============ HISTORY API ============
let history = [];

app.get('/api/browser/history', (req, res) => {
    res.json({ success: true, history: history.slice(0, 100) });
});

app.post('/api/browser/history', (req, res) => {
    const { url, title } = req.body;
    
    if (!url) return res.json({ success: false });
    
    const historyItem = {
        id: Date.now(),
        url,
        title: title || url,
        timestamp: new Date().toISOString()
    };
    
    history.unshift(historyItem);
    
    // Keep only last 500 items
    if (history.length > 500) history.pop();
    
    res.json({ success: true });
});

// ============ SETTINGS API ============
let settings = {
    defaultEngine: 'google',
    homepage: 'https://www.google.com',
    blockAds: false,
    saveHistory: true,
    darkMode: false,
    adultContent: true
};

app.get('/api/browser/settings', (req, res) => {
    res.json({ success: true, settings });
});

app.post('/api/browser/settings', (req, res) => {
    settings = { ...settings, ...req.body };
    res.json({ success: true, settings });
});

// ============ HEALTH CHECK ============
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        node_version: process.version,
        environment: process.env.NODE_ENV || 'development'
    });
});

// ============ HOME PAGE ============
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'browser.html'));
});

// ============ 404 HANDLER ============
app.use((req, res) => {
    if (req.accepts('html')) {
        res.status(404).send(`
            <!DOCTYPE html>
            <html>
            <head><title>404 - Page Not Found</title>
            <style>
                body {
                    font-family: system-ui, -apple-system, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    text-align: center;
                }
                h1 { font-size: 72px; margin-bottom: 20px; }
                p { font-size: 20px; margin-bottom: 30px; }
                a { color: white; background: rgba(255,255,255,0.2); padding: 12px 24px; border-radius: 8px; text-decoration: none; }
                a:hover { background: rgba(255,255,255,0.3); }
            </style>
            </head>
            <body>
                <div>
                    <h1>404</h1>
                    <p>Oops! The page you're looking for doesn't exist.</p>
                    <a href="/">← Back to Browser</a>
                </div>
            </body>
            </html>
        `);
    } else {
        res.status(404).json({ error: 'Not Found' });
    }
});

// ============ ERROR HANDLER ============
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// ============ START SERVER ============
const server = app.listen(PORT, () => {
    console.log(`
    ╔══════════════════════════════════════════════════════════════╗
    ║                                                              ║
    ║   🚀 ZASS BROWSER - ULTIMATE WEB BROWSER                    ║
    ║                                                              ║
    ║   📡 Server running on: http://localhost:${PORT}              ║
    ║   🌐 Browser URL: http://localhost:${PORT}/browser            ║
    ║   ❤️  Health check: http://localhost:${PORT}/health           ║
    ║                                                              ║
    ║   ✨ Features:                                               ║
    ║   • Full web browser with iframe rendering                  ║
    ║   • Bookmark management                                      ║
    ║   • Browsing history                                         ║
    ║   • Dark mode support                                        ║
    ║   • Multiple tabs                                            ║
    ║   • Search engine selection                                  ║
    ║   • Zoom controls                                            ║
    ║                                                              ║
    ╚══════════════════════════════════════════════════════════════╝
    `);
});

process.on('SIGTERM', () => {
    console.log('SIGTERM received, closing server...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

module.exports = app;
