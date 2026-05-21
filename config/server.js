// server.js - ZASS Browser Ultimate Light Edition
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 16232;

// ============ MIDDLEWARE ============
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// ============ SIMPLE CACHE (NO EXTRA STORAGE) ============
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ============ BROWSER INSTANCE (REUSED) ============
let browser = null;

async function getBrowser() {
    if (browser && browser.isConnected()) return browser;
    
    // Find Chrome path automatically
    const paths = [
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        process.env.CHROME_PATH
    ];
    
    let chromePath = null;
    for (const p of paths) {
        if (p && fs.existsSync(p)) {
            chromePath = p;
            break;
        }
    }
    
    if (!chromePath) {
        console.log('⚠️ Chrome not found, using fallback mode');
        return null;
    }
    
    browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ]
    });
    
    return browser;
}

// ============ CORE FUNCTIONS ============

// Smart Search - Works on any engine
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
                            results.push({ title, url: link, snippet: snippet.substring(0, 200) });
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
                            results.push({ title, url: link, snippet: snippet?.substring(0, 200) || '' });
                        }
                    });
                    return results;
                };
                break;
                
            case 'youtube':
                searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
                parser = ($) => {
                    const results = [];
                    $('ytd-video-renderer').each((i, el) => {
                        const title = $(el).find('#video-title').text();
                        const link = 'https://youtube.com' + $(el).find('#video-title').attr('href');
                        const duration = $(el).find('#text').text();
                        if (title && link) {
                            results.push({ title, url: link, duration, type: 'video' });
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
                            results.push({ title, url: link });
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
            query,
            engine,
            results: results.slice(0, 30),
            total: results.length
        };
        
        cache.set(cacheKey, { data, timestamp: Date.now() });
        return data;
        
    } catch (error) {
        return { success: false, error: error.message, query };
    }
}

// Browse any URL (Proxy Mode)
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
            timeout: 20000
        });
        
        const $ = cheerio.load(response.data);
        const title = $('title').text();
        
        // Extract all links
        const links = [];
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().trim().substring(0, 100);
            if (href && href.startsWith('http') && text) {
                links.push({ url: href, text });
            }
            if (links.length >= 100) return false;
        });
        
        // Extract images
        const images = [];
        $('img').each((i, el) => {
            const src = $(el).attr('src');
            if (src && src.startsWith('http')) {
                images.push({ url: src, alt: $(el).attr('alt') || '' });
            }
            if (images.length >= 50) return false;
        });
        
        const data = {
            success: true,
            url,
            title: title || url,
            links,
            images,
            html: response.data
        };
        
        cache.set(cacheKey, { data, timestamp: Date.now() });
        return data;
        
    } catch (error) {
        return { success: false, error: error.message, url };
    }
}

// Full Browser Mode (JavaScript heavy sites)
async function fullBrowse(url) {
    const browserInstance = await getBrowser();
    if (!browserInstance) {
        return proxyBrowse(url);
    }
    
    try {
        const page = await browserInstance.newPage();
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        
        const html = await page.content();
        const title = await page.title();
        const currentUrl = page.url();
        
        const links = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a')).slice(0, 100).map(a => ({
                url: a.href,
                text: a.innerText?.substring(0, 100)
            })).filter(l => l.url && l.url.startsWith('http'));
        });
        
        const images = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('img')).slice(0, 50).map(img => ({
                url: img.src,
                alt: img.alt
            })).filter(i => i.url && i.url.startsWith('http'));
        });
        
        await page.close();
        
        return {
            success: true,
            url: currentUrl,
            title,
            links,
            images,
            html
        };
        
    } catch (error) {
        return { success: false, error: error.message, url };
    }
}

