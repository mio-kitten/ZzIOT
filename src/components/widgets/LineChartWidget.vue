/**
 * 折线图组件
 * 基于 Chart.js，支持多主题多线模式或单主题多数据解析模式
 * 可配置最大数据点数、Y轴单位、各主题颜色和MQTT主题
 */
<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { Chart, registerables } from 'chart.js'
import type { DataPoint } from '@/types'

Chart.register(...registerables)

const props = defineProps<{
  config: {
    themes: { id: string; name: string; color: string; topic: string }[]
    maxDataPoints: number
    yAxisUnit: string
    displayMode: 'multiTopic' | 'singleTopic'
  }
  data: Map<string, DataPoint[]>
}>()

const parsedData = computed(() => {
  if (props.config.displayMode === 'singleTopic') {
    return props.data
  }
  return props.data
})

const currentValues = computed(() => {
  return props.config.themes.map((theme, index) => {
    let themeData: DataPoint[] = []
    if (props.config.displayMode === 'singleTopic') {
      const lineId = `line-${index + 1}`
      themeData = parsedData.value.get(lineId) || []
    } else {
      themeData = parsedData.value.get(theme.topic) || parsedData.value.get(theme.id) || []
    }
    const displayData = themeData.slice(-props.config.maxDataPoints)
    const lastValue = displayData.length > 0 ? displayData[displayData.length - 1].value : '--'
    return {
      name: theme.name,
      color: theme.color,
      value: lastValue
    }
  })
})

const chartCanvas = ref<HTMLCanvasElement | null>(null)
let chartInstance: Chart | null = null
let resizeObserver: ResizeObserver | null = null
let animTimeout: ReturnType<typeof setTimeout> | null = null

