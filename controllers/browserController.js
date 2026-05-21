// controllers/browserController.js - Full Browser Engine Controller
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { Cluster } = require('puppeteer-cluster');
const BrowserSession = require('../models/BrowserSession');
const { getRedisManager } = require('../config/redis');
const winston = require('winston');

puppeteer.use(StealthPlugin());

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/browser.log' })
  ]
});

const redisManager = getRedisManager();
let browserCluster = null;

// Initialize browser cluster
async function initBrowserCluster() {
  if (browserCluster) return browserCluster;
  
  browserCluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_CONTEXT,
    maxConcurrency: 10,
    puppeteerOptions: {
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920x1080',
        '--disable-web-security',
        '--allow-running-insecure-content',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-blink-features=AutomationControlled',
        '--disable-extensions',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-translate',
        '--hide-scrollbars',
        '--mute-audio',
        '--no-first-run',
        '--no-default-browser-check'
      ],
      ignoreHTTPSErrors: true
    }
  });
  
  await browserCluster.task(async ({ page, data }) => {
    const { url, options = {}, action } = data;
    
    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Referer': 'https://www.google.com/',
        'DNT': '1'
      });
      
      if (action === 'screenshot') {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: options.timeout || 30000 });
        const screenshot = await page.screenshot({ encoding: 'base64', fullPage: options.fullPage || false });
        return { success: true, screenshot, url };
      }
      
      if (action === 'pdf') {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        const pdf = await page.pdf({ format: 'A4', printBackground: true });
        return { success: true, pdf: pdf.toString('base64'), url };
      }
      
      if (action === 'execute') {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        const result = await page.evaluate(options.script);
        return { success: true, result, url };
      }
      
      // Default: get full page content
      await page.goto(url, { waitUntil: 'networkidle2', timeout: options.timeout || 30000 });
      
      const html = await page.content();
      const title = await page.title();
      const currentUrl = page.url();
      
      const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a')).map(a => ({
          href: a.href,
          text: a.innerText?.substring(0, 200) || '',
          target: a.target
        })).filter(l => l.href && l.href.startsWith('http'));
      });
      
      const images = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('img')).map(img => ({
          src: img.src,
          alt: img.alt,
          width: img.width,
          height: img.height
        })).filter(i => i.src && i.src.startsWith('http'));
      });
      
      const scripts = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('script[src]')).map(s => s.src);
      });
      
      const styles = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(l => l.href);
      });
      
      return {
        success: true,
        url: currentUrl,
        title,
        html,
        links: links.slice(0, 500),
        images: images.slice(0, 100),
        scripts: scripts.slice(0, 50),
        styles: styles.slice(0, 50),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return { success: false, error: error.message, url };
    }
  });
  
  return browserCluster;
}

// Browse any URL
exports.browse = async (req, res) => {
  try {
    let { url, screenshot, pdf, timeout, fullPage } = req.query;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL parameter required',
        code: 'NO_URL'
      });
    }
    
    // Add https if no protocol
    if (!url.startsWith('http')) {
      url = 'https://' + url;
    }
    
    // Check cache
    const cacheKey = `browse:${url}`;
    const cached = await redisManager.get(cacheKey);
    if (cached && !screenshot && !pdf) {
      return res.json(cached);
    }
    
    // Initialize cluster
    const cluster = await initBrowserCluster();
    
    let action = 'browse';
    if (screenshot === 'true') action = 'screenshot';
    if (pdf === 'true') action = 'pdf';
    
    const result = await cluster.execute({ url, options: { timeout: parseInt(timeout) || 30000, fullPage: fullPage === 'true' }, action });
    
    if (result.success) {
      // Cache result (except screenshots and PDFs)
      if (action === 'browse') {
        await redisManager.set(cacheKey, result, 300); // Cache for 5 minutes
      }
      
      // Save to user's browser history if authenticated
      if (req.user && action === 'browse') {
        let session = await BrowserSession.findOne({ userId: req.user._id });
        if (!session) {
          session = new BrowserSession({
            userId: req.user._id,
            sessionId: require('crypto').randomBytes(16).toString('hex'),
            tabs: [{ id: 0, url: result.url, title: result.title, history: [result.url], historyIndex: 0 }]
          });
          await session.save();
        } else {
          session.addToHistory(result.url, result.title);
          await session.save();
        }
      }
      
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    logger.error('Browse error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'BROWSE_ERROR'
    });
  }
};

