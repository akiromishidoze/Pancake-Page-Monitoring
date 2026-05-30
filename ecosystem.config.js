module.exports = {
  apps: [{
    name: 'page-monitor',
    script: 'node_modules/.bin/next',
    args: 'start -H 0.0.0.0 -p 3001',
    cwd: __dirname,
    env: {
      NODE_ENV: 'production',
    },
    out_file: '/var/log/page-monitor/out.log',
    error_file: '/var/log/page-monitor/err.log',
    merge_logs: true,
    max_restarts: 10,
    min_uptime: 10000,
    kill_timeout: 10000,
  }],
};
