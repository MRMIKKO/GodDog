<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { connectSocket } from '@/api/socket'
import { bindSocketEvents } from '@/composables/useSocketEvents'

const router = useRouter()
const auth = useAuthStore()
const nickname = ref('')
const error = ref('')

onMounted(async () => {
  // 已有 guestId 则自动登录进大厅
  const ok = await auth.tryRefresh()
  if (ok) enterLobby()
})

async function start() {
  error.value = ''
  try {
    await auth.loginAsGuest(nickname.value.trim() || undefined)
    enterLobby()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '登录失败'
  }
}

function enterLobby() {
  if (auth.token) {
    connectSocket(auth.token)
    bindSocketEvents()
    router.replace({ name: 'lobby' })
  }
}
</script>

<template>
  <div class="ent">
    <div class="ent_logo">
      <h1 class="ent_logo_title">天九至尊</h1>
      <p class="ent_logo_sub">欢乐豆 · 好友同乐</p>
    </div>

    <div class="ent_form">
      <input
        v-model="nickname"
        class="ent_form_input"
        type="text"
        maxlength="16"
        placeholder="给自己起个昵称（可留空）"
      />
      <button class="btn_gold ent_form_btn" :disabled="auth.loading" @click="start">
        {{ auth.loading ? '进入中…' : '开始游戏' }}
      </button>
      <p v-if="error" class="ent_form_err">{{ error }}</p>
    </div>

    <p class="ent_tip">游客模式 · 进入后可在设置里绑定账号长期保留欢乐豆</p>
  </div>
</template>

<style scoped lang="scss">
.ent {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 48px;
  background: radial-gradient(circle at 50% 30%, var(--color-felt-light), var(--color-felt-deep));

  &_logo {
    text-align: center;

    &_title {
      font-size: 48px;
      letter-spacing: 8px;
      color: var(--color-gold);
      text-shadow: 0 2px 12px rgba(0, 0, 0, 0.5);
    }

    &_sub {
      margin-top: 12px;
      font-size: 15px;
      color: var(--color-text-dim);
      letter-spacing: 2px;
    }
  }

  &_form {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 280px;

    &_input {
      padding: 14px 18px;
      border-radius: 12px;
      background: rgba(0, 0, 0, 0.25);
      border: 1px solid rgba(245, 236, 216, 0.25);
      color: var(--color-text);
      font-size: 15px;
      text-align: center;

      &::placeholder {
        color: var(--color-text-dim);
      }
    }

    &_btn {
      width: 100%;
    }

    &_err {
      color: var(--color-red);
      font-size: 13px;
      text-align: center;
    }
  }

  &_tip {
    position: absolute;
    bottom: 32px;
    font-size: 12px;
    color: var(--color-text-dim);
    padding: 0 24px;
    text-align: center;
  }
}
</style>
