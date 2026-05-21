// ecosystem.config.js - PM2 Enterprise Configuration
module.exports = {
  apps: [
    {
      name: 'zass-api',
      script: 'server.js',
      instances: 'max',
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 16232
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 16232
      },
      error_file: 'logs/pm2-api-error.log',
      out_file: 'logs/pm2-api-out.log',
      log_file: 'logs/pm2-api-combined.log',
      time: true,
      kill_timeout: 5000,
      listen_timeout: 10000,
      instances: 4,
      instance_var: 'INSTANCE_ID'
    },
    {
      name: 'zass-worker-queue',
      script: 'workers/queueWorker.js',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production'
      },
      error_file: 'logs/pm2-worker-queue-error.log',
      out_file: 'logs/pm2-worker-queue-out.log'
    },
    {
      name: 'zass-worker-email',
      script: 'workers/emailWorker.js',
      instances: 1,
      env: {
        NODE_ENV: 'production'
      },
      error_file: 'logs/pm2-worker-email-error.log'
    },
    {
      name: 'zass-worker-video',
      script: 'workers/videoWorker.js',
      instances: 2,
      env: {
        NODE_ENV: 'production'
      },
      error_file: 'logs/pm2-worker-video-error.log'
    },
    {
      name: 'zass-worker-scrape',
      script: 'workers/scrapingWorker.js',
      instances: 2,
      env: {
        NODE_ENV: 'production'
      },
      error_file: 'logs/pm2-worker-scrape-error.log'
    },
    {
      name: 'zass-worker-ai',
      script: 'workers/aiWorker.js',
      instances: 1,
      env: {
        NODE_ENV: 'production'
      },
      error_file: 'logs/pm2-worker-ai-error.log'
    },
    {
      name: 'zass-cron',
      script: 'workers/cronJobs.js',
      instances: 1,
      env: {
        NODE_ENV: 'production'
      },
      cron_restart: '0 0 * * *',
      error_file: 'logs/pm2-cron-error.log'
    },
    {
      name: 'zass-backup',
      script: 'scripts/backup.js',
      instances: 1,
      env: {
        NODE_ENV: 'production'
      },
      cron_restart: '0 2 * * *',
      error_file: 'logs/pm2-backup-error.log'
    }
  ],
  deploy: {
    production: {
      user: 'deploy',
      host: '194.146.24.110',
      ref: 'origin/main',
      repo: 'git@github.com:zass/zass-ecosystem.git',
      path: '/var/www/zass-ecosystem',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      env: {
        NODE_ENV: 'production'
      }
    }
  }
};
