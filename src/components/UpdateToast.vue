<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  type?: 'update' | 'error'
  versionType?: string
  newVersion?: string
  currentVersion?: string
}>()

const emit = defineEmits<{
  (e: 'click'): void
  (e: 'close'): void
}>()

const visible = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null

function handleClick() {
  if (timer) clearTimeout(timer)
  visible.value = false
  setTimeout(() => {
    emit('click')
  }, 500)
}

onMounted(() => {
  setTimeout(() => {
    visible.value = true
    timer = setTimeout(() => {
      visible.value = false
      setTimeout(() => {
        emit('close')
      }, 500)
    }, 5000)
  }, 50)
})

onUnmounted(() => {
  if (timer) clearTimeout(timer)
})
</script>

<template>
  <div class="update-toast" :class="{ visible, error: type === 'error' }" @click="handleClick">
    <template v-if="type === 'error'">
      <p class="toast-error-text">检测更新失败啦╰（‵□′）╯</p>
    </template>
    <template v-else>
      <p class="toast-title">[{{ versionType }}] 有新版本啦q(≧▽≦q)</p>
      <div class="toast-info">
        <p class="toast-new-version">NEW：{{ newVersion }}</p>
        <p class="toast-current">当前：{{ currentVersion }}</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.update-toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 99990;
  background: linear-gradient(160deg, #080e1a 0%, #162238 30%, #1b3448 50%, #16263a 70%, #0b1625 100%);
  border: 1px solid rgba(0, 210, 255, 0.22);
  border-radius: 14px;
  padding: 20px 28px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.55), 0 0 28px rgba(0, 200, 255, 0.12);
  cursor: pointer;
  min-width: 320px;
  opacity: 0;
  transform: translateX(100px);
  filter: blur(8px);
  transition: opacity 0.4s ease, transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1), filter 0.4s ease, box-shadow 0.3s ease;
  user-select: none;
  white-space: nowrap;
}

.update-toast.visible {
  opacity: 1;
  transform: translateX(0);
  filter: blur(0);
}

.update-toast:hover {
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.65), 0 0 32px rgba(0, 200, 255, 0.18);
  transform: translateY(-2px);
}

.update-toast:active {
  transform: scale(0.96);
  transition: transform 0.1s ease;
}

.toast-title {
  margin: 0 0 10px;
  font-size: 15px;
  font-weight: 700;
  text-align: center;
  color: #00c8ff;
}

.toast-info {
  text-align: left;
}

.toast-new-version {
  margin: 0 0 4px;
  font-size: 22px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 1px;
}

.toast-current {
  margin: 0;
  font-size: 13px;
  color: #8899aa;
}

.update-toast.error {
  cursor: pointer;
  min-width: 280px;
  padding: 16px 24px;
}

.toast-error-text {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #e74c3c;
  text-align: center;
}
</style>