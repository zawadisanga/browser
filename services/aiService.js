// services/aiService.js - AI-Powered Chatbot & Content Generation
const { OpenAI } = require('openai');
const { getRedisManager } = require('../config/redis');
const winston = require('winston');
const natural = require('natural');
const { TfIdf } = natural;

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/ai.log' })
  ]
});

const redisManager = getRedisManager();

class AIService {
  constructor() {
    this.openai = null;
    this.tfidf = new TfIdf();
    this.intents = new Map();
    this.responses = new Map();
    
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    
    this.initIntents();
  }

  initIntents() {
    // Define intents and responses
    this.intents.set('greeting', ['hello', 'hi', 'hey', 'greetings', 'good morning', 'good afternoon', 'good evening']);
    this.intents.set('help', ['help', 'support', 'assist', 'guide', 'tutorial']);
    this.intents.set('browser', ['browser', 'surf', 'web', 'internet', 'website', 'url']);
    this.intents.set('download', ['download', 'save', 'get video', 'mp3', 'mp4', 'youtube']);
    this.intents.set('search', ['search', 'find', 'lookup', 'google', 'bing']);
    this.intents.set('social', ['social', 'post', 'share', 'like', 'comment', 'friend']);
    this.intents.set('chat', ['chat', 'message', 'talk', 'conversation']);
    this.intents.set('media', ['media', 'video', 'audio', 'music', 'image', 'photo']);
    this.intents.set('account', ['account', 'profile', 'settings', 'password', 'login']);
    this.intents.set('pricing', ['price', 'cost', 'premium', 'subscription', 'plan']);
    this.intents.set('thank', ['thank', 'thanks', 'appreciate']);
    this.intents.set('bye', ['bye', 'goodbye', 'see you', 'exit', 'quit']);
    
    this.responses.set('greeting', [
      'Hello! How can I help you today?',
      'Hi there! Welcome to ZASS Ecosystem!',
      'Greetings! What can I do for you?',
      'Hey! Need any assistance with browsing or downloads?'
    ]);
    
    this.responses.set('help', [
      'I can help you with:\n• Web browsing\n• Downloading videos/audio\n• Searching the web\n• Social media features\n• Chat with friends\n• And much more!\n\nWhat would you like to do?',
      'Here are some things I can help with:\n1. Browse websites\n2. Download YouTube/TikTok videos\n3. Search Google/Bing\n4. Post on social media\n5. Chat with friends\n\nJust tell me what you need!'
    ]);
    
    this.responses.set('browser', [
      'You can browse any website using our built-in browser. Just go to the Browser tab and enter any URL!',
      'Our browser supports unlimited browsing with no restrictions. You can access any website from anywhere!'
    ]);
    
    this.responses.set('download', [
      'You can download videos from YouTube, TikTok, Instagram, Facebook, Twitter, and many more platforms. Just paste the URL in the media section!',
      'To download a video:\n1. Go to Media section\n2. Paste the video URL\n3. Choose quality\n4. Click Download!\n\nSupported: YouTube, TikTok, Instagram, Facebook, Twitter, Reddit, Twitch, Spotify'
    ]);
    
    this.responses.set('search', [
      'You can search the web using our multi-engine search. Try Google, Bing, DuckDuckGo, YouTube, Twitter, Reddit, and more!',
      'Just type what you want to search in the search bar and choose your preferred search engine!'
    ]);
    
    this.responses.set('social', [
      'Share your thoughts, photos, and videos with friends! Create posts, like and comment on content, follow interesting people!',
      'Our social features include:\n• Create posts with images/videos\n• Like and comment\n• Follow users\n• Trending feed\n• Saved posts'
    ]);
    
    this.responses.set('chat', [
      'Chat with friends in real-time! Create group chats, share files, make voice and video calls!',
      'Go to the Chat section to start messaging with your friends!'
    ]);
    
    this.responses.set('media', [
      'Watch videos, listen to music, view images - all in one place! You can also download media from various platforms.',
      'Our media section supports YouTube, TikTok, Instagram, Spotify, and more!'
    ]);
    
    this.responses.set('account', [
      'Manage your account settings in the Dashboard. You can update your profile, change password, and adjust preferences!',
      'Go to Dashboard > Settings to customize your experience!'
    ]);
    
    this.responses.set('pricing', [
      'ZASS offers free and premium plans. Free plan includes basic browsing and limited downloads. Premium plans start at Tsh 5,000/month for unlimited features!',
      'Check our Pricing page for detailed plan comparisons!'
    ]);
    
    this.responses.set('thank', [
      "You're welcome! Happy to help! 😊",
      "Anytime! Let me know if you need anything else!",
      "My pleasure! Enjoy using ZASS!"
    ]);
    
    this.responses.set('bye', [
      "Goodbye! Come back anytime! 👋",
      "See you later! Have a great day!",
      "Bye! Feel free to return if you need more help!"
    ]);
    
    this.responses.set('default', [
      "I'm not sure I understand. Could you please rephrase?",
      "I didn't quite get that. Try asking about browsing, downloads, or social features!",
      "Hmm, I'm not sure. Type 'help' to see what I can do!"
    ]);
  }

