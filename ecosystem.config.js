module.exports = {
  apps: [{
    name: 'page-monitor',
    script: 'server.js',
    cwd: '/opt/page-monitor',
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
    },
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_restarts: 10,
    restart_delay: 5000,
    error_file: '/var/log/page-monitor/error.log',
    out_file: '/var/log/page-monitor/out.log',
    merge_logs: true,
    pid_file: '/var/run/page-monitor.pid',
  }],
};
