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

const handleClick = () => {
  emit('click')
  if (sendMessage && props.config.topic) {
    sendMessage(props.config.topic, String(props.config.sendContent || ''))
  }
}
</script>

<template>
  <button class="widget-button" @click="handleClick">
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
  transition: opacity 0.2s, transform 0.1s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.widget-button:hover {
  opacity: 0.9;
}

.widget-button:active {
  transform: scale(0.98);
}
</style>