const formatTime = (timestamp: number) => {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

const createChart = () => {
  if (!chartCanvas.value) return
  
  if (chartInstance) {
    chartInstance.destroy()
  }
  
  const ctx = chartCanvas.value.getContext('2d')
  if (!ctx) return
  
  let datasets
  
  if (props.config.displayMode === 'singleTopic') {
    datasets = props.config.themes.map((theme, index) => {
      const lineId = `line-${index + 1}`
      const lineData = parsedData.value.get(lineId) || []
      const displayData = lineData.slice(-props.config.maxDataPoints)
      return {
        label: theme.name,
        data: displayData.map(d => d.value),
        borderColor: theme.color,
        backgroundColor: `${theme.color}20`,
        borderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.3,
        fill: false,
        hidden: lineData.length === 0
      }
    })
  } else {
    datasets = props.config.themes.map(theme => {
      const themeData = parsedData.value.get(theme.topic) || parsedData.value.get(theme.id) || []
      const displayData = themeData.slice(-props.config.maxDataPoints)
      return {
        label: theme.name,
        data: displayData.map(d => d.value),
        borderColor: theme.color,
        backgroundColor: `${theme.color}20`,
        borderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.3,
        fill: false
      }
    })
  }
  
  const allData = Array.from(parsedData.value.values()).flat()
  const allTimestamps = [...new Set(allData.map(d => d.timestamp))].sort((a, b) => a - b)
  const displayTimestamps = allTimestamps.slice(-props.config.maxDataPoints)
  const labels = displayTimestamps.map(ts => formatTime(ts))
  
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
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            usePointStyle: true,
            padding: 15,
            font: {
              size: 12
            }
          }
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              return `${context.dataset.label}: ${context.parsed.y} ${props.config.yAxisUnit}`
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            color: '#f0f0f0'
          },
          ticks: {
            maxTicksLimit: 8,
            font: {
              size: 11
            }
          }
        },
        y: {
          beginAtZero: true,
          grid: {
            color: '#f0f0f0'
          },
          ticks: {
            callback: (value) => `${value} ${props.config.yAxisUnit}`,
            font: {
              size: 11
            }
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
  
  // 取消上次未完成的移位动画
  if (animTimeout) {
    clearTimeout(animTimeout)
    animTimeout = null
  }
  
  const allData = Array.from(parsedData.value.values()).flat()
  const allTimestamps = [...new Set(allData.map(d => d.timestamp))].sort((a, b) => a - b)
  const displayTimestamps = allTimestamps.slice(-props.config.maxDataPoints)
  const labels = displayTimestamps.map(ts => formatTime(ts))
  
  // 更新 labels
  chartInstance.data.labels!.length = 0
  chartInstance.data.labels!.push(...labels)
  
  const maxLen = props.config.maxDataPoints
  
  // 收集每个 dataset 的新值
  const datasetsNewValues: number[][] = []
  
  props.config.themes.forEach((theme, index) => {
    let themeData: DataPoint[] = []
    if (props.config.displayMode === 'singleTopic') {
      const lineId = `line-${index + 1}`
      themeData = parsedData.value.get(lineId) || []
    } else {
      themeData = parsedData.value.get(theme.topic) || parsedData.value.get(theme.id) || []
    }
    const displayData = themeData.slice(-maxLen)
    const newValues = displayData.map(d => d.value)
    datasetsNewValues.push(newValues)
  })
  
  // Step 1: 新数据先闪现到最后一列（无动画）
  props.config.themes.forEach((_, index) => {
    const newValues = datasetsNewValues[index]
    if (chartInstance!.data.datasets[index]) {
      chartInstance!.data.datasets[index].data[newValues.length - 1] = newValues[newValues.length - 1]
      chartInstance!.data.datasets[index].hidden = newValues.length === 0
    }
  })
  
  // 判断是否满容量（取所有 dataset 中最长的长度）
  const maxDataLen = Math.max(...datasetsNewValues.map(v => v.length), 0)
  const isFull = maxDataLen >= maxLen
  
  if (isFull) {
    // 满容量：两步更新（闪现 + 移位）
    chartInstance.update('none')
    
    // Step 2: 旧数据集体往左移（带动画）
    animTimeout = setTimeout(() => {
      if (!chartInstance) return
      props.config.themes.forEach((_, index) => {
        const newValues = datasetsNewValues[index]
        if (chartInstance!.data.datasets[index]) {
          const ds = chartInstance!.data.datasets[index]
          for (let i = 0; i < newValues.length - 1; i++) {
            ds.data[i] = newValues[i]
          }
        }
      })
      chartInstance.update()
      animTimeout = null
    }, 80)
  } else {
    // 未满容量：直接延长数组+默认动画，新元素自然动画进入
    props.config.themes.forEach((_, index) => {
      const newValues = datasetsNewValues[index]
      if (chartInstance!.data.datasets[index]) {
        const ds = chartInstance!.data.datasets[index]
        for (let i = 0; i < newValues.length; i++) {
          ds.data[i] = newValues[i]
        }
        ds.hidden = newValues.length === 0
      }
    })
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

watch(() => props.config.themes, () => {
  nextTick(() => {
    createChart()
  })
}, { deep: true })

watch(() => props.config.yAxisUnit, () => {
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
  <div class="line-chart-container">
    <div class="chart-header">
      <div class="current-values">
        <div v-for="cv in currentValues" :key="cv.name" class="value-item">
          <span class="value-dot" :style="{ backgroundColor: cv.color }"></span>
          <span class="value-number" :style="{ color: cv.color }">{{ typeof cv.value === 'number' ? cv.value.toFixed(1) : cv.value }}</span>
          <span class="unit">{{ config.yAxisUnit || '' }}</span>
        </div>
      </div>
    </div>
    <div class="chart-wrapper">
      <canvas ref="chartCanvas"></canvas>
    </div>
  </div>
</template>

<style scoped>
.line-chart-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 8px;
}

.chart-header {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
}

.current-values {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.value-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.value-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.value-number {
  font-size: 20px;
  font-weight: 700;
}

.unit {
  font-size: 12px;
  color: #999;
}

.chart-wrapper {
  flex: 1;
  min-height: 60px;
}
</style>