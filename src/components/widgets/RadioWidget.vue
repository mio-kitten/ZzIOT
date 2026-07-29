<template>
  <div class="radio-widget" :class="{ vertical: isVertical }">
    <div class="radio-options" :class="{ vertical: isVertical }">
      <button
        v-for="(option, index) in localOptions"
        :key="index"
        class="radio-option"
        :class="{ active: selectedIndex === index }"
        @click="selectOption(index, $event)"
      >
        {{ option.label }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, inject, watch, computed, onMounted } from 'vue'
import type { DataPoint } from '@/types'

const props = defineProps<{
  config: {
    topic?: string
    options?: { label: string; value: string }[]
    title?: string
    hideBg?: boolean
    width?: number
    height?: number
    orientation?: 'horizontal' | 'vertical'
  }
  data?: Record<string, DataPoint[]>
}>()

const emit = defineEmits<{
  change: [value: string]
  resize: [width: number, height: number]
}>()

const sendMessage = inject<(topic: string, message: string) => void>('sendMessage')

const localOptions = computed(() => {
  return props.config.options || [
    { label: '选项1', value: '1' },
    { label: '选项2', value: '2' }
  ]
})

const selectedIndex = ref(0)

const BUTTON_WIDTH = 80
const BUTTON_HEIGHT = 36
const GAP = 8
const PADDING = 10
const HEADER = 40
const WC_PADDING = 16

const isVertical = computed(() => {
  return props.config.orientation === 'vertical'
})

const calculateSize = () => {
  const optionCount = localOptions.value.length
  
  if (isVertical.value) {
    const width = BUTTON_WIDTH + PADDING * 2 + WC_PADDING
    const height = optionCount * BUTTON_HEIGHT + (optionCount - 1) * GAP + PADDING * 2 + HEADER + WC_PADDING
    return { width: Math.max(width, 116), height: Math.max(height, 120) }
  } else {
    const width = optionCount * BUTTON_WIDTH + (optionCount - 1) * GAP + PADDING * 2 + WC_PADDING
    const height = BUTTON_HEIGHT + PADDING * 2 + HEADER + WC_PADDING
    return { width: Math.max(width, 194), height: Math.max(height, 112) }
  }
}

watch(() => localOptions.value, () => {
  const size = calculateSize()
  emit('resize', size.width, size.height)
}, { deep: true })

watch(() => props.config.orientation, () => {
  const size = calculateSize()
  emit('resize', size.width, size.height)
})

onMounted(() => {
  const size = calculateSize()
  emit('resize', size.width, size.height)
})

watch(() => props.data, (newData) => {
  if (newData && props.config.topic) {
    const topicData = newData[props.config.topic]
    if (topicData && topicData.length > 0) {
      const lastValue = String(topicData[topicData.length - 1].value).trim()
      const index = localOptions.value.findIndex(opt => opt.value === lastValue)
      if (index !== -1) {
        selectedIndex.value = index
      }
    }
  }
}, { deep: true, immediate: true })

const selectOption = (index: number, event: MouseEvent) => {
  selectedIndex.value = index
  const option = localOptions.value[index]
  emit('change', option.value)
  
  if (sendMessage && props.config.topic) {
    sendMessage(props.config.topic, option.value)
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
    animation: ripple-wave 2s linear forwards;
  `
  btn.appendChild(ripple)

  ripple.addEventListener('animationend', () => {
    ripple.remove()
  })
}
</script>

<style scoped>
.radio-widget {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 10px;
  box-sizing: border-box;
}

.radio-options {
  display: flex;
  gap: 8px;
  justify-content: center;
}

.radio-options.vertical {
  flex-direction: column;
  align-items: center;
}

.radio-option {
  padding: 8px 16px;
  border: 2px solid #ccc;
  border-radius: 6px;
  background: #fff;
  color: #666;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease, transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
  outline: none;
  min-width: 80px;
  text-align: center;
  position: relative;
  overflow: hidden;
}

.radio-option:active {
  transform: scale(0.93);
}

.radio-option:hover {
  border-color: #1e88e5;
  color: #1e88e5;
}

.radio-option.active {
  border-color: #1e88e5;
  background: #1e88e5;
  color: #fff;
}
</style>

<style>
@keyframes ripple-wave {
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