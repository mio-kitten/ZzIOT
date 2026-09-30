/**
 * 按钮组件
 * 点击后向指定 MQTT 主题发送预设内容，用于触发远程设备操作
 * 支持纯按钮模式和图片按钮模式
 */
<script setup lang="ts">
import { inject, computed } from 'vue'

const props = defineProps<{
  config: {
    buttonText?: string
    sendContent?: string
    topic?: string
    displayMode?: 'button' | 'image'
    imageData?: string | null
    imageName?: string
  }
}>()

const emit = defineEmits<{
  click: []
}>()

const sendMessage = inject<(topic: string, message: string) => void>('sendMessage')

const isImageMode = computed(() => props.config.displayMode === 'image')
const hasImage = computed(() => !!props.config.imageData)

const handleClick = (event: MouseEvent) => {
  emit('click')
  if (sendMessage && props.config.topic) {
    sendMessage(props.config.topic, String(props.config.sendContent || ''))
  }

  const btn = event.currentTarget as HTMLElement
  const ripple = document.createElement('span')
  ripple.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    width: 0;
    height: 0;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.5);
    transform: translate(-50%, -50%);
    pointer-events: none;
    z-index: 1;
    animation: btn-ripple-wave 2s linear forwards;
  `
  btn.appendChild(ripple)

  ripple.addEventListener('animationend', () => {
    ripple.remove()
  })
}
</script>

<template>
  <button class="widget-button" :class="{ 'image-mode': isImageMode }" @click="handleClick($event)">
    <template v-if="isImageMode">
      <img
        v-if="hasImage"
        :src="config.imageData!"
        :alt="config.imageName || '图片按钮'"
        class="button-image"
      />
      <div v-else class="image-placeholder">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#bbb" stroke-width="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
        <span class="placeholder-text">请在属性中导入图片</span>
      </div>
    </template>
    <template v-else>
      {{ config.buttonText || '按钮' }}
    </template>
  </button>
</template>

<style scoped>
.widget-button {
  width: 100%;
  height: 100%;
  min-height: 40px;
  padding: 8px 16px;
  background: linear-gradient(135deg, #5c9ce6 0%, #4a8fd4 100%);
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.2s, transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

.widget-button.image-mode {
  background: transparent;
  padding: 0;
}

.widget-button:hover {
  opacity: 0.9;
}

.widget-button:active {
  transform: scale(0.93);
}

.button-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.image-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #bbb;
  width: 100%;
  height: 100%;
}

.placeholder-text {
  font-size: 12px;
  color: #aaa;
}
</style>

<style>
@keyframes btn-ripple-wave {
  0% {
    width: 0;
    height: 0;
    opacity: 1;
    box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.4);
  }
  20% {
    width: 30px;
    height: 30px;
    background: rgba(255, 255, 255, 0.1);
    box-shadow: 0 0 0 10px rgba(255, 255, 255, 0.35);
    opacity: 0.9;
  }
  100% {
    width: 300px;
    height: 300px;
    background: transparent;
    box-shadow: 0 0 0 80px rgba(255, 255, 255, 0);
    opacity: 0;
  }
}
</style>