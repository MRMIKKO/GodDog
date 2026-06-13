<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useRoomStore } from '@/stores/room'
import { api } from '@/api'

const router = useRouter()
const auth = useAuthStore()
const room = useRoomStore()

const joinCode = ref('')
const error = ref('')
const busy = ref(false)

async function createRoom() {
  error.value = ''
  busy.value = true
  try {
    const res = await api.createRoom()
    await enterRoom(res.roomCode)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '创建房间失败'
  } finally {
    busy.value = false
  }
}

async function joinRoom() {
  error.value = ''
  const code = joinCode.value.trim().toUpperCase()
  if (code.length !== 6) {
    error.value = '请输入 6 位房间码'
    return
  }
  busy.value = true
  try {
    await enterRoom(code)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加入失败'
  } finally {
    busy.value = false
  }
}

async function enterRoom(code: string) {
  const res = await room.join(code)
  if (!res.ok) {
    error.value = res.error ?? '加入房间失败'
    return
  }
  router.push({ name: 'game', params: { roomCode: code } })
}

function goBind() {
  router.push({ name: 'bind' })
}
</script>

<template>
  <div class="lob">
    <header class="lob_top">
      <div class="lob_top_user">
        <span class="lob_top_user_name">{{ auth.user?.nickname }}</span>
        <span class="lob_top_user_beans">🫘 {{ auth.user?.beans ?? 0 }}</span>
      </div>
      <button v-if="!auth.user?.isBound" class="lob_top_bind" @click="goBind">绑定账号</button>
    </header>

    <main class="lob_main">
      <h2 class="lob_main_title">私人房</h2>

      <button class="btn_gold lob_main_create" :disabled="busy" @click="createRoom">
        创建房间
      </button>

      <div class="lob_main_divider"><span>或</span></div>

      <div class="lob_main_join">
        <input
          v-model="joinCode"
          class="lob_main_join_input"
          type="text"
          maxlength="6"
          placeholder="输入房间码"
          @input="joinCode = joinCode.toUpperCase()"
        />
        <button class="btn_ghost" :disabled="busy" @click="joinRoom">加入</button>
      </div>

      <p v-if="error" class="lob_main_err">{{ error }}</p>
    </main>
  </div>
</template>

<style scoped lang="scss">
.lob {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: radial-gradient(circle at 50% 20%, var(--color-felt-light), var(--color-felt-deep));

  &_top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;

    &_user {
      display: flex;
      align-items: center;
      gap: 12px;

      &_name {
        font-size: 16px;
        font-weight: 600;
      }

      &_beans {
        font-size: 14px;
        color: var(--color-gold-light);
        background: rgba(0, 0, 0, 0.25);
        padding: 4px 12px;
        border-radius: 999px;
      }
    }

    &_bind {
      background: transparent;
      color: var(--color-gold-light);
      font-size: 13px;
      text-decoration: underline;
    }
  }

  &_main {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 24px;
    padding: 0 32px;

    &_title {
      font-size: 22px;
      letter-spacing: 4px;
      color: var(--color-gold);
    }

    &_create {
      width: 240px;
    }

    &_divider {
      display: flex;
      align-items: center;
      width: 240px;
      color: var(--color-text-dim);
      font-size: 13px;

      &::before,
      &::after {
        content: '';
        flex: 1;
        height: 1px;
        background: rgba(245, 236, 216, 0.2);
      }

      span {
        padding: 0 12px;
      }
    }

    &_join {
      display: flex;
      gap: 10px;
      width: 240px;

      &_input {
        flex: 1;
        padding: 12px 16px;
        border-radius: 999px;
        background: rgba(0, 0, 0, 0.25);
        border: 1px solid rgba(245, 236, 216, 0.25);
        color: var(--color-text);
        font-size: 18px;
        letter-spacing: 4px;
        text-align: center;

        &::placeholder {
          font-size: 14px;
          letter-spacing: normal;
          color: var(--color-text-dim);
        }
      }
    }

    &_err {
      color: var(--color-red);
      font-size: 13px;
    }
  }
}
</style>
