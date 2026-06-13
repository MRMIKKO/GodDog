/**
 * 环境变量加载 —— 必须在任何读取 process.env 的模块之前导入。
 * 优先加载 .env（生产/本地通用）。Node 20.6+ / 24 内置 process.loadEnvFile。
 * 若文件不存在或运行时不支持，则静默跳过（依赖真实环境变量，如 PM2/容器注入）。
 */
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
// dist/env.js 或 src/env.ts，两者上溯一层即包根
const envPath = resolve(here, '..', '.env')

if (existsSync(envPath) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(envPath)
}
