/**
 * 单行文本组件
 * 显示单个 MQTT 主题接收到的消息，支持多主题/单主题显示模式
 */
<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import type { DataPoint, ThemeConfig } from '@/types'

const props = defineProps<{
  config: {
    title?: string
    width?: number
    height?: number
    textColor?: string
    topic?: string
    displayMode?: 'multiTopic' | 'singleTopic'
    themes?: ThemeConfig[]
  }
  data: Record<string, DataPoint[]>
  widgetType?: string
}>()

const containerRef = ref<HTMLElement | null>(null)
const containerSize = ref({ width: 280, height: 80 })

const updateSize = () => {
  if (containerRef.value) {
    const rect = containerRef.value.getBoundingClientRect()
    containerSize.value = {
      width: rect.width,
      height: rect.height
    }
  }
}

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  updateSize()
  if (containerRef.value) {
    resizeObserver = new ResizeObserver(updateSize)
    resizeObserver.observe(containerRef.value)
  }
})

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
  }
})

const textColor = computed(() => {
  return String(props.config.textColor || '#333333')
})

const lines = computed(() => {
  const result: { text: string; color?: string }[] = []
  
  if (props.config.displayMode === 'singleTopic' && props.config.themes) {
    props.config.themes.forEach((theme, index) => {
      const lineId = `line-${index + 1}`
      const points = props.data[lineId]
      if (points && points.length > 0) {
        const latest = points[points.length - 1]
        result.push({
          text: `${theme.name}: ${String(latest.value)}`,
          color: theme.color
        })
      } else {
        result.push({
          text: `${theme.name}: 等待数据`,
          color: theme.color
        })
      }
    })
  } else if (props.config.themes) {
    props.config.themes.forEach((theme) => {
      const points = theme.topic ? props.data[theme.topic] : undefined
      if (points && points.length > 0) {
        const latest = points[points.length - 1]
        result.push({
          text: `${theme.name}: ${String(latest.value)}`,
          color: theme.color
        })
      } else {
        result.push({
          text: `${theme.name}: 等待数据`,
          color: theme.color
        })
      }
    })
  } else if (props.config.topic) {
    const points = props.data[props.config.topic]
    if (points && points.length > 0) {
      const latest = points[points.length - 1]
      result.push({ text: String(latest.value) })
    } else {
      result.push({ text: '等待数据...' })
    }
  }
  
  return result
})

// 布局方向：高度不足以竖排显示所有行时自动切换为横排
const layout = computed(() => {
  const lineCount = lines.value.length
  if (lineCount <= 1) return 'vertical'
  // 粗略估计每行至少需要 36px 才够清晰显示
  return containerSize.value.height < lineCount * 36 ? 'horizontal' : 'vertical'
})

const fontSizePx = computed(() => {
  const { width, height } = containerSize.value
  const lineCount = lines.value.length
  const isTextarea = props.widgetType === 'textarea'
  const minSize = Math.min(Math.max(width * 0.06, 10), Math.max(height * 0.12, 10), 18)
  const maxSize = 72
  
  if (layout.value === 'horizontal' && lineCount > 0) {
    if (isTextarea) {
      const sizeBasedOnHeight = height * 0.15
      const sizeBasedOnWidth = width <= 375 ? width * 0.07 : Infinity
      const maxByLines = (height - (lineCount - 1) * 8) / (lineCount * 1.4)
      const minFont = width <= 375 ? 18 : 28
      return Math.max(minFont, Math.min(Math.min(sizeBasedOnWidth, sizeBasedOnHeight, maxByLines), maxSize))
    }
    const maxFontByHeight = height * 0.5
    const perItemWidth = (width - (lineCount - 1) * 8) / lineCount
    const maxTextLength = Math.max(...lines.value.map(l => l.text.length))
    const maxFontByText = maxTextLength > 0 ? perItemWidth * 0.9 / (maxTextLength * 0.6) : perItemWidth
    return Math.max(minSize, Math.min(Math.min(maxFontByText, maxFontByHeight), maxSize))
  }
  
  const sizeBasedOnHeight = height * (isTextarea ? 0.15 : 0.36)
  const sizeBasedOnWidth = isTextarea ? (width <= 375 ? width * 0.07 : Infinity) : width * 0.16
  const maxByLines = lineCount > 1 ? (height - (lineCount - 1) * 8) / (lineCount * 1.4) : sizeBasedOnHeight
  const minFont = isTextarea && width <= 375 ? 18 : 28
  return Math.max(minFont, Math.min(Math.min(sizeBasedOnWidth, sizeBasedOnHeight, maxByLines), maxSize))
})

const displayFontSize = computed(() => `${fontSizePx.value}px`)

const gapPx = computed(() => {
  if (props.widgetType !== 'textarea') return 8
  const { width, height } = containerSize.value
  const lineCount = lines.value.length
  if (lineCount <= 1) return 8
  const rate = width <= 375 ? 0.012 : 0.06
  const heightBonus = width <= 375 ? height * 0.08 : 0
  return Math.max(8, Math.min(width * rate + heightBonus, 40))
})
</script>

<template>
  <div ref="containerRef" class="text-widget-container">
    <div 
      class="received-lines"
      :class="{ 'layout-horizontal': layout === 'horizontal' }"
      :style="{ gap: gapPx + 'px' }"
    >
      <div 
        v-for="(line, index) in lines" 
        :key="index" 
        class="line-item"
        :style="{ color: line.color || textColor, fontSize: displayFontSize }"
      >
        {{ line.text }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.text-widget-container {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
}

.received-lines {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  text-align: center;
}

.received-lines.layout-horizontal {
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.received-lines.layout-horizontal .line-item {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.line-item {
  font-weight: 500;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.4;
}
</style>