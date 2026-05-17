module.exports = {
  apps: [{
    name: 'botcake',
    script: 'npm',
    args: 'start',
    cwd: '/home/jm/Desktop/BotCake Page Monitoring',
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
      DATABASE_URL: 'postgresql://jm@/botcake_monitor',
    },
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_restarts: 10,
    restart_delay: 5000,
    error_file: '/home/jm/.pm2/logs/botcake-error.log',
    out_file: '/home/jm/.pm2/logs/botcake-out.log',
    merge_logs: true,
  }],
};
