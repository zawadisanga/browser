// models/Browser.js - Browser Session Schema
const mongoose = require('mongoose');

const browserSessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  sessionId: {
    type: String,
    required: true,
    unique: true
  },
  
  // Tabs
  tabs: [{
    id: { type: Number, required: true },
    url: { type: String, default: 'https://www.google.com' },
    title: { type: String, default: 'New Tab' },
    favicon: String,
    history: [String],
    historyIndex: { type: Number, default: 0 },
    scrollPosition: { x: Number, y: Number },
    zoom: { type: Number, default: 100 },
    createdAt: { type: Date, default: Date.now },
    lastAccessed: { type: Date, default: Date.now }
  }],
  activeTabId: { type: Number, default: 0 },
  
  // Bookmarks
  bookmarks: [{
    id: { type: String, required: true },
    url: { type: String, required: true },
    title: String,
    description: String,
    tags: [String],
    folder: { type: String, default: 'root' },
    favicon: String,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  }],
  
  // Folders for bookmarks
  bookmarkFolders: [{
    id: { type: String, required: true },
    name: { type: String, required: true },
    parent: { type: String, default: 'root' },
    createdAt: { type: Date, default: Date.now }
  }],
  
  // History
  history: [{
    id: { type: String, required: true },
    url: { type: String, required: true },
    title: String,
    favicon: String,
    visitCount: { type: Number, default: 1 },
    lastVisit: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now }
  }],
  
  // Downloads
  downloads: [{
    id: { type: String, required: true },
    url: { type: String, required: true },
    filename: String,
    fileSize: Number,
    mimeType: String,
    status: {
      type: String,
      enum: ['pending', 'downloading', 'completed', 'failed', 'cancelled'],
      default: 'pending'
    },
    progress: { type: Number, default: 0 },
    speed: Number,
    startedAt: Date,
    completedAt: Date,
    error: String,
    localPath: String
  }],
  
  // Cookies
  cookies: [{
    domain: String,
    name: String,
    value: String,
    path: String,
    expires: Date,
    httpOnly: Boolean,
    secure: Boolean,
    sameSite: String
  }],
  
  // Local Storage
  localStorage: [{
    key: String,
    value: String,
    domain: String
  }],
  
  // Session Storage
  sessionStorage: [{
    key: String,
    value: String,
    domain: String
  }],
  
  // Settings
  settings: {
    defaultSearchEngine: {
      type: String,
      enum: ['google', 'bing', 'duckduckgo', 'yahoo', 'yandex', 'baidu'],
      default: 'google'
    },
    homepage: { type: String, default: 'https://www.google.com' },
    blockAds: { type: Boolean, default: false },
    blockTrackers: { type: Boolean, default: false },
    blockPopups: { type: Boolean, default: true },
    saveHistory: { type: Boolean, default: true },
    savePasswords: { type: Boolean, default: false },
    autoFillForms: { type: Boolean, default: true },
    darkMode: { type: Boolean, default: false },
    fontSize: { type: Number, default: 16 },
    zoomLevel: { type: Number, default: 100 },
    language: { type: String, default: 'en' },
    downloadsFolder: { type: String, default: 'downloads' }
  },
  
  // Extensions
  extensions: [{
    id: String,
    name: String,
    version: String,
    enabled: { type: Boolean, default: true },
    permissions: [String],
    installedAt: { type: Date, default: Date.now }
  }],
  
  // Device info
  deviceInfo: {
    name: String,
    platform: String,
    browser: String,
    version: String,
    screenWidth: Number,
    screenHeight: Number,
    language: String,
    timezone: String
  },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: () => new Date(+new Date() + 30*24*60*60*1000) }
}, {
  timestamps: true
});

// Indexes
browserSessionSchema.index({ userId: 1 });
browserSessionSchema.index({ sessionId: 1 });
browserSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Methods
browserSessionSchema.methods.addTab = function(url = 'https://www.google.com') {
  const newId = this.tabs.length;
  this.tabs.push({
    id: newId,
    url: url,
    title: 'New Tab',
    history: [url],
    historyIndex: 0,
    createdAt: new Date()
  });
  this.activeTabId = newId;
  return newId;
};

browserSessionSchema.methods.closeTab = function(tabId) {
  const index = this.tabs.findIndex(t => t.id === tabId);
  if (index === -1) return null;
  
  this.tabs.splice(index, 1);
  
  if (this.tabs.length === 0) {
    this.addTab();
  }
  
  if (this.activeTabId === tabId) {
    this.activeTabId = this.tabs[0]?.id || 0;
  }
  
  return this.tabs;
};

browserSessionSchema.methods.addBookmark = function(url, title, folder = 'root') {
  const bookmark = {
    id: require('crypto').randomBytes(16).toString('hex'),
    url,
    title: title || url,
    folder,
    createdAt: new Date()
  };
  this.bookmarks.push(bookmark);
  return bookmark;
};

browserSessionSchema.methods.removeBookmark = function(bookmarkId) {
  const index = this.bookmarks.findIndex(b => b.id === bookmarkId);
  if (index !== -1) {
    this.bookmarks.splice(index, 1);
    return true;
  }
  return false;
};

browserSessionSchema.methods.addToHistory = function(url, title) {
  const existing = this.history.find(h => h.url === url);
  if (existing) {
    existing.visitCount += 1;
    existing.lastVisit = new Date();
  } else {
    this.history.unshift({
      id: require('crypto').randomBytes(16).toString('hex'),
      url,
      title: title || url,
      visitCount: 1,
      createdAt: new Date()
    });
  }
  
  // Keep only last 1000 history items
  if (this.history.length > 1000) {
    this.history = this.history.slice(0, 1000);
  }
};

browserSessionSchema.methods.clearHistory = function() {
  this.history = [];
};

browserSessionSchema.methods.clearCache = function() {
  this.cookies = [];
  this.localStorage = [];
  this.sessionStorage = [];
};

const BrowserSession = mongoose.model('BrowserSession', browserSessionSchema);

module.exports = BrowserSession;
