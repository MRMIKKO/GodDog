#!/usr/bin/env bash
# 天九至尊 —— 一键构建 + 部署脚本（在仓库根目录执行）
#
# 适用：单台 Vultr 服务器，Node 24 + pnpm + PM2 + Nginx 已安装。
# 首次部署前请先完成 deploy/README.md 中的「服务器初始化」步骤。
#
# 用法：
#   ./deploy/deploy.sh            # 拉取最新代码 -> 构建 -> 迁移 -> 发布 -> 重载
#   SKIP_PULL=1 ./deploy/deploy.sh  # 跳过 git pull（本地已是最新）

set -euo pipefail

# ---- 可配置项 ----
WEB_ROOT="${WEB_ROOT:-/var/www/goddog/client}"   # 前端静态文件发布目录（需与 Nginx root 一致）
PM2_APP="${PM2_APP:-goddog-server}"
PM2_ECOSYSTEM="deploy/pm2/ecosystem.config.cjs"

# ---- 定位仓库根 ----
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
echo "==> 仓库根目录：$ROOT"

# ---- 拉取代码 ----
if [[ "${SKIP_PULL:-0}" != "1" ]]; then
  echo "==> 拉取最新代码"
  git pull --ff-only
fi

# ---- 校验生产 .env 存在 ----
if [[ ! -f packages/server/.env ]]; then
  echo "!! 缺少 packages/server/.env，请先：cp deploy/server.env.example packages/server/.env 并填写真实值" >&2
  exit 1
fi

# ---- 安装依赖（含 workspace） ----
echo "==> 安装依赖"
pnpm install --frozen-lockfile

# ---- 构建：shared -> server -> client（顺序不可乱，server/client 依赖 shared 产物） ----
echo "==> 构建 shared"
pnpm --filter @goddog/shared build

echo "==> 生成 Prisma Client 并应用迁移"
pnpm --filter @goddog/server prisma:generate
pnpm --filter @goddog/server prisma:deploy

echo "==> 构建 server"
pnpm --filter @goddog/server build

echo "==> 构建 client"
pnpm --filter @goddog/client build

# ---- 发布前端静态文件 ----
echo "==> 发布前端到 $WEB_ROOT"
sudo mkdir -p "$WEB_ROOT"
sudo rsync -a --delete packages/client/dist/ "$WEB_ROOT/"

# ---- 启动 / 重载后端 ----
mkdir -p logs
if pm2 describe "$PM2_APP" >/dev/null 2>&1; then
  echo "==> 重载后端（零停机）"
  pm2 reload "$PM2_APP" --update-env
else
  echo "==> 首次启动后端"
  pm2 start "$PM2_ECOSYSTEM" --env production
  pm2 save
fi

echo "==> 部署完成。可用 pm2 logs $PM2_APP 查看日志。"
