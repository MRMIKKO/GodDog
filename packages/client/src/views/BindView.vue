<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

const username = ref('')
const password = ref('')
const error = ref('')
const success = ref(false)
const busy = ref(false)

async function submit() {
  error.value = ''
  if (username.value.trim().length < 3) {
    error.value = '用户名至少 3 位'
    return
  }
  if (password.value.length < 6) {
    error.value = '密码至少 6 位'
    return
  }
  busy.value = true
  try {
    await auth.bindAccount(username.value.trim(), password.value)
    success.value = true
    setTimeout(() => router.back(), 1200)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '绑定失败'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="bnd">
    <header class="bnd_top">
      <button class="bnd_top_back" @click="router.back()">‹ 返回</button>
      <h2 class="bnd_top_title">绑定账号</h2>
    </header>

    <main class="bnd_main">
      <p class="bnd_main_hint">绑定后可在换设备或清缓存后找回欢乐豆</p>
      <input v-model="username" class="bnd_main_input" placeholder="用户名（字母/数字/下划线）" />
      <input
        v-model="password"
        class="bnd_main_input"
        type="password"
        placeholder="密码（至少 6 位）"
      />
      <button class="btn_gold" :disabled="busy" @click="submit">
        {{ busy ? '提交中…' : '确认绑定' }}
      </button>
      <p v-if="error" class="bnd_main_err">{{ error }}</p>
      <p v-if="success" class="bnd_main_ok">绑定成功 ✓</p>
    </main>
  </div>
</template>

<style scoped lang="scss">
.bnd {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-felt-deep);

  &_top {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 16px 20px;

    &_back {
      background: transparent;
      color: var(--color-text);
      font-size: 16px;
    }

    &_title {
      font-size: 18px;
      color: var(--color-gold);
    }
  }

  &_main {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 24px 32px;

    &_hint {
      font-size: 13px;
      color: var(--color-text-dim);
      text-align: center;
      margin-bottom: 8px;
    }

    &_input {
      padding: 14px 18px;
      border-radius: 12px;
      background: rgba(0, 0, 0, 0.25);
      border: 1px solid rgba(245, 236, 216, 0.25);
      color: var(--color-text);
      font-size: 15px;
    }

    &_err {
      color: var(--color-red);
      font-size: 13px;
      text-align: center;
    }

    &_ok {
      color: var(--color-gold-light);
      font-size: 14px;
      text-align: center;
    }
  }
}
</style>
