/**
 * 迷你面积图组件
 * 基于 Chart.js，显示最新数据的迷你面积图，右上角显示当前数值
 */
<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { Chart, registerables } from 'chart.js'
import type { DataPoint } from '@/types'

Chart.register(...registerables)

const props = defineProps<{
  config: {
    id: string
    title: string
    width?: number
    height?: number
    topic?: string
    labelText?: string
    unit?: string
    color?: string
    maxDataPoints?: number
  }
  data: DataPoint[]
}>()

const chartCanvas = ref<HTMLCanvasElement | null>(null)
let chartInstance: Chart | null = null
let resizeObserver: ResizeObserver | null = null
let animTimeout: ReturnType<typeof setTimeout> | null = null

const hasEverReceivedData = ref(false)

const isValidNumber = (v: any): v is number => typeof v === 'number' && !isNaN(v)

const displayData = computed(() => {
  if (props.data.length > 0) {
    return props.data.filter(d => isValidNumber(d.value)).slice(-(props.config.maxDataPoints || 10))
  }
  if (!hasEverReceivedData.value) {
    const now = Date.now()
    return [
      { timestamp: now - 9000, value: 5, themeId: '' },
      { timestamp: now - 8000, value: 8, themeId: '' },
      { timestamp: now - 7000, value: 6, themeId: '' },
      { timestamp: now - 6000, value: 10, themeId: '' },
      { timestamp: now - 5000, value: 7, themeId: '' },
      { timestamp: now - 4000, value: 12, themeId: '' },
      { timestamp: now - 3000, value: 9, themeId: '' },
      { timestamp: now - 2000, value: 14, themeId: '' },
      { timestamp: now - 1000, value: 11, themeId: '' },
      { timestamp: now, value: 15, themeId: '' },
    ]
  }
  return []
})

const currentValue = computed(() => {
  if (displayData.value.length > 0) {
    return displayData.value[displayData.value.length - 1].value
  }
  return hasEverReceivedData.value ? '' : '--'
})

watch(() => props.data, (newData) => {
  if (newData && newData.length > 0) {
    hasEverReceivedData.value = true
  }
}, { deep: true, immediate: true })

const createChart = () => {
  if (!chartCanvas.value) return
  
  if (chartInstance) {
    chartInstance.destroy()
  }
  
  const ctx = chartCanvas.value.getContext('2d')
  if (!ctx) return
  
  const lineColor = props.config.color || '#5c9ce6'
  const data = displayData.value
  
  const containerHeight = chartCanvas.value.parentElement?.clientHeight || chartCanvas.value.clientHeight || 200
  const gradient = ctx.createLinearGradient(0, 0, 0, containerHeight)
  gradient.addColorStop(0, lineColor + '40')
  gradient.addColorStop(1, lineColor + '05')
  
  const datasets = [{
    label: props.config.labelText || '数据',
    data: data.map(v => v.value),
    borderColor: lineColor,
    backgroundColor: gradient,
    pointBackgroundColor: lineColor,
    pointBorderColor: lineColor,
    borderWidth: 2,
    fill: 'origin',
    tension: 0.3,
    pointRadius: 4,
    pointHoverRadius: 6
  }]
  
  const labels = data.length > 0
    ? data.map(d => {
        const date = new Date(d.timestamp)
        return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      })
    : []
  
  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 400,
        easing: 'easeOutQuart'
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          titleFont: { size: 12 },
          bodyFont: { size: 14 },
          padding: 10,
          cornerRadius: 6
        }
      },
      scales: {
        x: {
          grid: { color: '#f0f0f0' },
          ticks: { maxTicksLimit: 8, font: { size: 11 } }
        },
        y: {
          beginAtZero: true,
          grid: { color: '#f0f0f0' },
          ticks: {
            callback: (value) => `${value} ${props.config.unit || ''}`,
            font: { size: 11 }
          }
        }
      },
      interaction: {
        intersect: false,
        mode: 'index'
      }
    }
  })
}