// Download any file
async function downloadFile(url, filename) {
    try {
        const response = await axios({
            method: 'GET',
            url: url,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        return { success: true, stream: response.data, filename: filename || url.split('/').pop() || 'download' };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Get video info (YouTube, TikTok, etc)
async function getVideoInfo(url) {
    try {
        const response = await axios.get(url, { timeout: 10000 });
        const $ = cheerio.load(response.data);
        
        const title = $('title').text();
        const description = $('meta[name="description"]').attr('content') || '';
        const thumbnail = $('meta[property="og:image"]').attr('content') || '';
        
        return {
            success: true,
            title,
            description,
            thumbnail,
            url
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ============ API ROUTES ============

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
    let { url, mode = 'proxy' } = req.query;
    
    if (!url) {
        return res.status(400).json({ error: 'URL required' });
    }
    
    if (!url.startsWith('http')) {
        url = 'https://' + url;
    }
    
    const result = mode === 'full' ? await fullBrowse(url) : await proxyBrowse(url);
    res.json(result);
});

// Download endpoint
app.get('/api/download', async (req, res) => {
    const { url, filename } = req.query;
    
    if (!url) {
        return res.status(400).json({ error: 'URL required' });
    }
    
    const result = await downloadFile(url, filename);
    
    if (result.success) {
        res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
        result.stream.pipe(res);
    } else {
        res.status(500).json({ error: result.error });
    }
});

// Video info endpoint
app.get('/api/video-info', async (req, res) => {
    const { url } = req.query;
    
    if (!url) {
        return res.status(400).json({ error: 'URL required' });
    }
    
    const result = await getVideoInfo(url);
    res.json(result);
});

// Proxy endpoint (bypass CORS)
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
            }
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

// Get cache stats
app.get('/api/cache-stats', (req, res) => {
    res.json({
        size: cache.size,
        keys: Array.from(cache.keys())
    });
});

// ============ SERVE STATIC FILES ============
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>ZASS Browser API</title>
            <style>
                body { font-family: Arial; max-width: 800px; margin: 50px auto; padding: 20px; }
                h1 { color: #667eea; }
                .endpoint { background: #f5f5f5; padding: 10px; margin: 10px 0; border-radius: 5px; }
                code { background: #e0e0e0; padding: 2px 5px; border-radius: 3px; }
                a { color: #667eea; text-decoration: none; }
            </style>
        </head>
        <body>
            <h1>🚀 ZASS Browser API</h1>
            <p>Your browser is running! Use these endpoints:</p>
            
            <div class="endpoint">
                <strong>🔍 Search</strong><br>
                <code>GET /api/search?q=your+query&engine=google</code><br>
                <a href="/api/search?q=hello+world" target="_blank">Try it →</a>
            </div>
            
            <div class="endpoint">
                <strong>🌐 Browse Website</strong><br>
                <code>GET /api/browse?url=example.com&mode=proxy</code><br>
                <a href="/api/browse?url=google.com" target="_blank">Try it →</a>
            </div>
            
            <div class="endpoint">
                <strong>⬇️ Download File</strong><br>
                <code>GET /api/download?url=file_url&filename=name.ext</code>
            </div>
            
            <div class="endpoint">
                <strong>🎬 Video Info</strong><br>
                <code>GET /api/video-info?url=youtube_url</code><br>
                <a href="/api/video-info?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ" target="_blank">Try it →</a>
            </div>
            
            <div class="endpoint">
                <strong>🔄 Proxy (CORS Bypass)</strong><br>
                <code>GET /api/proxy?url=target_url</code>
            </div>
            
            <div class="endpoint">
                <strong>💚 Health Check</strong><br>
                <code>GET /api/health</code><br>
                <a href="/api/health" target="_blank">Try it →</a>
            </div>
            
            <hr>
            <p>⚡ ZASS Browser - Fast, Light, Powerful</p>
        </body>
        </html>
    `);
});

// ============ START SERVER ============
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║     🚀 ZASS BROWSER - LIGHTNING EDITION RUNNING 🚀          ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  📡 Server: http://localhost:${PORT}                        ║
║  🔍 Search: http://localhost:${PORT}/api/search?q=hello     ║
║  🌐 Browse: http://localhost:${PORT}/api/browse?url=        ║
║  💾 Storage: ~50MB total                                    ║
║  ⚡ Speed: SUPER FAST                                       ║
║                                                              ║
║  ✅ Features: Search, Browse, Download, Proxy, Video Info   ║
║  ✅ No heavy databases                                      ║
║  ✅ In-memory cache only                                    ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
    `);
});

// Cleanup on exit
process.on('SIGTERM', async () => {
    if (browser) await browser.close();
    process.exit(0);
});
