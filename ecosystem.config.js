const path = require('path');
const fs = require('fs');

const logDir = path.resolve(process.env.PM2_LOG_DIR || path.join(__dirname, 'logs'));
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

module.exports = {
  apps: [{
    name: 'page-monitor',
    script: 'node_modules/.bin/next',
    args: 'start -H 0.0.0.0 -p 3001',
    cwd: __dirname,
    env: {
      NODE_ENV: 'production',
    },
    out_file: path.join(logDir, 'out.log'),
    error_file: path.join(logDir, 'err.log'),
    log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS',
    log_type: 'json',
    merge_logs: true,
    max_size: '10M',
    retain: 7,
    max_restarts: 10,
    min_uptime: 10000,
    kill_timeout: 10000,
  }],
};
