// ecosystem.auto.config.js - Auto-scaling PM2 Configuration
module.exports = {
  apps: [{
    name: 'zass-auto-system',
    script: 'index.js',
    instances: 'max',
    exec_mode: 'cluster',
    watch: ['src', 'config', 'public'],
    watch_delay: 1000,
    ignore_watch: ['node_modules', 'logs', 'backups', 'temp'],
    watch_options: {
      followSymlinks: false,
      usePolling: true,
      interval: 1000
    },
    autorestart: true,
    restart_delay: 5000,
    max_restarts: 10,
    min_uptime: 10000,
    max_memory_restart: '2G',
    env: {
      NODE_ENV: 'production',
      AUTO_UPDATE: true,
      SELF_HEAL: true,
      AUTO_SCALE: true
    },
    error_file: 'logs/err.log',
    out_file: 'logs/out.log',
    log_file: 'logs/combined.log',
    time: true,
    kill_timeout: 5000,
    listen_timeout: 10000,
    instance_var: 'INSTANCE_ID'
  }],
  
  deploy: {
    production: {
      user: 'deploy',
      host: '194.146.24.110',
      ref: 'origin/main',
      repo: 'https://github.com/zass/self-updating-system.git',
      path: '/var/www/zass',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.auto.config.js --env production',
      'pre-deploy': 'npm run backup',
      'pre-setup': 'npm install'
    }
  }
}
