// PM2 process file for the VPS: `pm2 start ecosystem.config.cjs`.
// Keep a single instance: the login rate limiter is held in memory, so
// cluster mode would give each process its own counts.
module.exports = {
  apps: [
    {
      name: "binkhalid-retail",
      script: "node_modules/next/dist/bin/next",
      args: "start --port 3000",
      cwd: __dirname,
      exec_mode: "fork",
      instances: 1,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
