/**
 * 柱状图组件
 * 基于 Chart.js，显示数据对比柱状图，支持配置最大数据点数和Y轴单位
 */
<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { Chart, registerables } from 'chart.js'
import type { DataPoint } from '@/types'

Chart.register(...registerables)

const props = defineProps<{
  config: any
  data: DataPoint[]
}>()

const chartCanvas = ref<HTMLCanvasElement | null>(null)
let chartInstance: Chart | null = null
let resizeObserver: ResizeObserver | null = null
let animTimeout: ReturnType<typeof setTimeout> | null = null

const hasEverReceivedData = ref(false)

const isValidNumber = (v: any): v is number => typeof v === 'number' && !isNaN(v)

const displayData = computed(() => {
  return props.data.filter(d => isValidNumber(d.value)).slice(-(props.config.maxDataPoints || 10))
})

const currentValue = computed(() => {
  if (displayData.value.length > 0) {
    return displayData.value[displayData.value.length - 1].value
  }
  return hasEverReceivedData.value ? '' : '--'
})

watch(() => props.data, (newData) => {
  hasEverReceivedData.value = newData && newData.length > 0
}, { deep: true, immediate: true })

const createChart = () => {
  if (!chartCanvas.value) return
  
  if (chartInstance) {
    chartInstance.destroy()
  }
  
  const ctx = chartCanvas.value.getContext('2d')
  if (!ctx) return
  
  const barColor = props.config.color || '#5c9ce6'
  const data = displayData.value
  
  const datasets = [{
    label: props.config.labelText || '数据',
    data: data.map(v => v.value),
    backgroundColor: barColor,
    borderColor: barColor,
    borderWidth: 1,
    borderRadius: 4
  }]
  
  const labels = data.length > 0
    ? data.map(d => {
        const date = new Date(d.timestamp)
        return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      })
    : []
  
  const yAxisUnit = String(props.config.yAxisUnit || '')
  
  chartInstance = new Chart(ctx, {
    type: 'bar',
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
          position: 'top',
          labels: {
            usePointStyle: true,
            padding: 15,
            font: { size: 12 }
          }
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
            callback: (value) => `${value} ${yAxisUnit}`,
            font: { size: 11 }
          }
        }
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
  const barColor = props.config.color || '#5c9ce6'
  const ds = chartInstance.data.datasets[0]
  if (ds) {
    ds.backgroundColor = barColor
    ds.borderColor = barColor
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
  
  // 统一使用简单动画：直接延长数组，新元素自然动画进入
  for (let i = 0; i < newValues.length; i++) {
    ds.data[i] = newValues[i]
  }
  ds.data.length = newValues.length
  chartInstance.update()
}

const handleResize = () => {
  if (chartInstance) {
    chartInstance.resize()
  }
}

watch(() => props.data, () => {
  updateChart()
}, { deep: true, immediate: true })

watch(() => props.config.color, () => {
  updateChart()
})

watch(() => props.config.labelText, () => {
  if (chartInstance) {
    chartInstance.data.datasets[0].label = props.config.labelText || '数据'
    chartInstance.update()
  }
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
  <div class="bar-chart-container">
    <div class="chart-header">
      <div class="current-value">
        <span class="value">{{ typeof currentValue === 'number' ? currentValue.toFixed(1) : currentValue }}</span>
        <span class="unit">{{ config.yAxisUnit || '' }}</span>
      </div>
    </div>
    <div class="chart-wrapper">
      <canvas ref="chartCanvas"></canvas>
    </div>
  </div>
</template>

<style scoped>
.bar-chart-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 8px;
}

.chart-header {
  display: flex;
  justify-content: flex-end;
  align-items: flex-start;
  margin-bottom: 8px;
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