  // Detect intent from message
  detectIntent(message) {
    const lowerMsg = message.toLowerCase();
    
    for (let [intent, keywords] of this.intents) {
      for (let keyword of keywords) {
        if (lowerMsg.includes(keyword)) {
          return intent;
        }
      }
    }
    
    return 'default';
  }

  // Get response for intent
  getResponse(intent) {
    const responses = this.responses.get(intent) || this.responses.get('default');
    return responses[Math.floor(Math.random() * responses.length)];
  }

  // Chat with AI (OpenAI or rule-based fallback)
  async chat(message, context = {}) {
    try {
      // Check cache first
      const cacheKey = `ai:chat:${message.toLowerCase().trim()}`;
      const cached = await redisManager.get(cacheKey);
      if (cached) {
        return cached;
      }
      
      let response = null;
      
      // Use OpenAI if available
      if (this.openai) {
        try {
          const completion = await this.openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
              {
                role: "system",
                content: `You are ZASS Assistant, a helpful AI for the ZASS Ecosystem platform. 
                         You help users with web browsing, downloading videos, searching the web, 
                         social media features, and general platform assistance. 
                         Be friendly, concise, and helpful. Current context: ${JSON.stringify(context)}`
              },
              {
                role: "user",
                content: message
              }
            ],
            max_tokens: 300,
            temperature: 0.7
          });
          
          response = completion.choices[0].message.content;
        } catch (openaiError) {
          logger.error('OpenAI error:', openaiError);
          // Fallback to rule-based
          const intent = this.detectIntent(message);
          response = this.getResponse(intent);
        }
      } else {
        // Rule-based response
        const intent = this.detectIntent(message);
        response = this.getResponse(intent);
      }
      
      // Cache response
      await redisManager.set(cacheKey, response, 3600); // Cache for 1 hour
      
      return response;
    } catch (error) {
      logger.error('AI chat error:', error);
      return "I'm having trouble right now. Please try again later or type 'help' for assistance.";
    }
  }

  // Generate content recommendations
  async generateRecommendations(userId, userInterests = []) {
    try {
      if (this.openai) {
        const completion = await this.openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content: "Generate 5 personalized content recommendations based on user interests. Return as JSON array."
            },
            {
              role: "user",
              content: `User interests: ${userInterests.join(', ')}`
            }
          ],
          max_tokens: 500
        });
        
        try {
          return JSON.parse(completion.choices[0].message.content);
        } catch {
          return this.getDefaultRecommendations();
        }
      }
      
      return this.getDefaultRecommendations();
    } catch (error) {
      logger.error('Generate recommendations error:', error);
      return this.getDefaultRecommendations();
    }
  }

  getDefaultRecommendations() {
    return [
      { title: "Trending Videos", url: "/media", type: "video" },
      { title: "Popular Posts", url: "/social", type: "social" },
      { title: "Top Searches", url: "/search", type: "search" },
      { title: "Recommended for You", url: "/dashboard", type: "personalized" }
    ];
  }

  // Analyze sentiment of text
  analyzeSentiment(text) {
    const analyzer = new natural.SentimentAnalyzer('English', natural.PorterStemmer, 'afinn');
    const score = analyzer.getSentiment(text.split(' '));
    
    if (score > 0.2) return 'positive';
    if (score < -0.2) return 'negative';
    return 'neutral';
  }

  // Extract keywords from text
  extractKeywords(text, limit = 5) {
    this.tfidf.addDocument(text);
    const keywords = [];
    
    this.tfidf.listTerms(0, limit).forEach(term => {
      keywords.push(term.term);
    });
    
    this.tfidf.documents = [];
    return keywords;
  }

  // Summarize long text
  async summarizeText(text, maxLength = 200) {
    try {
      if (this.openai) {
        const completion = await this.openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content: `Summarize the following text in ${maxLength} characters or less.`
            },
            {
              role: "user",
              content: text
            }
          ],
          max_tokens: 150
        });
        
        return completion.choices[0].message.content;
      }
      
      // Simple summarization: first 200 chars
      return text.substring(0, maxLength) + (text.length > maxLength ? '...' : '');
    } catch (error) {
      logger.error('Summarize text error:', error);
      return text.substring(0, maxLength);
    }
  }
}

module.exports = new AIService();
