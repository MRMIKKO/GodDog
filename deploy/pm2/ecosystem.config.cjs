/**
 * 天九至尊 —— PM2 进程配置（单实例 fork 模式）
 *
 * 用法（在仓库根目录）：
 *   pm2 start deploy/pm2/ecosystem.config.cjs --env production
 *   pm2 save                 # 保存进程列表，配合 pm2 startup 开机自启
 *   pm2 logs goddog-server   # 查看日志
 *   pm2 reload goddog-server # 零停机重载（更新后）
 *
 * 注意：游戏实时状态保存在进程内存，必须单实例（instances: 1, fork）。
 * 切勿改为 cluster 多实例，否则房间状态不共享。
 *
 * 日志轮转：安装 pm2-logrotate
 *   pm2 install pm2-logrotate
 *   pm2 set pm2-logrotate:max_size 10M
 *   pm2 set pm2-logrotate:retain 14
 */
module.exports = {
  apps: [
    {
      name: 'goddog-server',
      cwd: './packages/server',
      script: 'dist/index.js',
      interpreter: 'node',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '400M',
      // 生产环境变量从 packages/server/.env 读取（dotenv 由应用侧加载）
      env_production: {
        NODE_ENV: 'production',
      },
      // PM2 自身日志（应用业务日志由 pino 输出到 stdout，被此处接管）
      out_file: './logs/server-out.log',
      error_file: './logs/server-error.log',
      merge_logs: true,
      time: true,
    },
  ],
}
