<script setup lang="ts">
import { ref, inject, watch } from 'vue'
import type { DataPoint } from '@/types'

const props = defineProps<{
  config: {
    topic?: string
    onDisplay?: string
    offDisplay?: string
    onSend?: string
    offSend?: string
  }
  data?: Map<string, DataPoint[]>
}>()

const emit = defineEmits<{
  change: [value: boolean]
}>()

const sendMessage = inject<(topic: string, message: string) => void>('sendMessage')
const isOn = ref(false)

// 监听数据变化更新开关状态
watch(() => props.data, (newData) => {
  if (newData && props.config.topic) {
    const topicData = newData.get(props.config.topic)
    if (topicData && topicData.length > 0) {
      const lastValue = topicData[topicData.length - 1].value
      const strValue = String(lastValue).toLowerCase().trim()
      
      const configuredOnValue = props.config.onSend ? String(props.config.onSend).toLowerCase().trim() : null
      const configuredOffValue = props.config.offSend ? String(props.config.offSend).toLowerCase().trim() : null
      
      if (configuredOnValue && configuredOffValue) {
        if (strValue === configuredOnValue) {
          isOn.value = true
        } else if (strValue === configuredOffValue) {
          isOn.value = false
        }
      } else if (configuredOnValue) {
        isOn.value = strValue === configuredOnValue
      } else if (configuredOffValue) {
        isOn.value = strValue !== configuredOffValue
      } else {
        isOn.value = strValue === 'true' || strValue === '1' || strValue === 'on' || strValue === '开'
      }
    }
  }
}, { deep: true, immediate: true })

const toggle = () => {
  isOn.value = !isOn.value
  emit('change', isOn.value)
  
  if (sendMessage && props.config.topic) {
    const content = isOn.value 
      ? String(props.config.onSend || 'on') 
      : String(props.config.offSend || 'off')
    sendMessage(props.config.topic, content)
  }
}
</script>

<template>
  <div class="widget-switch-container">
    <div class="switch-track" :class="{ active: isOn }" @click="toggle">
      <div class="switch-thumb"></div>
    </div>
    <span class="switch-label">{{ isOn ? (config.onDisplay || '开') : (config.offDisplay || '关') }}</span>
  </div>
</template>

<style scoped>
.widget-switch-container {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 100%;
  padding: 8px;
}

.switch-track {
  height: 55%;
  min-height: 22px;
  max-height: 40px;
  aspect-ratio: 2.2;
  background: #ddd;
  border-radius: 999px;
  position: relative;
  cursor: pointer;
  flex-shrink: 0;
  transition: background-color 0.3s;
}

.switch-track.active {
  background: linear-gradient(135deg, #5c9ce6 0%, #4a8fd4 100%);
}

.switch-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  height: calc(100% - 4px);
  aspect-ratio: 1;
  background: white;
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  transform: translateX(0);
  transition: left 0.3s, transform 0.3s;
}

.switch-track.active .switch-thumb {
  left: calc(100% - 2px);
  transform: translateX(-100%);
}

.switch-label {
  font-size: 14px;
  color: #333;
  font-weight: 500;
  flex-shrink: 0;
}
</style>