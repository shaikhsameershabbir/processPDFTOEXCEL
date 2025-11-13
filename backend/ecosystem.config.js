module.exports = {
  apps: [
    {
      name: 'csv-import-backend',
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      env_file: '.env',
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time: true,
      max_memory_restart: '1G',
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s'
    }
  ]
};
