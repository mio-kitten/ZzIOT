/**
 * 滑动条组件
 * 拖动滑块选择数值，实时向指定 MQTT 主题发送当前值
 */
<script setup lang="ts">
import { ref, computed, watch, inject } from 'vue'

const props = defineProps<{
  config: {
    minValue?: number
    maxValue?: number
    step?: number
    topic?: string
  }
  data?: Map<string, unknown>
}>()

const emit = defineEmits<{
  change: [value: number]
}>()

const sendMessage = inject<(topic: string, message: string) => void>('sendMessage')

/** 响应式获取步长/最值，跟随侧边栏配置变化 */
const minValue = computed(() => Number(props.config.minValue) || 0)
const maxValue = computed(() => {
  const v = Number(props.config.maxValue)
  return (v && v > minValue.value) ? v : (minValue.value + 100)
})
const step = computed(() => Number(props.config.step) || 1)

const value = ref((minValue.value + maxValue.value) / 2)
const isDragging = ref(false)

const handleInput = (event: Event) => {
  const target = event.target as HTMLInputElement
  value.value = parseFloat(target.value)
}

const handleChange = () => {
  emit('change', value.value)
  if (sendMessage && props.config.topic) {
    sendMessage(props.config.topic, value.value.toString())
  }
}

const handleMouseDown = () => {
  isDragging.value = true
}

const handleMouseUp = () => {
  isDragging.value = false
  handleChange()
}

/** 从侧边栏快速设定值 */
watch(() => (props.config as any).jumpValue, (val) => {
  if (val !== undefined && val !== null) {
    const num = Number(val)
    if (!isNaN(num)) {
      value.value = Math.max(minValue.value, Math.min(maxValue.value, num))
    }
  }
})

/** 清空数据时滑块归中（通过配置 _reset 字段通知） */
watch(() => (props.config as any)._reset, () => {
  value.value = (minValue.value + maxValue.value) / 2
})
</script>

<template>
  <div class="widget-slider-container">
    <div class="slider-value">{{ value.toFixed(1) }}</div>
    <input
      type="range"
      :min="minValue"
      :max="maxValue"
      :step="step"
      :value="value"
      class="slider-input"
      @input="handleInput"
      @change="handleChange"
      @mousedown.stop="handleMouseDown"
      @mouseup.stop="handleMouseUp"
      @mouseleave.stop="handleMouseUp"
    />
    <div class="slider-labels">
      <span>{{ minValue }}</span>
      <span>{{ maxValue }}</span>
    </div>
  </div>
</template>

<style scoped>
.widget-slider-container {
  height: 100%;
  padding: 12px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
}

.slider-value {
  font-size: 24px;
  font-weight: 600;
  color: #5c9ce6;
  text-align: center;
}

.slider-input {
  width: 100%;
  height: 6px;
  -webkit-appearance: none;
  appearance: none;
  background: linear-gradient(90deg, #5c9ce6 0%, #ddd 0%);
  border-radius: 3px;
  cursor: pointer;
}

.slider-input::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 20px;
  height: 20px;
  background: white;
  border-radius: 50%;
  border: 2px solid #5c9ce6;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s;
}

.slider-input::-webkit-slider-thumb:hover {
  transform: scale(1.1);
}

.slider-input::-moz-range-thumb {
  width: 20px;
  height: 20px;
  background: white;
  border-radius: 50%;
  border: 2px solid #5c9ce6;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #999;
}
</style>