// controllers/mediaController.js - Video/Audio/Image Download & Processing
const ytdl = require('ytdl-core');
const ytpl = require('ytpl');
const ytsr = require('ytsr');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const { getRedisManager } = require('../config/redis');
const User = require('../models/User');
const winston = require('winston');

ffmpeg.setFfmpegPath(ffmpegStatic);

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/media.log' })
  ]
});

const redisManager = getRedisManager();

// Get media info (YouTube, TikTok, Instagram, etc.)
exports.getMediaInfo = async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({ error: 'URL required' });
    }
    
    let info = null;
    
    // YouTube
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      try {
        const videoInfo = await ytdl.getInfo(url);
        info = {
          platform: 'youtube',
          type: 'video',
          title: videoInfo.videoDetails.title,
          duration: parseInt(videoInfo.videoDetails.lengthSeconds),
          thumbnail: videoInfo.videoDetails.thumbnails[0]?.url,
          author: videoInfo.videoDetails.author.name,
          views: videoInfo.videoDetails.viewCount,
          likes: videoInfo.videoDetails.likes,
          formats: videoInfo.formats
            .filter(f => f.hasVideo || f.hasAudio)
            .map(f => ({
              quality: f.qualityLabel || f.quality,
              container: f.container,
              hasVideo: f.hasVideo,
              hasAudio: f.hasAudio,
              bitrate: f.bitrate,
              size: f.contentLength,
              url: f.url
            }))
        };
      } catch (error) {
        logger.error('YouTube error:', error);
      }
    }
    
    // TikTok
    else if (url.includes('tiktok.com')) {
      try {
        const response = await axios.get(`https://tikwm.com/api/?url=${encodeURIComponent(url)}`);
        if (response.data.code === 0) {
          info = {
            platform: 'tiktok',
            type: 'video',
            title: response.data.data.title,
            duration: response.data.data.duration,
            thumbnail: response.data.data.cover,
            author: response.data.data.author.name,
            views: response.data.data.play_count,
            likes: response.data.data.digg_count,
            comments: response.data.data.comment_count,
            shares: response.data.data.share_count,
            videoUrl: response.data.data.play,
            musicUrl: response.data.data.music
          };
        }
      } catch (error) {
        logger.error('TikTok error:', error);
      }
    }
    
    // Instagram
    else if (url.includes('instagram.com')) {
      try {
        const response = await axios.get(`https://instagram.com/p/${url.split('/p/')[1]?.split('/')[0]}/?__a=1&__d=1`);
        const data = response.data.graphql.shortcode_media;
        info = {
          platform: 'instagram',
          type: data.__typename === 'GraphVideo' ? 'video' : 'image',
          caption: data.edge_media_to_caption.edges[0]?.node.text || '',
          username: data.owner.username,
          likes: data.edge_media_preview_like.count,
          comments: data.edge_media_to_comment.count,
          timestamp: data.taken_at_timestamp,
          mediaUrl: data.video_url || data.display_url,
          thumbnail: data.display_url
        };
      } catch (error) {
        logger.error('Instagram error:', error);
      }
    }
    
    // Twitter/X
    else if (url.includes('twitter.com') || url.includes('x.com')) {
      try {
        const response = await axios.get(`https://api.twitter.com/1.1/statuses/show.json?id=${url.split('/status/')[1]?.split('?')[0]}`, {
          headers: { 'Authorization': `Bearer ${process.env.TWITTER_BEARER_TOKEN}` }
        });
        info = {
          platform: 'twitter',
          type: response.data.extended_entities?.media?.[0]?.type || 'text',
          text: response.data.text,
          author: response.data.user.screen_name,
          likes: response.data.favorite_count,
          retweets: response.data.retweet_count,
          mediaUrl: response.data.extended_entities?.media?.[0]?.media_url_https
        };
      } catch (error) {
        logger.error('Twitter error:', error);
      }
    }
    
    // Facebook
    else if (url.includes('facebook.com') || url.includes('fb.com')) {
      try {
        const response = await axios.get(`https://graph.facebook.com/v18.0/oembed_video?url=${encodeURIComponent(url)}&access_token=${process.env.FACEBOOK_ACCESS_TOKEN}`);
        info = {
          platform: 'facebook',
          type: 'video',
          title: response.data.title,
          author: response.data.author_name,
          provider: response.data.provider_name,
          thumbnail: response.data.thumbnail_url,
          embedUrl: response.data.html
        };
      } catch (error) {
        logger.error('Facebook error:', error);
      }
    }
    
    // Reddit
    else if (url.includes('reddit.com')) {
      try {
        const response = await axios.get(`${url}.json`);
        const data = response.data[0].data.children[0].data;
        info = {
          platform: 'reddit',
          type: data.is_video ? 'video' : 'image',
          title: data.title,
          author: data.author,
          subreddit: data.subreddit,
          score: data.score,
          comments: data.num_comments,
          mediaUrl: data.url,
          thumbnail: data.thumbnail,
          isAdult: data.over_18
        };
      } catch (error) {
        logger.error('Reddit error:', error);
      }
    }
    
    // Twitch
    else if (url.includes('twitch.tv')) {
      try {
        const response = await axios.get(`https://api.twitch.tv/helix/clips?id=${url.split('/clip/')[1]}`, {
          headers: { 'Client-ID': process.env.TWITCH_CLIENT_ID, 'Authorization': `Bearer ${process.env.TWITCH_ACCESS_TOKEN}` }
        });
        const data = response.data.data[0];
        info = {
          platform: 'twitch',
          type: 'clip',
          title: data.title,
          author: data.broadcaster_name,
          views: data.view_count,
          duration: data.duration,
          thumbnail: data.thumbnail_url,
          videoUrl: data.thumbnail_url.replace('-preview-480x272.jpg', '.mp4')
        };
      } catch (error) {
        logger.error('Twitch error:', error);
      }
    }
    
    // Spotify
    else if (url.includes('spotify.com')) {
      try {
        const response = await axios.get(`https://api.spotify.com/v1/tracks/${url.split('/track/')[1]?.split('?')[0]}`, {
          headers: { 'Authorization': `Bearer ${process.env.SPOTIFY_ACCESS_TOKEN}` }
        });
        info = {
          platform: 'spotify',
          type: 'audio',
          title: response.data.name,
          artist: response.data.artists.map(a => a.name).join(', '),
          album: response.data.album.name,
          duration: response.data.duration_ms / 1000,
          previewUrl: response.data.preview_url,
          cover: response.data.album.images[0]?.url
        };
      } catch (error) {
        logger.error('Spotify error:', error);
      }
    }
    
    if (!info) {
      return res.status(404).json({ error: 'Could not fetch media info', url });
    }
    
    res.json({ success: true, info });
  } catch (error) {
    logger.error('Get media info error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Download media
exports.downloadMedia = async (req, res) => {
  try {
    const { url, quality = 'highest', format = 'mp4', audioOnly = 'false' } = req.query;
    
    if (!url) {
      return res.status(400).json({ error: 'URL required' });
    }
    
    let downloadUrl = null;
    let filename = null;
    
    // YouTube download
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      const info = await ytdl.getInfo(url);
      filename = `${info.videoDetails.title.replace(/[^\w\s]/gi, '')}.${format}`;
      
      let options = { quality: quality };
      if (audioOnly === 'true') {
        options = { filter: 'audioonly', quality: 'highestaudio' };
        filename = `${info.videoDetails.title.replace(/[^\w\s]/gi, '')}.mp3`;
      }
      
      const stream = ytdl(url, options);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      res.setHeader('Content-Type', audioOnly === 'true' ? 'audio/mpeg' : 'video/mp4');
      stream.pipe(res);
      return;
    }
    
    // TikTok download
    if (url.includes('tiktok.com')) {
      const response = await axios.get(`https://tikwm.com/api/?url=${encodeURIComponent(url)}`);
      if (response.data.code === 0) {
        downloadUrl = response.data.data.play;
        filename = `tiktok_${Date.now()}.mp4`;
      }
    }
    
    // Instagram download
    if (url.includes('instagram.com')) {
      const response = await axios.get(`https://instagram.com/p/${url.split('/p/')[1]?.split('/')[0]}/?__a=1&__d=1`);
      const data = response.data.graphql.shortcode_media;
      downloadUrl = data.video_url || data.display_url;
      filename = `instagram_${Date.now()}.${data.video_url ? 'mp4' : 'jpg'}`;
    }
    
    // Twitter download
    if (url.includes('twitter.com') || url.includes('x.com')) {
      const response = await axios.get(`https://api.twitter.com/1.1/statuses/show.json?id=${url.split('/status/')[1]?.split('?')[0]}`, {
        headers: { 'Authorization': `Bearer ${process.env.TWITTER_BEARER_TOKEN}` }
      });
      downloadUrl = response.data.extended_entities?.media?.[0]?.video_info?.variants
        ?.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0]?.url;
      filename = `twitter_${Date.now()}.mp4`;
    }
    
    if (downloadUrl) {
      const response = await axios({ method: 'GET', url: downloadUrl, responseType: 'stream' });
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      res.setHeader('Content-Type', 'video/mp4');
      response.data.pipe(res);
      
      // Track download in user stats
      if (req.user) {
        await User.findByIdAndUpdate(req.user._id, { $inc: { 'stats.downloads': 1 } });
      }
    } else {
      res.status(404).json({ error: 'Could not get download URL' });
    }
  } catch (error) {
    logger.error('Download media error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Upload media
exports.uploadMedia = async (req, res) => {
  try {
    if (!req.files || !req.files.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const file = req.files.file;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'audio/mpeg', 'audio/mp3'];
    
    if (!allowedTypes.includes(file.mimetype)) {
      return res.status(400).json({ error: 'File type not allowed' });
    }
    
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (file.size > maxSize) {
      return res.status(400).json({ error: 'File too large' });
    }
    
    const uploadDir = './uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    const filename = `${Date.now()}_${file.name}`;
    const filepath = path.join(uploadDir, filename);
    
    await file.mv(filepath);
    
    // Update user storage
    if (req.user) {
      await User.findByIdAndUpdate(req.user._id, { $inc: { storageUsed: file.size } });
    }
    
    res.json({
      success: true,
      file: {
        name: file.name,
        filename: filename,
        size: file.size,
        mimetype: file.mimetype,
        url: `/uploads/${filename}`,
        path: filepath
      }
    });
  } catch (error) {
    logger.error('Upload media error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Stream media
exports.streamMedia = async (req, res) => {
  try {
    const { id } = req.params;
    const filepath = path.join(__dirname, '../uploads', id);
    
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const stat = fs.statSync(filepath);
    const fileSize = stat.size;
    const range = req.headers.range;
    
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(filepath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
      };
      res.writeHead(200, head);
      fs.createReadStream(filepath).pipe(res);
    }
  } catch (error) {
    logger.error('Stream media error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get thumbnail
exports.getThumbnail = async (req, res) => {
  try {
    const { id } = req.params;
    const filepath = path.join(__dirname, '../uploads', id);
    
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // For images, send the image itself
    if (filepath.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
      res.sendFile(filepath);
    } else {
      // For videos, generate thumbnail using ffmpeg
      const thumbnailPath = filepath.replace(/\.[^/.]+$/, '_thumb.jpg');
      if (!fs.existsSync(thumbnailPath)) {
        await new Promise((resolve, reject) => {
          ffmpeg(filepath)
            .screenshots({
              timestamps: ['00:00:01'],
              filename: path.basename(thumbnailPath),
              folder: path.dirname(thumbnailPath),
              size: '320x180'
            })
            .on('end', resolve)
            .on('error', reject);
        });
      }
      res.sendFile(thumbnailPath);
    }
  } catch (error) {
    logger.error('Get thumbnail error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Convert media format
exports.convertMedia = async (req, res) => {
  try {
    const { url, toFormat = 'mp4' } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL required' });
    }
    
    // Download temp file
    const tempInput = path.join(__dirname, '../temp', `input_${Date.now()}.tmp`);
    const tempOutput = path.join(__dirname, '../temp', `output_${Date.now()}.${toFormat}`);
    
    // Ensure temp directory exists
    const tempDir = path.join(__dirname, '../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Download file
    const response = await axios({ method: 'GET', url, responseType: 'stream' });
    const writer = fs.createWriteStream(tempInput);
    response.data.pipe(writer);
    
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
    
    // Convert using ffmpeg
    await new Promise((resolve, reject) => {
      ffmpeg(tempInput)
        .toFormat(toFormat)
        .on('end', resolve)
        .on('error', reject)
        .save(tempOutput);
    });
    
    // Send converted file
    res.download(tempOutput, `converted.${toFormat}`, () => {
      // Cleanup temp files
      fs.unlinkSync(tempInput);
      fs.unlinkSync(tempOutput);
    });
  } catch (error) {
    logger.error('Convert media error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Compress media
exports.compressMedia = async (req, res) => {
  try {
    const { url, quality = 'medium' } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL required' });
    }
    
    const qualityMap = {
      low: { videoBitrate: '500k', audioBitrate: '64k', size: '640x360' },
      medium: { videoBitrate: '1000k', audioBitrate: '128k', size: '1280x720' },
      high: { videoBitrate: '2500k', audioBitrate: '192k', size: '1920x1080' }
    };
    
    const settings = qualityMap[quality] || qualityMap.medium;
    
    const tempInput = path.join(__dirname, '../temp', `compress_input_${Date.now()}.tmp`);
    const tempOutput = path.join(__dirname, '../temp', `compress_output_${Date.now()}.mp4`);
    
    const tempDir = path.join(__dirname, '../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const response = await axios({ method: 'GET', url, responseType: 'stream' });
    const writer = fs.createWriteStream(tempInput);
    response.data.pipe(writer);
    
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
    
    await new Promise((resolve, reject) => {
      ffmpeg(tempInput)
        .videoCodec('libx264')
        .audioCodec('aac')
        .videoBitrate(settings.videoBitrate)
        .audioBitrate(settings.audioBitrate)
        .size(settings.size)
        .on('end', resolve)
        .on('error', reject)
        .save(tempOutput);
    });
    
    res.download(tempOutput, `compressed_${quality}.mp4`, () => {
      fs.unlinkSync(tempInput);
      fs.unlinkSync(tempOutput);
    });
  } catch (error) {
    logger.error('Compress media error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Crop image
exports.cropImage = async (req, res) => {
  try {
    const { url, x, y, width, height } = req.body;
    
    if (!url || !x || !y || !width || !height) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    const sharp = require('sharp');
    const response = await axios({ method: 'GET', url, responseType: 'arraybuffer' });
    const cropped = await sharp(response.data)
      .extract({ left: parseInt(x), top: parseInt(y), width: parseInt(width), height: parseInt(height) })
      .toBuffer();
    
    res.setHeader('Content-Type', 'image/jpeg');
    res.send(cropped);
  } catch (error) {
    logger.error('Crop image error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Resize image
exports.resizeImage = async (req, res) => {
  try {
    const { url, width, height, maintainAspect = 'true' } = req.body;
    
    if (!url || !width) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    const sharp = require('sharp');
    const response = await axios({ method: 'GET', url, responseType: 'arraybuffer' });
    
    let transformer = sharp(response.data).resize(parseInt(width));
    if (height && maintainAspect === 'false') {
      transformer = transformer.resize(parseInt(width), parseInt(height));
    }
    if (maintainAspect === 'true') {
      transformer = transformer.resize({ width: parseInt(width) });
    }
    
    const resized = await transformer.toBuffer();
    res.setHeader('Content-Type', 'image/jpeg');
    res.send(resized);
  } catch (error) {
    logger.error('Resize image error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Apply filter to image
exports.applyFilter = async (req, res) => {
  try {
    const { url, filter } = req.body;
    
    if (!url || !filter) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    const sharp = require('sharp');
    const response = await axios({ method: 'GET', url, responseType: 'arraybuffer' });
    
    let transformer = sharp(response.data);
    const filters = {
      grayscale: () => transformer.grayscale(),
      sepia: () => transformer.tint({ r: 112, g: 66, b: 20 }),
      blur: () => transformer.blur(5),
      sharpen: () => transformer.sharpen(),
      negative: () => transformer.negate(),
      brighten: () => transformer.linear(1.2, 0),
      darken: () => transformer.linear(0.8, 0)
    };
    
    if (filters[filter]) {
      transformer = filters[filter]();
    }
    
    const filtered = await transformer.toBuffer();
    res.setHeader('Content-Type', 'image/jpeg');
    res.send(filtered);
  } catch (error) {
    logger.error('Apply filter error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get YouTube playlist info
exports.getYouTubePlaylist = async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({ error: 'URL required' });
    }
    
    const playlistId = url.includes('list=') ? url.split('list=')[1].split('&')[0] : url;
    const playlist = await ytpl(playlistId);
    
    res.json({
      success: true,
      playlist: {
        id: playlist.id,
        title: playlist.title,
        description: playlist.description,
        author: playlist.author.name,
        videoCount: playlist.estimatedItemCount || playlist.items.length,
        videos: playlist.items.map(video => ({
          id: video.id,
          title: video.title,
          duration: video.duration,
          thumbnail: video.thumbnails[0]?.url,
          url: video.url
        }))
      }
    });
  } catch (error) {
    logger.error('Get YouTube playlist error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Search YouTube
exports.searchYouTube = async (req, res) => {
  try {
    const { q, limit = 20 } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Search query required' });
    }
    
    const filters = await ytsr.getFilters(q);
    const filter = filters.get('Type')?.get('Video');
    const results = await ytsr(filter.url, { limit: parseInt(limit) });
    
    res.json({
      success: true,
      query: q,
      results: results.items.map(item => ({
        id: item.id,
        title: item.title,
        duration: item.duration,
        views: item.views,
        author: item.author?.name,
        thumbnail: item.bestThumbnail?.url,
        url: item.url
      }))
    });
  } catch (error) {
    logger.error('Search YouTube error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
