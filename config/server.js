// server.js - ZASS Browser (Heroku Compatible - No Puppeteer!)
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 16232;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Cache system
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ============ SEARCH FUNCTION ============
async function searchWeb(query, engine = 'google') {
    const cacheKey = `search:${engine}:${query}`;
    
    if (cache.has(cacheKey)) {
        const cached = cache.get(cacheKey);
        if (Date.now() - cached.timestamp < CACHE_TTL) {
            return cached.data;
        }
    }
    
    try {
        let searchUrl;
        let parser;
        
        switch(engine) {
            case 'google':
                searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
                parser = ($) => {
                    const results = [];
                    $('div.g').each((i, el) => {
                        const title = $(el).find('h3').text();
                        const link = $(el).find('a').attr('href');
                        const snippet = $(el).find('.VwiC3b').text() || $(el).find('.IsZvec').text();
                        if (title && link && link.startsWith('http')) {
                            results.push({ 
                                title: title || 'Untitled', 
                                url: link, 
                                snippet: snippet?.substring(0, 200) || '' 
                            });
                        }
                    });
                    return results;
                };
                break;
                
            case 'bing':
                searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
                parser = ($) => {
                    const results = [];
                    $('li.b_algo').each((i, el) => {
                        const title = $(el).find('h2').text();
                        const link = $(el).find('a').attr('href');
                        const snippet = $(el).find('.b_caption p').text();
                        if (title && link) {
                            results.push({ 
                                title: title, 
                                url: link, 
                                snippet: snippet?.substring(0, 200) || '' 
                            });
                        }
                    });
                    return results;
                };
                break;
                
            default:
                searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
                parser = ($) => {
                    const results = [];
                    $('div.g').each((i, el) => {
                        const title = $(el).find('h3').text();
                        const link = $(el).find('a').attr('href');
                        if (title && link && link.startsWith('http')) {
                            results.push({ title: title, url: link });
                        }
                    });
                    return results;
                };
        }
        
        const response = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 15000
        });
        
        const $ = cheerio.load(response.data);
        const results = parser($);
        
        const data = {
            success: true,
            query: query,
            engine: engine,
            results: results.slice(0, 25),
            total: results.length
        };
        
        cache.set(cacheKey, { data, timestamp: Date.now() });
        return data;
        
    } catch (error) {
        return { 
            success: false, 
            error: error.message, 
            query: query 
        };
    }
}

// ============ BROWSE FUNCTION (PROXY) ============
async function proxyBrowse(url) {
    const cacheKey = `browse:${url}`;
    
    if (cache.has(cacheKey)) {
        const cached = cache.get(cacheKey);
        if (Date.now() - cached.timestamp < CACHE_TTL) {
            return cached.data;
        }
    }
    
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 20000,
            maxRedirects: 5
        });
        
        const $ = cheerio.load(response.data);
        const title = $('title').text();
        
        const links = [];
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().trim().substring(0, 100);
            if (href && href.startsWith('http') && text) {
                links.push({ url: href, text: text });
            }
            if (links.length >= 50) return false;
        });
        
        const data = {
            success: true,
            url: url,
            title: title || url,
            links: links,
            contentLength: response.data.length
        };
        
        cache.set(cacheKey, { data, timestamp: Date.now() });
        return data;
        
    } catch (error) {
        return { 
            success: false, 
            error: error.message, 
            url: url 
        };
    }
}

// ============ API ENDPOINTS ============

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'running',
        name: 'ZASS Browser',
        version: '2.0.0',
        cacheSize: cache.size,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// Search endpoint
app.get('/api/search', async (req, res) => {
    const { q, engine = 'google' } = req.query;
    
    if (!q) {
        return res.status(400).json({ error: 'Search query required' });
    }
    
    const result = await searchWeb(q, engine);
    res.json(result);
});

// Browse endpoint
app.get('/api/browse', async (req, res) => {
    let { url } = req.query;
    
    if (!url) {
        return res.status(400).json({ error: 'URL required' });
    }
    
    if (!url.startsWith('http')) {
        url = 'https://' + url;
    }
    
    const result = await proxyBrowse(url);
    res.json(result);
});

