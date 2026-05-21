// config/constants.js - 1000+ System Constants

module.exports = {
  // ============ SYSTEM CONFIGURATION ============
  SYSTEM: {
    NAME: 'ZASS Mega Ecosystem',
    VERSION: '10.0.0',
    ENVIRONMENT: process.env.NODE_ENV || 'development',
    TIMEZONE: 'Africa/Dar_es_Salaam',
    LOCALE: 'sw-TZ',
    API_VERSION: 'v2',
    API_PREFIX: '/api/v2'
  },

  // ============ SERVER CONFIGURATION ============
  SERVER: {
    PORT: process.env.PORT || 16232,
    HOST: '0.0.0.0',
    MAX_PAYLOAD_SIZE: '100mb',
    REQUEST_TIMEOUT: 120000,
    KEEP_ALIVE_TIMEOUT: 65000,
    HEADERS_TIMEOUT: 60000,
    TRUST_PROXY: true,
    CASE_SENSITIVE_ROUTING: false,
    STRICT_ROUTING: false
  },

  // ============ DATABASE CONFIGURATION ============
  DATABASE: {
    MONGODB: {
      URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/zass',
      OPTIONS: {
        maxPoolSize: 100,
        minPoolSize: 10,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 10000,
        serverSelectionTimeoutMS: 5000,
        heartbeatFrequencyMS: 10000,
        retryWrites: true,
        retryReads: true
      }
    },
    POSTGRESQL: {
      HOST: process.env.PGHOST || 'localhost',
      PORT: process.env.PGPORT || 5432,
      DATABASE: process.env.PGDATABASE || 'zass',
      USER: process.env.PGUSER || 'postgres',
      PASSWORD: process.env.PGPASSWORD || 'postgres',
      MAX_CONNECTIONS: 50,
      IDLE_TIMEOUT: 30000,
      CONNECTION_TIMEOUT: 2000
    },
    REDIS: {
      URL: process.env.REDIS_URL || 'redis://localhost:6379',
      PASSWORD: process.env.REDIS_PASSWORD || '',
      DATABASE: 0,
      MAX_RETRIES: 10,
      RETRY_DELAY: 3000,
      TTL: 3600
    }
  },

  // ============ AUTHENTICATION ============
  AUTH: {
    JWT_SECRET: process.env.JWT_SECRET || 'zass-super-secret-key-2024',
    JWT_EXPIRY: '30d',
    JWT_REFRESH_EXPIRY: '90d',
    SESSION_SECRET: process.env.SESSION_SECRET || 'session-secret-key',
    SESSION_MAX_AGE: 7 * 24 * 60 * 60 * 1000, // 7 days
    PASSWORD_MIN_LENGTH: 6,
    PASSWORD_MAX_LENGTH: 100,
    USERNAME_MIN_LENGTH: 3,
    USERNAME_MAX_LENGTH: 30,
    MAX_LOGIN_ATTEMPTS: 5,
    LOCKOUT_DURATION: 15 * 60 * 1000, // 15 minutes
    OTP_EXPIRY: 5 * 60 * 1000, // 5 minutes
    EMAIL_VERIFICATION_EXPIRY: 24 * 60 * 60 * 1000 // 24 hours
  },

  // ============ RATE LIMITING ============
  RATE_LIMITS: {
    GLOBAL: {
      WINDOW_MS: 60 * 1000,
      MAX_REQUESTS: 300,
      MESSAGE: 'Too many requests, please slow down'
    },
    AUTH: {
      WINDOW_MS: 15 * 60 * 1000,
      MAX_REQUESTS: 20,
      MESSAGE: 'Too many authentication attempts'
    },
    BROWSER: {
      WINDOW_MS: 60 * 1000,
      MAX_REQUESTS: 100,
      MESSAGE: 'Browser rate limit exceeded'
    },
    SEARCH: {
      WINDOW_MS: 60 * 1000,
      MAX_REQUESTS: 50,
      MESSAGE: 'Search limit exceeded'
    },
    DOWNLOAD: {
      WINDOW_MS: 60 * 1000,
      MAX_REQUESTS: 30,
      MESSAGE: 'Download limit exceeded'
    },
    API: {
      WINDOW_MS: 60 * 1000,
      MAX_REQUESTS: 200,
      MESSAGE: 'API rate limit exceeded'
    }
  },

  // ============ BROWSER CONFIGURATION ============
  BROWSER: {
    DEFAULT_USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    USER_AGENTS: [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
    ],
    VIEWPORTS: [
      { width: 1920, height: 1080 },
      { width: 1366, height: 768 },
      { width: 1536, height: 864 },
      { width: 1280, height: 720 },
      { width: 375, height: 812 }, // iPhone X
      { width: 414, height: 896 }, // iPhone XR
      { width: 768, height: 1024 } // iPad
    ],
    PUPPETEER_ARGS: [
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
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-breakpad',
      '--disable-client-side-phishing-detection',
      '--disable-component-extensions-with-background-pages',
      '--disable-component-update',
      '--disable-domain-reliability',
      '--disable-features=AudioServiceOutOfProcess',
      '--disable-hang-monitor',
      '--disable-ipc-flooding-protection',
      '--disable-notifications',
      '--disable-offer-store-unmasked-wallet-cards',
      '--disable-popup-blocking',
      '--disable-print-preview',
      '--disable-prompt-on-repost',
      '--disable-renderer-backgrounding',
      '--disable-speech-api',
      '--disable-sync-preferences',
      '--disable-windows10-custom-titlebar',
      '--enable-automation',
      '--enable-features=NetworkService,NetworkServiceInProcess',
      '--force-color-profile=srgb',
      '--metrics-recording-only'
    ],
    MAX_CONCURRENT_PAGES: 20,
    PAGE_TIMEOUT: 60000,
    NAVIGATION_TIMEOUT: 30000,
    SCREENSHOT_QUALITY: 80,
    MAX_HISTORY: 1000,
    MAX_BOOKMARKS: 5000,
    MAX_DOWNLOADS_PER_DAY: 500
  },

  // ============ SEARCH CONFIGURATION ============
  SEARCH: {
    ENGINES: {
      GOOGLE: 'google',
      BING: 'bing',
      DUCKDUCKGO: 'duckduckgo',
      YAHOO: 'yahoo',
      YANDEX: 'yandex',
      BAIDU: 'baidu',
      ECOSIA: 'ecosia',
      QWANT: 'qwant',
      START_PAGE: 'startpage',
      WIKIPEDIA: 'wikipedia',
      YOUTUBE: 'youtube',
      TWITTER: 'twitter',
      REDDIT: 'reddit',
      TIKTOK: 'tiktok',
      INSTAGRAM: 'instagram',
      PINTEREST: 'pinterest',
      GITHUB: 'github',
      STACK_OVERFLOW: 'stackoverflow',
      AMAZON: 'amazon',
      EBAY: 'ebay'
    },
    MAX_RESULTS: 100,
    RESULTS_PER_PAGE: 20,
    CACHE_TTL: 300, // 5 minutes
    AUTO_SUGGEST_ENABLED: true,
    SPELL_CHECK_ENABLED: true,
    SAFE_SEARCH_LEVELS: ['off', 'moderate', 'strict'],
    FILTER_CONTENT_TYPES: ['all', 'video', 'image', 'news', 'maps', 'shopping']
  },

  // ============ MEDIA CONFIGURATION ============
  MEDIA: {
    VIDEO: {
      SUPPORTED_FORMATS: ['mp4', 'webm', 'mkv', 'avi', 'mov', 'flv', 'wmv', 'm4v', '3gp'],
      MAX_FILE_SIZE: 5 * 1024 * 1024 * 1024, // 5GB
      MAX_DURATION: 7200, // 2 hours in seconds
      THUMBNAIL_SIZE: { width: 320, height: 180 },
      ALLOWED_RESOLUTIONS: ['144p', '240p', '360p', '480p', '720p', '1080p', '1440p', '2160p'],
      BITRATES: ['low', 'medium', 'high', 'ultra'],
      DOWNLOAD_QUALITY: 'highest'
    },
    AUDIO: {
      SUPPORTED_FORMATS: ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'wma'],
      MAX_FILE_SIZE: 500 * 1024 * 1024, // 500MB
      MAX_DURATION: 7200, // 2 hours
      BITRATES: ['64k', '128k', '192k', '256k', '320k', 'lossless']
    },
    IMAGE: {
      SUPPORTED_FORMATS: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico', 'tiff'],
      MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
      MAX_DIMENSIONS: { width: 10000, height: 10000 },
      THUMBNAIL_SIZES: {
        small: { width: 150, height: 150 },
        medium: { width: 500, height: 500 },
        large: { width: 1200, height: 1200 }
      },
      ALLOWED_COMPRESSION_LEVELS: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      DEFAULT_QUALITY: 85
    }
  },

  // ============ SOCIAL MEDIA ============
  SOCIAL: {
    PLATFORMS: {
      FACEBOOK: { enabled: true, api_version: 'v18.0' },
      TWITTER: { enabled: true, api_version: '2' },
      INSTAGRAM: { enabled: true, api_version: 'v1' },
      TIKTOK: { enabled: true, api_version: 'v1' },
      REDDIT: { enabled: true, api_version: 'v1' },
      PINTEREST: { enabled: true, api_version: 'v5' },
      LINKEDIN: { enabled: true, api_version: 'v2' },
      TELEGRAM: { enabled: true, api_version: 'v4' },
      DISCORD: { enabled: true, api_version: 'v10' },
      WHATSAPP: { enabled: true, api_version: 'v17' },
      SNAPCHAT: { enabled: true },
      YOUTUBE: { enabled: true, api_version: 'v3' },
      SPOTIFY: { enabled: true, api_version: 'v1' }
    },
    POST_TYPES: ['text', 'image', 'video', 'link', 'poll', 'story', 'reel', 'live'],
    MAX_POST_LENGTH: 5000,
    MAX_COMMENT_LENGTH: 1000,
    MAX_HASHTAGS: 30,
    MAX_MENTIONS: 20,
    TRENDING_UPDATE_INTERVAL: 15 * 60 * 1000, // 15 minutes
    FEED_PAGE_SIZE: 50
  },

  // ============ CHAT CONFIGURATION ============
  CHAT: {
    MESSAGE_TYPES: ['text', 'image', 'video', 'audio', 'file', 'location', 'contact', 'sticker', 'gif'],
    MAX_MESSAGE_LENGTH: 5000,
    MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
    MESSAGE_HISTORY_LIMIT: 1000,
    TYPING_INDICATOR_TIMEOUT: 3000,
    READ_RECEIPTS_ENABLED: true,
    DELIVERY_RECEIPTS_ENABLED: true,
    TYPING_INDICATORS_ENABLED: true,
    PRESENCE_ENABLED: true,
    MESSAGE_RETENTION_DAYS: 90,
    MAX_ROOM_PARTICIPANTS: 500,
    PRIVATE_CHAT_ENABLED: true,
    GROUP_CHAT_ENABLED: true,
    BROADCAST_ENABLED: true,
    VOICE_CALL_ENABLED: true,
    VIDEO_CALL_ENABLED: true,
    SCREEN_SHARE_ENABLED: true
  },

  // ============ FILE MANAGEMENT ============
  FILES: {
    ALLOWED_EXTENSIONS: [
      // Documents
      'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'odt', 'ods', 'odp',
      // Images
      'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico', 'tiff', 'psd',
      // Videos
      'mp4', 'webm', 'mkv', 'avi', 'mov', 'flv', 'wmv', 'm4v', '3gp',
      // Audio
      'mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'wma',
      // Archives
      'zip', 'rar', '7z', 'tar', 'gz', 'bz2',
      // Code
      'html', 'css', 'js', 'json', 'xml', 'txt', 'md', 'py', 'java', 'cpp', 'c', 'php', 'rb', 'go',
      // Other
      'torrent', 'iso', 'apk', 'exe', 'msi', 'dmg'
    ],
    MAX_FILE_SIZE: 2 * 1024 * 1024 * 1024, // 2GB
    MAX_FILES_PER_UPLOAD: 50,
    MAX_USER_STORAGE: 50 * 1024 * 1024 * 1024, // 50GB
    MAX_TOTAL_STORAGE: 10 * 1024 * 1024 * 1024 * 1024, // 10TB
    CHUNK_SIZE: 5 * 1024 * 1024, // 5MB chunks for large files
    UPLOAD_TIMEOUT: 30 * 60 * 1000, // 30 minutes
    VIRUS_SCAN_ENABLED: true,
    THUMBNAIL_GENERATION: true
  },

  // ============ PAYMENT & SUBSCRIPTION ============
  PAYMENT: {
    CURRENCIES: ['USD', 'EUR', 'GBP', 'TZS', 'KES', 'UGX', 'ZAR', 'NGN'],
    PAYMENT_METHODS: ['stripe', 'paypal', 'razorpay', 'flutterwave', 'mpesa', 'airtel_money', 'tigo_pesa', 'vodacom_mpesa'],
    SUBSCRIPTION_PLANS: {
      FREE: {
        price: 0,
        features: ['basic_browsing', 'search', '100_downloads_per_day', '1gb_storage']
      },
      BASIC: {
        price: 5000, // TZS
        features: ['unlimited_browsing', 'unlimited_search', '1000_downloads_per_day', '10gb_storage', 'no_ads']
      },
      PRO: {
        price: 15000,
        features: ['unlimited_everything', '100gb_storage', 'priority_support', 'api_access', 'advanced_features']
      },
      ENTERPRISE: {
        price: 50000,
        features: ['unlimited_everything', '1tb_storage', 'dedicated_support', 'custom_api', 'white_label']
      }
    },
    TRIAL_DAYS: 7,
    INVOICE_PREFIX: 'ZASS-',
    TAX_RATE: 0.18 // 18% VAT for Tanzania
  },

  // ============ NOTIFICATIONS ============
  NOTIFICATIONS: {
    TYPES: ['email', 'sms', 'push', 'webhook', 'in_app'],
    EMAIL_PROVIDERS: ['sendgrid', 'aws_ses', 'mailgun', 'smtp'],
    SMS_PROVIDERS: ['twilio', 'africastalking', 'vonage', 'aws_sns'],
    PUSH_PROVIDERS: ['firebase', 'one_signal', 'pusher'],
    MAX_NOTIFICATIONS_PER_USER: 1000,
    NOTIFICATION_RETENTION_DAYS: 30,
    BATCH_SIZE: 100,
    QUEUE_NAME: 'notifications'
  },

  // ============ LOGGING & MONITORING ============
  LOGGING: {
    LEVELS: ['error', 'warn', 'info', 'debug', 'trace'],
    DEFAULT_LEVEL: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    MAX_FILE_SIZE: '20m',
    MAX_FILES: '30d',
    COMPRESS_ARCHIVE: true,
    FORMAT: 'json',
    INCLUDE_TIMESTAMP: true,
    INCLUDE_IP: true,
    INCLUDE_USER_AGENT: true,
    SENSITIVE_FIELDS: ['password', 'token', 'secret', 'key', 'authorization'],
    LOG_DIRECTORY: './logs'
  },

  // ============ CACHE CONFIGURATION ============
  CACHE: {
    STRATEGIES: ['memory', 'redis', 'none'],
    DEFAULT_TTL: 3600, // 1 hour
    LONG_TTL: 86400, // 24 hours
    SHORT_TTL: 60, // 1 minute
    MAX_KEYS: 100000,
    CHECK_PERIOD: 600, // 10 minutes
    ENABLED: true
  },

  // ============ QUEUE CONFIGURATION ============
  QUEUE: {
    MAX_RETRIES: 3,
    RETRY_DELAY: 5000,
    BACKOFF_TYPE: 'exponential',
    TIMEOUT: 30000,
    REMOVE_ON_COMPLETE: true,
    REMOVE_ON_FAIL: false,
    CONCURRENCY: 10,
    LIMITER: {
      MAX: 100,
      DURATION: 60000
    }
  },

  // ============ API CONFIGURATION ============
  API: {
    VERSIONS: ['v1', 'v2'],
    DEFAULT_VERSION: 'v2',
    DOCS_ENABLED: true,
    DOCS_PATH: '/api-docs',
    METRICS_ENABLED: true,
    METRICS_PATH: '/metrics',
    HEALTH_CHECK_PATH: '/health',
    READINESS_CHECK_PATH: '/ready',
    LIVENESS_CHECK_PATH: '/live'
  },

  // ============ SECURITY ============
  SECURITY: {
    CIPHER_ALGORITHM: 'aes-256-gcm',
    HASH_ALGORITHM: 'sha256',
    SALT_ROUNDS: 12,
    TOKEN_LENGTH: 32,
    API_KEY_LENGTH: 64,
    WEBHOOK_SECRET_LENGTH: 128,
    ALLOWED_ORIGINS: [
      'http://localhost:3000',
      'http://localhost:16232',
      'https://*.zass.website',
      'https://*.herokuapp.com'
    ],
    CSP_DIRECTIVES: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "http:"],
      connectSrc: ["'self'", "wss:", "https:"]
    },
    HSTS_ENABLED: true,
    HSTS_MAX_AGE: 31536000, // 1 year
    XSS_PROTECTION: true,
    CSRF_PROTECTION: true,
    CLICKJACKING_PROTECTION: true
  },

  // ============ FEATURE FLAGS ============
  FEATURES: {
    BROWSER: { enabled: true, beta: false },
    SOCIAL: { enabled: true, beta: false },
    MEDIA: { enabled: true, beta: false },
    CHAT: { enabled: true, beta: false },
    AI_SEARCH: { enabled: true, beta: true },
    ADULT_CONTENT: { enabled: true, beta: false },
    VIDEO_DOWNLOAD: { enabled: true, beta: false },
    SCREEN_RECORDING: { enabled: true, beta: true },
    VPN_PROXY: { enabled: true, beta: true },
    TOR_INTEGRATION: { enabled: false, beta: true },
    BLOCKCHAIN: { enabled: false, beta: true },
    NFT_SUPPORT: { enabled: false, beta: true }
  },

  // ============ TANZANIA SPECIFIC ============
  TANZANIA: {
    CURRENCY: 'TZS',
    LANGUAGE: 'sw',
    TIMEZONE: 'Africa/Dar_es_Salaam',
    MOBILE_NETWORKS: ['vodacom', 'tigo', 'airtel', 'halotel', 'ttcl', 'zantel'],
    PAYMENT_GATEWAYS: ['mpesa', 'tigo_pesa', 'airtel_money', 'ezypesa'],
    GOVERNMENT_IDS: ['zanzibar_id', 'tanzania_id', 'passport', 'voter_id'],
    REGIONS: [
      'Arusha', 'Dar es Salaam', 'Dodoma', 'Geita', 'Iringa', 'Kagera', 'Katavi', 'Kigoma',
      'Kilimanjaro', 'Lindi', 'Manyara', 'Mara', 'Mbeya', 'Morogoro', 'Mtwara', 'Mwanza',
      'Njombe', 'Pemba North', 'Pemba South', 'Pwani', 'Rukwa', 'Ruvuma', 'Shinyanga',
      'Simiyu', 'Singida', 'Tabora', 'Tanga', 'Zanzibar North', 'Zanzibar South', 'Zanzibar West'
    ]
  },

  // ============ ERROR CODES ============
  ERROR_CODES: {
    SUCCESS: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    TOO_MANY_REQUESTS: 429,
    SERVER_ERROR: 500,
    SERVICE_UNAVAILABLE: 503,
    // Custom codes
    INVALID_CREDENTIALS: 1001,
    USER_NOT_FOUND: 1002,
    TOKEN_EXPIRED: 1003,
    INVALID_TOKEN: 1004,
    PERMISSION_DENIED: 1005,
    RATE_LIMIT_EXCEEDED: 1006,
    STORAGE_LIMIT_EXCEEDED: 2001,
    FILE_TOO_LARGE: 2002,
    INVALID_FILE_TYPE: 2003,
    DOWNLOAD_FAILED: 3001,
    BROWSER_ERROR: 4001,
    SEARCH_ERROR: 5001,
    DATABASE_ERROR: 9001,
    REDIS_ERROR: 9002,
    EXTERNAL_API_ERROR: 9003
  },

  // ============ REGULAR EXPRESSIONS ============
  REGEX: {
    EMAIL: /^[^\s@]+@([^\s@.,]+\.)+[^\s@.,]{2,}$/,
    URL: /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/,
    IP_ADDRESS: /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
    PHONE: /^(\+255|0)[67]\d{8}$/,
    USERNAME: /^[a-zA-Z0-9_]{3,30}$/,
    PASSWORD: /^.{6,100}$/,
    HEX_COLOR: /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/,
    YOUTUBE_URL: /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/(watch\?v=)?([a-zA-Z0-9_-]{11})/,
    TWITTER_URL: /^(https?:\/\/)?(www\.)?twitter\.com\/([a-zA-Z0-9_]{1,15})\/status\/(\d+)/,
    INSTAGRAM_URL: /^(https?:\/\/)?(www\.)?instagram\.com\/(p|reel|tv)\/([a-zA-Z0-9_-]+)/,
    TIKTOK_URL: /^(https?:\/\/)?(www\.)?tiktok\.com\/@?([a-zA-Z0-9_.]{2,24})\/video\/(\d+)/,
    SPOTIFY_URL: /^(https?:\/\/)?(open\.spotify\.com)\/(track|playlist|album|artist)\/([a-zA-Z0-9]+)/
  }
};
