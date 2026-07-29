/**
 * 按钮组件
 * 点击后向指定 MQTT 主题发送预设内容，用于触发远程设备操作
 */
<script setup lang="ts">
import { inject } from 'vue'

const props = defineProps<{
  config: {
    buttonText?: string
    sendContent?: string
    topic?: string
  }
}>()

const emit = defineEmits<{
  click: []
}>()

const sendMessage = inject<(topic: string, message: string) => void>('sendMessage')

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
  <button class="widget-button" @click="handleClick($event)">
    {{ config.buttonText || '按钮' }}
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

.widget-button:hover {
  opacity: 0.9;
}

.widget-button:active {
  transform: scale(0.93);
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