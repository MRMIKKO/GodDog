# 天九至尊 —— 部署指南（Vultr + Nginx + PM2 + Let's Encrypt）

面向单台 Vultr 服务器的生产部署。架构：Nginx 托管前端静态文件并反代后端，Fastify + Socket.io 单实例（fork）运行，SQLite 持久化，PM2 守护进程。

> 实时游戏状态保存在进程内存，**必须单实例**，切勿用 PM2 cluster 多实例。

---

## 0. 架构概览

```
浏览器 ──HTTPS──> Nginx(443)
                    ├── /              静态文件  /var/www/goddog/client
                    ├── /api/   ─────> 127.0.0.1:3000  (Fastify REST，剥离 /api 前缀)
                    └── /socket.io/ ─> 127.0.0.1:3000  (Socket.io，WebSocket 升级)
```

---

## 1. 服务器初始化（首次，一次性）

以 Ubuntu 22.04/24.04 为例，使用具备 sudo 的非 root 用户。

```bash
# 系统更新
sudo apt update && sudo apt upgrade -y

# 安装 Node 24（NodeSource）
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs

# 启用 pnpm（corepack）
sudo corepack enable
corepack prepare pnpm@latest --activate

# 全局安装 PM2
sudo npm install -g pm2

# 安装 Nginx 与 certbot
sudo apt install -y nginx certbot python3-certbot-nginx rsync git

# 防火墙放行 HTTP/HTTPS/SSH
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

确认版本：

```bash
node -v   # v24.x
pnpm -v
pm2 -v
nginx -v
```

---

## 2. 拉取代码

```bash
sudo mkdir -p /var/www/goddog
sudo chown -R "$USER":"$USER" /var/www/goddog
cd /var/www/goddog
git clone <你的仓库地址> repo
cd repo
```

后续路径假设仓库在 `/var/www/goddog/repo`，前端发布目录为 `/var/www/goddog/client`。

---

## 3. 配置生产环境变量

```bash
cp deploy/server.env.example packages/server/.env
# 生成强随机密钥
openssl rand -base64 48   # 填入 JWT_ACCESS_SECRET
openssl rand -base64 48   # 填入 JWT_REFRESH_SECRET
openssl rand -base64 32   # 填入 ADMIN_API_KEY
nano packages/server/.env
```

关键项：
- `NODE_ENV=production`
- `HOST=127.0.0.1`、`PORT=3000`（仅本机，Nginx 反代）
- `DATABASE_URL="file:./prod.db"`
- `CORS_ORIGINS=https://skydog.skynet.fan`
- 三个密钥务必替换为强随机值

---

## 4. 配置 Nginx

先用 **HTTP** 起服务以便 certbot 申请证书：

```bash
sudo cp deploy/nginx/skydog.skynet.fan.conf /etc/nginx/sites-available/
# 首次申请证书前，临时注释掉 443 server 块中的 ssl_certificate 两行（证书尚不存在）
sudo ln -s /etc/nginx/sites-available/skydog.skynet.fan.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo mkdir -p /var/www/certbot
sudo nginx -t && sudo systemctl reload nginx
```

申请并自动配置 SSL：

```bash
sudo certbot --nginx -d skydog.skynet.fan
```

certbot 成功后会自动填入证书路径并重载 Nginx。证书自动续期由 certbot 的 systemd timer 处理，可验证：

```bash
sudo certbot renew --dry-run
```

> 前提：域名 `skydog.skynet.fan` 的 A 记录已解析到本服务器公网 IP。

---

## 5. 首次部署

```bash
cd /var/www/goddog/repo
# 配置 PM2 开机自启（按提示执行它打印的那条 sudo 命令）
pm2 startup

# 执行部署脚本（构建 + 迁移 + 发布 + 启动）
WEB_ROOT=/var/www/goddog/client ./deploy/deploy.sh

# 安装 PM2 日志轮转
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 14
```

访问 `https://skydog.skynet.fan` 验证。

---

## 6. 后续更新

代码更新后，重复执行部署脚本即可（零停机重载后端、刷新前端静态文件）：

```bash
cd /var/www/goddog/repo
WEB_ROOT=/var/www/goddog/client ./deploy/deploy.sh
```

---

## 7. 运维常用命令

```bash
pm2 status                  # 进程状态
pm2 logs goddog-server      # 实时日志
pm2 reload goddog-server    # 零停机重载
pm2 monit                   # 资源监控

sudo nginx -t               # 校验 Nginx 配置
sudo systemctl reload nginx # 重载 Nginx

# 给玩家充值欢乐豆（管理接口，需 ADMIN_API_KEY）
curl -X POST https://skydog.skynet.fan/api/admin/recharge \
  -H "X-Admin-Key: <你的 ADMIN_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"userId":"<用户ID>","amount":1000,"memo":"充值"}'
```

---

## 8. 数据备份

SQLite 数据库为单文件，定期备份即可：

```bash
# 手动备份
cp /var/www/goddog/repo/packages/server/prod.db ~/backups/prod-$(date +%F).db

# 建议加入 crontab 每日备份
# 0 4 * * * cp /var/www/goddog/repo/packages/server/prod.db ~/backups/prod-$(date +\%F).db
```

---

## 9. 安全清单

- [x] HTTPS 强制（HTTP 301 跳转）+ HSTS
- [x] Helmet 安全响应头（后端）+ Nginx 补充头
- [x] CORS 白名单仅允许正式域名
- [x] JWT 强随机密钥，access 15m / refresh 7d（httpOnly cookie）
- [x] 全局速率限制（@fastify/rate-limit）+ 出牌频率限速（每 3s 最多 8 次/连接）
- [x] 服务端权威校验：所有出牌经游戏引擎二次验证，杜绝客户端作弊
- [x] 管理接口由 ADMIN_API_KEY 保护
- [ ] 防火墙仅放行 22/80/443
- [ ] 定期 `apt upgrade` 与依赖安全更新