// Proxy endpoint (CORS bypass)
app.get('/api/proxy', async (req, res) => {
    const { url } = req.query;
    
    if (!url) {
        return res.status(400).json({ error: 'URL required' });
    }
    
    try {
        const response = await axios({
            method: 'GET',
            url: url,
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 30000
        });
        
        res.set('Content-Type', response.headers['content-type']);
        res.send(response.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Clear cache
app.post('/api/clear-cache', (req, res) => {
    cache.clear();
    res.json({ success: true, message: 'Cache cleared' });
});

// ============ SERVE WEB INTERFACE ============
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>ZASS Browser</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                }
                .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
                .header {
                    background: white;
                    border-radius: 20px;
                    padding: 20px;
                    margin-bottom: 20px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.1);
                }
                h1 { color: #667eea; margin-bottom: 10px; }
                .search-box {
                    display: flex;
                    gap: 10px;
                    margin-top: 20px;
                }
                .search-box input {
                    flex: 1;
                    padding: 15px 20px;
                    border: 2px solid #e0e0e0;
                    border-radius: 50px;
                    font-size: 16px;
                    outline: none;
                }
                .search-box input:focus { border-color: #667eea; }
                .search-box button {
                    padding: 15px 30px;
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    color: white;
                    border: none;
                    border-radius: 50px;
                    cursor: pointer;
                    font-size: 16px;
                    font-weight: 600;
                }
                .results {
                    background: white;
                    border-radius: 20px;
                    padding: 20px;
                    margin-top: 20px;
                }
                .result {
                    padding: 15px;
                    border-bottom: 1px solid #eee;
                    cursor: pointer;
                }
                .result:hover { background: #f8f9fa; }
                .result-title { color: #1a73e8; font-size: 18px; margin-bottom: 5px; }
                .result-url { color: #202124; font-size: 12px; margin-bottom: 5px; word-break: break-all; }
                .result-snippet { color: #5f6368; font-size: 14px; }
                .loading {
                    text-align: center;
                    padding: 40px;
                    display: none;
                }
                .spinner {
                    width: 40px;
                    height: 40px;
                    border: 3px solid #f3f3f3;
                    border-top: 3px solid #667eea;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin: 0 auto 15px;
                }
                @keyframes spin { to { transform: rotate(360deg); } }
                .status {
                    text-align: center;
                    padding: 10px;
                    color: white;
                }
                .engine-select {
                    margin-left: 10px;
                    padding: 10px;
                    border-radius: 10px;
                    border: 1px solid #ddd;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🚀 ZASS Browser</h1>
                    <p>Search anything - No limits, no censorship</p>
                    <div class="search-box">
                        <input type="text" id="searchInput" placeholder="Search or enter URL..." onkeypress="if(event.key==='Enter') search()">
                        <select id="engineSelect" class="engine-select">
                            <option value="google">Google</option>
                            <option value="bing">Bing</option>
                        </select>
                        <button onclick="search()">Search</button>
                    </div>
                </div>
                <div id="loading" class="loading"><div class="spinner"></div><p>Loading...</p></div>
                <div id="results" class="results"></div>
                <div class="status">
                    <span id="statusText">✅ ZASS Browser is running</span>
                </div>
            </div>

            <script>
                async function search() {
                    const query = document.getElementById('searchInput').value.trim();
                    const engine = document.getElementById('engineSelect').value;
                    
                    if (!query) return;
                    
                    // Check if it's a URL
                    if (query.includes('.') && (query.startsWith('http') || query.includes('www.'))) {
                        let url = query;
                        if (!url.startsWith('http')) url = 'https://' + url;
                        window.open(url, '_blank');
                        return;
                    }
                    
                    showLoading();
                    
                    try {
                        const response = await fetch(\`/api/search?q=\${encodeURIComponent(query)}&engine=\${engine}\`);
                        const data = await response.json();
                        
                        if (data.success && data.results) {
                            displayResults(data.results, query);
                            document.getElementById('statusText').innerHTML = \`✅ Found \${data.results.length} results\`;
                        } else {
                            document.getElementById('results').innerHTML = \`<p style="text-align:center;padding:40px;">No results found for "\${query}"</p>\`;
                        }
                    } catch (error) {
                        document.getElementById('results').innerHTML = \`<p style="text-align:center;padding:40px;color:red;">Error: \${error.message}</p>\`;
                    }
                    
                    hideLoading();
                }
                
                function displayResults(results, query) {
                    const container = document.getElementById('results');
                    container.innerHTML = \`<h3 style="margin-bottom:20px;">🔍 Results for "\${query}" (\${results.length})</h3>\`;
                    
                    results.forEach(result => {
                        const div = document.createElement('div');
                        div.className = 'result';
                        div.onclick = () => {
                            if (result.url) window.open(result.url, '_blank');
                        };
                        div.innerHTML = \`
                            <div class="result-title">\${result.title || result.url}</div>
                            <div class="result-url">\${result.url}</div>
                            <div class="result-snippet">\${result.snippet || 'Click to visit'}</div>
                        \`;
                        container.appendChild(div);
                    });
                }
                
                function showLoading() {
                    document.getElementById('loading').style.display = 'block';
                    document.getElementById('results').innerHTML = '';
                }
                
                function hideLoading() {
                    document.getElementById('loading').style.display = 'none';
                }
                
                // Check API health
                async function checkHealth() {
                    try {
                        const response = await fetch('/api/health');
                        const data = await response.json();
                        console.log('ZASS Browser:', data);
                    } catch (error) {
                        console.error('Health check failed:', error);
                    }
                }
                checkHealth();
            </script>
        </body>
        </html>
    `);
});

// ============ START SERVER ============
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║     🚀 ZASS BROWSER - RUNNING ON HEROKU 🚀                  ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  📡 Server: http://localhost:${PORT}                        ║
║  🔍 Search: /api/search?q=hello                             ║
║  🌐 Browse: /api/browse?url=example.com                     ║
║                                                              ║
║  ✅ No Chrome needed!                                       ║
║  ✅ Works on Heroku out of the box!                         ║
║  ✅ Lightweight & Fast!                                     ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
    `);
});
