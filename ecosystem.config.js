module.exports = {
  apps: [{
    name: 'page-monitor',
    script: 'node_modules/.bin/next',
    args: 'start -H 0.0.0.0 -p 3001',
    cwd: __dirname,
    env: {
      NODE_ENV: 'production',
    },
    out_file: './logs/out.log',
    error_file: './logs/err.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS',
    merge_logs: true,
    max_restarts: 10,
    min_uptime: 10000,
    kill_timeout: 10000,
  }],
};
