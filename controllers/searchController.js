// controllers/searchController.js - Multi-Engine Search Controller
const axios = require('axios');
const cheerio = require('cheerio');
const { getRedisManager } = require('../config/redis');
const User = require('../models/User');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/search.log' })
  ]
});

const redisManager = getRedisManager();

// Search engines configuration
const SEARCH_ENGINES = {
  google: {
    url: 'https://www.google.com/search',
    parse: ($) => {
      const results = [];
      $('div.g').each((i, el) => {
        const title = $(el).find('h3').text();
        const link = $(el).find('a').attr('href');
        const snippet = $(el).find('.VwiC3b').text() || $(el).find('.IsZvec').text();
        if (title && link && link.startsWith('http')) {
          results.push({ title, url: link, snippet: snippet.substring(0, 300) });
        }
      });
      return results;
    }
  },
  bing: {
    url: 'https://www.bing.com/search',
    parse: ($) => {
      const results = [];
      $('li.b_algo').each((i, el) => {
        const title = $(el).find('h2').text();
        const link = $(el).find('a').attr('href');
        const snippet = $(el).find('.b_caption p').text();
        if (title && link) {
          results.push({ title, url: link, snippet: snippet?.substring(0, 300) || '' });
        }
      });
      return results;
    }
  },
  duckduckgo: {
    url: 'https://duckduckgo.com/html/',
    parse: ($) => {
      const results = [];
      $('.result').each((i, el) => {
        const title = $(el).find('.result__a').text();
        const link = $(el).find('.result__a').attr('href');
        const snippet = $(el).find('.result__snippet').text();
        if (title && link) {
          results.push({ title, url: link, snippet: snippet?.substring(0, 300) || '' });
        }
      });
      return results;
    }
  },
  youtube: {
    url: 'https://www.youtube.com/results',
    parse: ($) => {
      const results = [];
      $('ytd-video-renderer').each((i, el) => {
        const title = $(el).find('#video-title').text();
        const link = 'https://youtube.com' + $(el).find('#video-title').attr('href');
        const thumbnail = $(el).find('#img').attr('src');
        const duration = $(el).find('#text').text();
        if (title && link) {
          results.push({ title, url: link, thumbnail, duration, type: 'video' });
        }
      });
      return results;
    }
  },
  twitter: {
    url: 'https://twitter.com/search',
    parse: ($) => {
      const results = [];
      $('article').each((i, el) => {
        const text = $(el).find('[data-testid="tweetText"]').text();
        const author = $(el).find('[data-testid="User-Name"]').text();
        const link = $(el).find('a[href*="/status/"]').attr('href');
        if (text && link) {
          results.push({ text, author, url: `https://twitter.com${link}`, type: 'tweet' });
        }
      });
      return results;
    }
  },
  reddit: {
    url: 'https://www.reddit.com/search',
    parse: ($) => {
      const results = [];
      $('shreddit-post').each((i, el) => {
        const title = $(el).attr('title');
        const link = 'https://reddit.com' + $(el).attr('permalink');
        const score = $(el).attr('score');
        if (title && link) {
          results.push({ title, url: link, score, type: 'post' });
        }
      });
      return results;
    }
  },
  tiktok: {
    url: 'https://www.tiktok.com/search',
    parse: ($) => {
      const results = [];
      $('div.video-feed-item').each((i, el) => {
        const desc = $(el).find('.video-feed-item--desc').text();
        const link = $(el).find('a').attr('href');
        if (desc && link) {
          results.push({ description: desc, url: `https://tiktok.com${link}`, type: 'video' });
        }
      });
      return results;
    }
  },
  instagram: {
    url: 'https://www.instagram.com/web/search/topsearch/',
    isApi: true,
    async fetch(query) {
      const response = await axios.get(`https://www.instagram.com/web/search/topsearch/?query=${encodeURIComponent(query)}`);
      return response.data.users.map(user => ({
        username: user.user.username,
        fullName: user.user.full_name,
        avatar: user.user.profile_pic_url,
        isVerified: user.user.is_verified,
        type: 'profile'
      }));
    }
  },
  github: {
    url: 'https://api.github.com/search/repositories',
    isApi: true,
    async fetch(query) {
      const response = await axios.get(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}`);
      return response.data.items.map(repo => ({
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        url: repo.html_url,
        type: 'repository'
      }));
    }
  },
  wikipedia: {
    url: 'https://en.wikipedia.org/w/api.php',
    isApi: true,
    async fetch(query) {
      const response = await axios.get(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json`);
      return response.data.query.search.map(result => ({
        title: result.title,
        snippet: result.snippet,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(result.title)}`,
        type: 'article'
      }));
    }
  }
};

// Main web search
exports.webSearch = async (req, res) => {
  try {
    const { q, engine = 'google', limit = 20, page = 1 } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Search query required' });
    }
    
    // Check cache
    const cacheKey = `search:${engine}:${q}:${page}`;
    const cached = await redisManager.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }
    
    const searchEngine = SEARCH_ENGINES[engine];
    if (!searchEngine) {
      return res.status(400).json({ error: `Unknown search engine: ${engine}` });
    }
    
    let results = [];
    
    if (searchEngine.isApi) {
      results = await searchEngine.fetch(q);
    } else {
      // Use our browser to get search results
      const response = await axios.get(searchEngine.url, {
        params: { q, num: limit * page },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      const $ = cheerio.load(response.data);
      results = searchEngine.parse($);
    }
    
    // Paginate results
    const start = (page - 1) * limit;
    const paginatedResults = results.slice(start, start + limit);
    
    const responseData = {
      success: true,
      query: q,
      engine: engine,
      page: parseInt(page),
      limit: parseInt(limit),
      total: results.length,
      results: paginatedResults,
      timestamp: new Date().toISOString()
    };
    
    // Cache results
    await redisManager.set(cacheKey, responseData, 300); // Cache for 5 minutes
    
    // Save search history if user is authenticated
    if (req.user) {
      const user = await User.findById(req.user._id);
      user.stats.searches = (user.stats.searches || 0) + 1;
      await user.save();
    }
    
    res.json(responseData);
  } catch (error) {
    logger.error('Search error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Image search
exports.imageSearch = async (req, res) => {
  try {
    const { q, engine = 'google', limit = 20 } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Search query required' });
    }
    
    let url;
    let results = [];
    
    switch(engine) {
      case 'google':
        url = `https://www.google.com/search?q=${encodeURIComponent(q)}&tbm=isch`;
        const response = await axios.get(url, {
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const $ = cheerio.load(response.data);
        $('img.rg_i').each((i, el) => {
          if (i < limit) {
            results.push({
              src: $(el).attr('src'),
              alt: $(el).attr('alt'),
              width: $(el).attr('width'),
              height: $(el).attr('height')
            });
          }
        });
        break;
        
      default:
        return res.status(400).json({ error: 'Unsupported image search engine' });
    }
    
    res.json({
      success: true,
      query: q,
      engine,
      results: results.filter(r => r.src),
      total: results.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Video search
exports.videoSearch = async (req, res) => {
  try {
    const { q, platform = 'youtube', limit = 20 } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Search query required' });
    }
    
    let results = [];
    
    switch(platform) {
      case 'youtube':
        const ytResponse = await axios.get('https://www.googleapis.com/youtube/v3/search', {
          params: {
            part: 'snippet',
            maxResults: limit,
            q: q,
            key: process.env.YOUTUBE_API_KEY,
            type: 'video'
          }
        });
        results = ytResponse.data.items.map(item => ({
          id: item.id.videoId,
          title: item.snippet.title,
          description: item.snippet.description,
          thumbnail: item.snippet.thumbnails.medium.url,
          channel: item.snippet.channelTitle,
          url: `https://youtube.com/watch?v=${item.id.videoId}`,
          platform: 'youtube'
        }));
        break;
        
      case 'tiktok':
        // TikTok search using puppeteer
        const { browse } = require('./browserController');
        const tiktokResult = await browse(`https://www.tiktok.com/search?q=${encodeURIComponent(q)}`);
        // Parse TikTok results
        break;
        
      default:
        return res.status(400).json({ error: 'Unsupported video platform' });
    }
    
    res.json({
      success: true,
      query: q,
      platform,
      results,
      total: results.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// News search
exports.newsSearch = async (req, res) => {
  try {
    const { q, source = 'google', limit = 20 } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Search query required' });
    }
    
    let results = [];
    
    switch(source) {
      case 'google':
        const response = await axios.get(`https://news.google.com/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`, {
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const $ = cheerio.load(response.data);
        $('article').each((i, el) => {
          if (i < limit) {
            const title = $(el).find('h3').text();
            const link = $(el).find('a').attr('href');
            const time = $(el).find('time').text();
            const source = $(el).find('.source').text();
            
            if (title) {
              results.push({
                title,
                url: link ? `https://news.google.com${link}` : null,
                source,
                time,
                timestamp: new Date().toISOString()
              });
            }
          }
        });
        break;
        
      default:
        return res.status(400).json({ error: 'Unsupported news source' });
    }
    
    res.json({
      success: true,
      query: q,
      source,
      results,
      total: results.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Map search
exports.mapSearch = async (req, res) => {
  try {
    const { q, lat, lng, zoom = 12 } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Search query required' });
    }
    
    // Generate OpenStreetMap URL
    let mapUrl = `https://www.openstreetmap.org/search?query=${encodeURIComponent(q)}`;
    if (lat && lng) {
      mapUrl = `https://www.openstreetmap.org/#map=${zoom}/${lat}/${lng}`;
    }
    
    res.json({
      success: true,
      query: q,
      mapUrl,
      embedUrl: `https://www.openstreetmap.org/export/embed.html?bbox=${lng-0.1},${lat-0.1},${lng+0.1},${lat+0.1}&layer=mapnik`
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Shopping search
exports.shoppingSearch = async (req, res) => {
  try {
    const { q, store = 'google', limit = 20 } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Search query required' });
    }
    
    let results = [];
    
    switch(store) {
      case 'google':
        const response = await axios.get(`https://www.google.com/search?q=${encodeURIComponent(q)}&tbm=shop`, {
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const $ = cheerio.load(response.data);
        $('.sh-dgr__content').each((i, el) => {
          if (i < limit) {
            const title = $(el).find('.sh-np__title').text();
            const price = $(el).find('.a8Pemb').text();
            const link = $(el).find('a').attr('href');
            
            results.push({ title, price, url: link, store: 'Google Shopping' });
          }
        });
        break;
        
      case 'amazon':
        // Amazon search
        break;
        
      default:
        return res.status(400).json({ error: 'Unsupported shopping store' });
    }
    
    res.json({
      success: true,
      query: q,
      store,
      results,
      total: results.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get search suggestions
exports.getSuggestions = async (req, res) => {
  try {
    const { q, engine = 'google' } = req.query;
    
    if (!q || q.length < 2) {
      return res.json({ suggestions: [] });
    }
    
    let suggestions = [];
    
    switch(engine) {
      case 'google':
        const response = await axios.get(`https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(q)}`);
        suggestions = response.data[1];
        break;
        
      case 'bing':
        const bingResponse = await axios.get(`https://api.bing.com/osjson.aspx?query=${encodeURIComponent(q)}`);
        suggestions = bingResponse.data[1];
        break;
        
      case 'youtube':
        const ytResponse = await axios.get(`https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(q)}`);
        suggestions = ytResponse.data[1];
        break;
    }
    
    res.json({
      success: true,
      query: q,
      engine,
      suggestions: suggestions.map(s => ({ text: s, type: 'suggestion' }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get trending searches
exports.getTrending = async (req, res) => {
  try {
    const { region = 'US', category = 'all' } = req.query;
    
    // Check cache
    const cacheKey = `trending:${region}:${category}`;
    const cached = await redisManager.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }
    
    // Get trending from Google
    const response = await axios.get(`https://trends.google.com/trends/trendingsearches/daily/rss?geo=${region}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    
    const $ = cheerio.load(response.data, { xmlMode: true });
    const trends = [];
    
    $('item').each((i, el) => {
      trends.push({
        title: $(el).find('title').text(),
        traffic: $(el).find('ht:approx_traffic').text(),
        link: $(el).find('link').text(),
        pubDate: $(el).find('pubDate').text()
      });
    });
    
    const result = {
      success: true,
      region,
      category,
      trends: trends.slice(0, 20),
      timestamp: new Date().toISOString()
    };
    
    await redisManager.set(cacheKey, result, 3600); // Cache for 1 hour
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// AI-powered search
exports.aiSearch = async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Search query required' });
    }
    
    // Use OpenAI for AI-powered search (if API key is available)
    let aiResponse = null;
    
    if (process.env.OPENAI_API_KEY) {
      const OpenAI = require('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "You are a helpful search assistant. Provide concise, accurate answers." },
          { role: "user", content: q }
        ],
        max_tokens: 500
      });
      
      aiResponse = completion.choices[0].message.content;
    }
    
    // Also get web results
    const webResults = await exports.webSearch({
      query: { q, limit: 10 }
    }, {
      json: (data) => data
    });
    
    res.json({
      success: true,
      query: q,
      aiAnswer: aiResponse,
      webResults: webResults.results || [],
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Voice search (transcription endpoint)
exports.voiceSearch = async (req, res) => {
  try {
    // This endpoint expects audio file upload
    // For now, return placeholder
    res.json({
      success: true,
      message: "Voice search endpoint. Send audio file to /api/search/voice with POST method.",
      note: "This requires audio transcription service (e.g., Google Speech-to-Text)"
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Reverse image search
exports.reverseImageSearch = async (req, res) => {
  try {
    const { imageUrl } = req.body;
    
    if (!imageUrl) {
      return res.status(400).json({ error: 'Image URL required' });
    }
    
    // Use Google Reverse Image Search
    const searchUrl = `https://www.google.com/searchbyimage?image_url=${encodeURIComponent(imageUrl)}`;
    
    res.json({
      success: true,
      message: "Reverse image search initiated",
      url: searchUrl,
      instructions: "Open the URL in your browser to see results"
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Find similar content
exports.findSimilar = async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({ error: 'URL required' });
    }
    
    // Use Google's "Related" search
    const similarUrl = `https://www.google.com/search?q=related:${encodeURIComponent(url)}`;
    
    res.json({
      success: true,
      url: url,
      similarSearchUrl: similarUrl,
      instructions: "Open the URL to find similar content"
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get related searches
exports.getRelated = async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Search query required' });
    }
    
    // Get related searches from Google
    const response = await axios.get(`https://www.google.com/search?q=${encodeURIComponent(q)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    
    const $ = cheerio.load(response.data);
    const related = [];
    
    $('.s75CSd').each((i, el) => {
      related.push($(el).text());
    });
    
    res.json({
      success: true,
      query: q,
      related: related.slice(0, 10)
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
