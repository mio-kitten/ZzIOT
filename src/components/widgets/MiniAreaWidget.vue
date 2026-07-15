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

const displayData = computed(() => {
  return props.data.slice(-(props.config.maxDataPoints || 10))
})

const currentValue = computed(() => {
  if (displayData.value.length > 0) {
    return displayData.value[displayData.value.length - 1].value
  }
  return '--'
})

const createChart = () => {
  if (!chartCanvas.value) return
  
  if (chartInstance) {
    chartInstance.destroy()
  }
  
  const ctx = chartCanvas.value.getContext('2d')
  if (!ctx) return
  
  const lineColor = props.config.color || '#5c9ce6'
  const data = displayData.value
  
  const gradient = ctx.createLinearGradient(0, 0, 0, chartCanvas.value.height)
  gradient.addColorStop(0, lineColor + '40')
  gradient.addColorStop(1, lineColor + '05')
  
  const datasets = [{
    label: props.config.labelText || '数据',
    data: data.map(v => v.value),
    borderColor: lineColor,
    backgroundColor: gradient,
    borderWidth: 2,
    fill: true,
    tension: 0.4,
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
  
  if (data.length === 0) {
    // 清空图表数据
    chartInstance.data.labels!.length = 0
    chartInstance.data.datasets[0].data.length = 0
    chartInstance.update('none')
    return
  }
  
  const labels = data.map(d => {
    const date = new Date(d.timestamp)
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  })
  
  const newValues = data.map(v => v.value)
  const ds = chartInstance.data.datasets[0]
  if (!ds) return
  
  // 更新 labels
  chartInstance.data.labels!.length = 0
  chartInstance.data.labels!.push(...labels)
  
  const maxLen = props.config.maxDataPoints || 10
  const isFull = data.length >= maxLen
  
  if (isFull) {
    // 满容量：两步更新（闪现 + 移位）
    // Step 1: 新数据先闪现到最后一列（无动画）
    ds.data[newValues.length - 1] = newValues[newValues.length - 1]
    chartInstance.update('none')
    
    // Step 2: 旧数据集体往左移（带动画）
    animTimeout = setTimeout(() => {
      if (!chartInstance) return
      const ds2 = chartInstance.data.datasets[0]
      if (!ds2) return
      for (let i = 0; i < newValues.length - 1; i++) {
        ds2.data[i] = newValues[i]
      }
      chartInstance.update()
      animTimeout = null
    }, 80)
  } else {
    // 未满容量：保持动画效果，同时避免线段扭曲
    if (newValues.length === 1) {
      // 第一个数据点，直接动画即可，没有前一个点可扭曲
      ds.data[0] = newValues[0]
      chartInstance.update()
    } else {
      // Step 1: 所有数据到位，但最后一个数据点设为前一个值（过渡态）
      for (let i = 0; i < newValues.length; i++) {
        ds.data[i] = newValues[i]
      }
      const prevValue = newValues[newValues.length - 2]
      ds.data[newValues.length - 1] = prevValue
      chartInstance.update('none')
      
      // Step 2: 最后一个数据点从过渡态动画到正确值，线段自然衔接
      animTimeout = setTimeout(() => {
        if (!chartInstance) return
        const ds2 = chartInstance.data.datasets[0]
        if (!ds2) return
        for (let i = 0; i < newValues.length; i++) {
          ds2.data[i] = newValues[i]
        }
        chartInstance.update()
        animTimeout = null
      }, 80)
    }
  }
}

const handleResize = () => {
  if (chartInstance) {
    chartInstance.resize()
  }
}

watch(() => props.data, () => {
  updateChart()
}, { deep: true, immediate: true })

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