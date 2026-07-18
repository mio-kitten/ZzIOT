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
    // 单主题多数据模式
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
          text: `${theme.name}: --`,
          color: theme.color
        })
      }
    })
  } else if (props.config.themes) {
    // 多主题模式
    props.config.themes.forEach((theme) => {
      if (theme.topic) {
        const points = props.data[theme.topic]
        if (points && points.length > 0) {
          const latest = points[points.length - 1]
          result.push({
            text: `${theme.name}: ${String(latest.value)}`,
            color: theme.color
          })
        } else {
          result.push({
            text: `${theme.name}: --`,
            color: theme.color
          })
        }
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
  } else {
    result.push({ text: '等待数据...' })
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
  // 最小字号随组件尺寸等比缩小，取两轴较小值的比例
  const minSize = Math.min(Math.max(width * 0.06, 10), Math.max(height * 0.12, 10), 18)
  const maxSize = 72
  
  if (layout.value === 'horizontal' && lineCount > 0) {
    // 横排布局：根据文字长度计算字号，确保完整显示不被截断
    const perItemWidth = (width - (lineCount - 1) * 8) / lineCount
    const maxTextLength = Math.max(...lines.value.map(l => l.text.length))
    // 比例字体下每字符约 0.6em 宽，留 10% 边距
    const maxFontByText = maxTextLength > 0 ? perItemWidth * 0.9 / (maxTextLength * 0.6) : perItemWidth
    const maxFontByHeight = height * 0.5
    return Math.max(minSize, Math.min(Math.min(maxFontByText, maxFontByHeight), maxSize))
  }
  
  // 竖排布局：确保所有行都能完整显示
  const sizeBasedOnWidth = width * 0.14
  const sizeBasedOnHeight = height * 0.38
  // 按行数限制：每行需要 字号×1.4 行高 + 间隙
  const maxByLines = lineCount > 1 ? (height - (lineCount - 1) * 8) / (lineCount * 1.4) : sizeBasedOnHeight
  return Math.max(minSize, Math.min(Math.min(sizeBasedOnWidth, sizeBasedOnHeight, maxByLines), maxSize))
})

const displayFontSize = computed(() => `${fontSizePx.value}px`)
</script>

<template>
  <div ref="containerRef" class="text-widget-container">
    <div 
      class="received-lines"
      :class="{ 'layout-horizontal': layout === 'horizontal' }"
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