// POST browse (for larger requests)
exports.browsePost = async (req, res) => {
  try {
    const { url, options = {} } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL required',
        code: 'NO_URL'
      });
    }
    
    const cluster = await initBrowserCluster();
    const result = await cluster.execute({ url, options });
    
    res.json(result);
  } catch (error) {
    logger.error('Browse POST error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Take screenshot
exports.screenshot = async (req, res) => {
  try {
    let { url, fullPage = 'false' } = req.query;
    
    if (!url) {
      return res.status(400).json({ error: 'URL required' });
    }
    
    if (!url.startsWith('http')) {
      url = 'https://' + url;
    }
    
    const cluster = await initBrowserCluster();
    const result = await cluster.execute({ url, action: 'screenshot', options: { fullPage: fullPage === 'true' } });
    
    if (result.success) {
      res.json({ success: true, screenshot: result.screenshot, url: result.url });
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Generate PDF
exports.generatePDF = async (req, res) => {
  try {
    let { url } = req.query;
    
    if (!url) {
      return res.status(400).json({ error: 'URL required' });
    }
    
    if (!url.startsWith('http')) {
      url = 'https://' + url;
    }
    
    const cluster = await initBrowserCluster();
    const result = await cluster.execute({ url, action: 'pdf' });
    
    if (result.success) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="screenshot.pdf"`);
      res.send(Buffer.from(result.pdf, 'base64'));
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Execute JavaScript on page
exports.executeScript = async (req, res) => {
  try {
    const { url, script } = req.body;
    
    if (!url || !script) {
      return res.status(400).json({ error: 'URL and script required' });
    }
    
    const cluster = await initBrowserCluster();
    const result = await cluster.execute({ url, action: 'execute', options: { script } });
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get browser session
exports.getSession = async (req, res) => {
  try {
    let session = await BrowserSession.findOne({ userId: req.user._id });
    
    if (!session) {
      session = new BrowserSession({
        userId: req.user._id,
        sessionId: require('crypto').randomBytes(16).toString('hex'),
        tabs: [{ id: 0, url: 'https://www.google.com', title: 'New Tab', history: ['https://www.google.com'], historyIndex: 0 }]
      });
      await session.save();
    }
    
    res.json({ success: true, session });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get browser history
exports.getHistory = async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    
    const session = await BrowserSession.findOne({ userId: req.user._id });
    if (!session) {
      return res.json({ success: true, history: [], total: 0 });
    }
    
    const history = session.history.slice(offset, offset + parseInt(limit));
    
    res.json({
      success: true,
      history,
      total: session.history.length,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Save to history
exports.saveHistory = async (req, res) => {
  try {
    const { url, title } = req.body;
    
    let session = await BrowserSession.findOne({ userId: req.user._id });
    if (!session) {
      session = new BrowserSession({
        userId: req.user._id,
        sessionId: require('crypto').randomBytes(16).toString('hex')
      });
    }
    
    session.addToHistory(url, title);
    await session.save();
    
    res.json({ success: true, message: 'History saved' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Delete history item
exports.deleteHistory = async (req, res) => {
  try {
    const { id } = req.params;
    
    const session = await BrowserSession.findOne({ userId: req.user._id });
    if (session) {
      const index = session.history.findIndex(h => h.id === id);
      if (index !== -1) {
        session.history.splice(index, 1);
        await session.save();
      }
    }
    
    res.json({ success: true, message: 'History deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get bookmarks
exports.getBookmarks = async (req, res) => {
  try {
    const { folder = 'root' } = req.query;
    
    const session = await BrowserSession.findOne({ userId: req.user._id });
    if (!session) {
      return res.json({ success: true, bookmarks: [] });
    }
    
    const bookmarks = session.bookmarks.filter(b => b.folder === folder);
    
    res.json({ success: true, bookmarks });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Add bookmark
exports.addBookmark = async (req, res) => {
  try {
    const { url, title, folder = 'root' } = req.body;
    
    let session = await BrowserSession.findOne({ userId: req.user._id });
    if (!session) {
      session = new BrowserSession({
        userId: req.user._id,
        sessionId: require('crypto').randomBytes(16).toString('hex')
      });
    }
    
    const bookmark = session.addBookmark(url, title, folder);
    await session.save();
    
    res.json({ success: true, bookmark });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Delete bookmark
exports.deleteBookmark = async (req, res) => {
  try {
    const { id } = req.params;
    
    const session = await BrowserSession.findOne({ userId: req.user._id });
    if (session) {
      session.removeBookmark(id);
      await session.save();
    }
    
    res.json({ success: true, message: 'Bookmark deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get downloads
exports.getDownloads = async (req, res) => {
  try {
    const session = await BrowserSession.findOne({ userId: req.user._id });
    if (!session) {
      return res.json({ success: true, downloads: [] });
    }
    
    res.json({ success: true, downloads: session.downloads });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Download file
exports.downloadFile = async (req, res) => {
  try {
    const { url, filename } = req.body;
    const axios = require('axios');
    
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const finalFilename = filename || url.split('/').pop() || 'download';
    res.setHeader('Content-Disposition', `attachment; filename="${finalFilename}"`);
    response.data.pipe(res);
    
    // Save to user's download history
    if (req.user) {
      const session = await BrowserSession.findOne({ userId: req.user._id });
      if (session) {
        session.downloads.push({
          id: require('crypto').randomBytes(16).toString('hex'),
          url: url,
          filename: finalFilename,
          status: 'completed',
          completedAt: new Date()
        });
        await session.save();
      }
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get cookies
exports.getCookies = async (req, res) => {
  try {
    const { domain } = req.query;
    
    const session = await BrowserSession.findOne({ userId: req.user._id });
    if (!session) {
      return res.json({ success: true, cookies: [] });
    }
    
    let cookies = session.cookies;
    if (domain) {
      cookies = cookies.filter(c => c.domain === domain);
    }
    
    res.json({ success: true, cookies });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Set cookies
exports.setCookies = async (req, res) => {
  try {
    const { cookies } = req.body;
    
    let session = await BrowserSession.findOne({ userId: req.user._id });
    if (!session) {
      session = new BrowserSession({
        userId: req.user._id,
        sessionId: require('crypto').randomBytes(16).toString('hex')
      });
    }
    
    for (const cookie of cookies) {
      const existing = session.cookies.findIndex(c => c.name === cookie.name && c.domain === cookie.domain);
      if (existing !== -1) {
        session.cookies[existing] = { ...session.cookies[existing], ...cookie };
      } else {
        session.cookies.push(cookie);
      }
    }
    
    await session.save();
    res.json({ success: true, message: 'Cookies saved' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Clear cookies
exports.clearCookies = async (req, res) => {
  try {
    const session = await BrowserSession.findOne({ userId: req.user._id });
    if (session) {
      session.cookies = [];
      await session.save();
    }
    
    res.json({ success: true, message: 'Cookies cleared' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get local storage
exports.getLocalStorage = async (req, res) => {
  try {
    const { domain } = req.query;
    
    const session = await BrowserSession.findOne({ userId: req.user._id });
    if (!session) {
      return res.json({ success: true, localStorage: [] });
    }
    
    let storage = session.localStorage;
    if (domain) {
      storage = storage.filter(s => s.domain === domain);
    }
    
    res.json({ success: true, localStorage: storage });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Set local storage
exports.setLocalStorage = async (req, res) => {
  try {
    const { key, value, domain } = req.body;
    
    let session = await BrowserSession.findOne({ userId: req.user._id });
    if (!session) {
      session = new BrowserSession({
        userId: req.user._id,
        sessionId: require('crypto').randomBytes(16).toString('hex')
      });
    }
    
    const existing = session.localStorage.findIndex(l => l.key === key && l.domain === domain);
    if (existing !== -1) {
      session.localStorage[existing].value = value;
    } else {
      session.localStorage.push({ key, value, domain });
    }
    
    await session.save();
    res.json({ success: true, message: 'Local storage saved' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// WebSocket browse handler
exports.browseWebSocket = async (url, options) => {
  try {
    const cluster = await initBrowserCluster();
    return await cluster.execute({ url, options });
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// Take screenshot via WebSocket
exports.takeScreenshot = async (url, options = {}) => {
  try {
    const cluster = await initBrowserCluster();
    return await cluster.execute({ url, action: 'screenshot', options });
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// Evaluate script via WebSocket
exports.evaluateScript = async (url, script) => {
  try {
    const cluster = await initBrowserCluster();
    return await cluster.execute({ url, action: 'execute', options: { script } });
  } catch (error) {
    return { success: false, error: error.message };
  }
};