const updateChart = () => {
  if (!chartInstance) {
    createChart()
    return
  }
  
  const data = displayData.value
  
  // 取消上次未完成的移位动画
  if (animTimeout) {
    clearTimeout(animTimeout)
    animTimeout = null
  }
  
  // 始终更新颜色，即使数据未变化
  const lineColor = props.config.color || '#5c9ce6'
  const ds = chartInstance.data.datasets[0]
  if (ds) {
    ds.borderColor = lineColor
    ;(ds as any).pointBackgroundColor = lineColor
    ;(ds as any).pointBorderColor = lineColor
    if (chartCanvas.value) {
      const ctx = chartCanvas.value.getContext('2d')
      if (ctx) {
        const containerHeight = chartCanvas.value.parentElement?.clientHeight || chartCanvas.value.clientHeight || 200
        const gradient = ctx.createLinearGradient(0, 0, 0, containerHeight)
        gradient.addColorStop(0, lineColor + '40')
        gradient.addColorStop(1, lineColor + '05')
        ds.backgroundColor = gradient
      }
    }
    const meta = chartInstance.getDatasetMeta(0)
    if (meta && meta.data) {
      meta.data.forEach((point: any) => {
        point.options.backgroundColor = lineColor
        point.options.borderColor = lineColor
      })
    }
  }
  
  if (data.length === 0) {
    // 无新数据时保留历史数据，仅更新颜色
    chartInstance.update('none')
    return
  }
  
  const labels = data.map(d => {
    const date = new Date(d.timestamp)
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  })
  
  const newValues = data.map(v => v.value)
  if (!ds) return
  
  // 数据未变化则跳过重绘
  const curData = ds.data as number[]
  if (curData.length === newValues.length && curData.every((v, i) => v === newValues[i])) {
    chartInstance.update('none')
    return
  }
  
  // 更新 labels
  chartInstance.data.labels!.length = 0
  chartInstance.data.labels!.push(...labels)
  
  // 统一使用简单动画：直接赋值，新元素自然动画进入
  for (let i = 0; i < newValues.length; i++) {
    ds.data[i] = newValues[i]
  }
  ds.data.length = newValues.length
  chartInstance.update()
}

const handleResize = () => {
  if (chartInstance) {
    chartInstance.resize()
    // 更新渐变以适配新尺寸
    if (chartCanvas.value) {
      const ctx = chartCanvas.value.getContext('2d')
      if (ctx) {
        const lineColor = props.config.color || '#5c9ce6'
        const containerHeight = chartCanvas.value.parentElement?.clientHeight || chartCanvas.value.clientHeight || 200
        const gradient = ctx.createLinearGradient(0, 0, 0, containerHeight)
        gradient.addColorStop(0, lineColor + '40')
        gradient.addColorStop(1, lineColor + '05')
        const ds = chartInstance.data.datasets[0]
        ds.backgroundColor = gradient
        ds.borderColor = lineColor
        ;(ds as any).pointBackgroundColor = lineColor
        ;(ds as any).pointBorderColor = lineColor
        chartInstance.update('none')
      }
    }
  }
}

watch(() => props.data, () => {
  updateChart()
}, { deep: true, immediate: true })

watch(() => props.config.color, () => {
  updateChart()
})

onMounted(() => {
  nextTick(() => {
    createChart()
    
    if (chartCanvas.value) {
      resizeObserver = new ResizeObserver(handleResize)
      resizeObserver.observe(chartCanvas.value.parentElement || chartCanvas.value)
    }
  })
})

onUnmounted(() => {
  if (animTimeout) clearTimeout(animTimeout)
  if (chartInstance) {
    chartInstance.destroy()
  }
  if (resizeObserver) {
    resizeObserver.disconnect()
  }
})
</script>

<template>
  <div class="mini-area-container">
    <div class="mini-area-header">
      <span class="label-text">{{ config.labelText || '数据' }}</span>
      <span v-if="!hasEverReceivedData && displayData.length > 0" class="demo-label">此为演示状态并非已有数据</span>
      <div class="current-value">
        <span class="value">{{ typeof currentValue === 'number' ? currentValue.toFixed(1) : currentValue }}</span>
        <span class="unit">{{ config.unit || '' }}</span>
      </div>
    </div>
    <div class="chart-wrapper">
      <canvas ref="chartCanvas"></canvas>
    </div>
  </div>
</template>

<style scoped>
.mini-area-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 8px;
}

.mini-area-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.label-text {
  font-size: 13px;
  color: #666;
  font-weight: 500;
}

.demo-label {
  font-size: 11px;
  color: #e67e22;
  font-style: italic;
  white-space: nowrap;
}

.current-value {
  display: flex;
  align-items: baseline;
  gap: 2px;
}

.current-value .value {
  font-size: 24px;
  font-weight: 700;
  color: #333;
}

.current-value .unit {
  font-size: 12px;
  color: #999;
}

.chart-wrapper {
  flex: 1;
  min-height: 60px;
}
</style>