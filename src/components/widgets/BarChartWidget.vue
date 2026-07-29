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
    // 未满容量：直接延长数组+默认动画，新元素自然动画进入
    for (let i = 0; i < newValues.length; i++) {
      ds.data[i] = newValues[i]
    }
    chartInstance.update()
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