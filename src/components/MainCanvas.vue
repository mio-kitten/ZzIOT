/**
 * 主画布组件
 * 拖拽容器，承载所有 Widget 组件的渲染、拖拽、缩放、选中操作
 * 支持编辑模式和查看模式（全屏预览）
 */
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import type { Widget, DataPoint } from '@/types'
import { getWidgetMinSize } from '@/utils/widgetMinSize'
import LineChartWidget from './widgets/LineChartWidget.vue'
import BarChartWidget from './widgets/BarChartWidget.vue'
import ButtonWidget from './widgets/ButtonWidget.vue'
import SwitchWidget from './widgets/SwitchWidget.vue'
import SliderWidget from './widgets/SliderWidget.vue'
import TextWidget from './widgets/TextWidget.vue'
import MiniAreaWidget from './widgets/MiniAreaWidget.vue'
import InputWidget from './widgets/InputWidget.vue'
import RadioWidget from './widgets/RadioWidget.vue'
import DecorativeTextWidget from './widgets/DecorativeTextWidget.vue'

const props = defineProps<{
  widgets: Widget[]
  selectedWidgetId: string | null
  widgetData: Record<string, Record<string, DataPoint[]>>
  showControls?: boolean
  showCenterFlare?: boolean
}>()

const emit = defineEmits<{
  selectWidget: [id: string | null]
  addWidget: [type: string, x: number, y: number]
  updateWidget: [id: string, updates: Record<string, unknown>]
  removeWidget: [id: string]
  updateWidgetSize: [id: string, width: number, height: number]
}>()

const isDragging = ref(false)
const dragOffset = ref({ x: 0, y: 0 })
const draggingWidgetId = ref<string | null>(null)
const canvasRef = ref<HTMLElement | null>(null)

const isNativeDrag = ref(false)

const removingWidgetIds = ref<Set<string>>(new Set())

const isResizing = ref(false)
const resizingWidgetId = ref<string | null>(null)
const resizeStartSize = ref({ width: 0, height: 0 })
const resizeStartPos = ref({ x: 0, y: 0 })

const getWidgetStyle = (widget: Widget) => {
  const config = widget.config as { x: number; y: number; width: number; height: number; transparent?: boolean; hideMode?: string }
  const isTransparent = config.transparent === true || 
    (widget.type === 'decorativeText' && (config.hideMode === 'bg' || config.hideMode === 'bgAndTitle'))
  return {
    left: `${config.x}px`,
    top: `${config.y}px`,
    width: `${config.width}px`,
    height: `${config.height}px`,
    '--widget-bg': isTransparent ? 'transparent' : '#ffffff'
  }
}

const getWidgetTitle = (widget: Widget) => {
  return (widget.config as { title: string }).title
}

const isWidgetTransparent = (widget: Widget) => {
  const config = widget.config as { transparent?: boolean; hideMode?: string }
  return config.transparent === true || 
    (widget.type === 'decorativeText' && (config.hideMode === 'bg' || config.hideMode === 'bgAndTitle'))
}

const shouldShowTitle = (widget: Widget) => {
  const config = widget.config as { transparent?: boolean; hideMode?: string }
  if (props.showControls) {
    if (widget.type === 'decorativeText') {
      const hideMode = config.hideMode || 'none'
      return hideMode !== 'title' && hideMode !== 'bgAndTitle'
    }
    return true
  } else {
    if (widget.type === 'decorativeText') {
      const hideMode = config.hideMode || 'none'
      if (hideMode === 'title' || hideMode === 'bgAndTitle') {
        return false
      }
      return true
    }
    return !config.transparent || widget.type === 'switch' || widget.type === 'button'
  }
}

const shouldCenterTitleFullscreen = (widget: Widget) => {
  if (props.showControls) return false
  if (widget.type === 'decorativeText') {
    const hideMode = (widget.config as { hideMode?: string }).hideMode || 'none'
    return hideMode === 'bg'
  }
  return isWidgetTransparent(widget) && (widget.type === 'switch' || widget.type === 'button')
}

const getWidgetConfig = (widget: Widget) => {
  return widget.config as { themes: { id: string; name: string; color: string; topic: string }[]; maxDataPoints: number; yAxisUnit: string; displayMode: 'multiTopic' | 'singleTopic' }
}

const getMiniAreaData = (widgetId: string): DataPoint[] => {
  const data = props.widgetData[widgetId]?.[widgetId] || []
  if (data.length === 0) {
    // 返回模拟数据确保图表能显示
    const now = Date.now()
    return [
      { timestamp: now - 9000, value: 5, themeId: widgetId },
      { timestamp: now - 8000, value: 8, themeId: widgetId },
      { timestamp: now - 7000, value: 6, themeId: widgetId },
      { timestamp: now - 6000, value: 10, themeId: widgetId },
      { timestamp: now - 5000, value: 7, themeId: widgetId },
      { timestamp: now - 4000, value: 12, themeId: widgetId },
      { timestamp: now - 3000, value: 9, themeId: widgetId },
      { timestamp: now - 2000, value: 14, themeId: widgetId },
      { timestamp: now - 1000, value: 11, themeId: widgetId },
      { timestamp: now, value: 15, themeId: widgetId },
    ]
  }
  return data
}

const handleCanvasClick = () => {
  emit('selectWidget', null)
}

const handleDragOver = (e: DragEvent) => {
  e.preventDefault()
  e.dataTransfer!.dropEffect = 'copy'
  isNativeDrag.value = true
}

const handleDrop = (e: DragEvent) => {
  e.preventDefault()
  e.stopPropagation()
  isNativeDrag.value = false
  const widgetType = e.dataTransfer?.getData('widgetType')
  if (!widgetType) return
  
  const canvas = e.currentTarget as HTMLElement
  const rect = canvas.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  
  emit('addWidget', widgetType, x, y)
}

const handleWidgetClick = (e: MouseEvent, widgetId: string) => {
  e.stopPropagation()
  emit('selectWidget', widgetId)
}

const handleDeleteWidget = (widgetId: string) => {
  const next = new Set(removingWidgetIds.value)
  next.add(widgetId)
  removingWidgetIds.value = next
  setTimeout(() => {
    emit('removeWidget', widgetId)
  }, 300)
}

const handleDragStart = (e: MouseEvent, widgetId: string) => {
  if (isNativeDrag.value) return
  
  e.stopPropagation()
  emit('selectWidget', widgetId)
  
  if (!props.showControls || !canvasRef.value) return
  
  const widget = props.widgets.find(w => w.id === widgetId)
  if (!widget) return
  
  const config = widget.config as { x: number; y: number }
  const canvasRect = canvasRef.value.getBoundingClientRect()
  
  isDragging.value = true
  draggingWidgetId.value = widgetId
  dragOffset.value = {
    x: e.clientX - canvasRect.left - config.x,
    y: e.clientY - canvasRect.top - config.y
  }
}

const handleResizeStart = (e: MouseEvent, widgetId: string) => {
  e.stopPropagation()
  e.preventDefault()
  
  if (!props.showControls) return
  
  const widget = props.widgets.find(w => w.id === widgetId)
  if (!widget) return
  
  const config = widget.config as { width: number; height: number }
  
  isResizing.value = true
  resizingWidgetId.value = widgetId
  resizeStartSize.value = {
    width: config.width,
    height: config.height
  }
  resizeStartPos.value = {
    x: e.clientX,
    y: e.clientY
  }
}

const handleMouseMove = (e: MouseEvent) => {
  if (!canvasRef.value) return
  
  if (isDragging.value && draggingWidgetId.value) {
    const canvasRect = canvasRef.value.getBoundingClientRect()
    const x = e.clientX - canvasRect.left - dragOffset.value.x
    const y = e.clientY - canvasRect.top - dragOffset.value.y
    
    emit('updateWidget', draggingWidgetId.value, {
      x: Math.round(x),
      y: Math.round(y)
    })
  }
  
  if (isResizing.value && resizingWidgetId.value) {
    const canvasRect = canvasRef.value.getBoundingClientRect()
    const deltaX = e.clientX - resizeStartPos.value.x
    const deltaY = e.clientY - resizeStartPos.value.y
    
    const widget = props.widgets.find(w => w.id === resizingWidgetId.value)
    const { width: minW, height: minH } = widget ? getWidgetMinSize(widget.type) : { width: 120, height: 80 }
    const newWidth = Math.max(minW, Math.min(resizeStartSize.value.width + deltaX, canvasRect.width - 50))
    const newHeight = Math.max(minH, Math.min(resizeStartSize.value.height + deltaY, canvasRect.height - 50))
    
    emit('updateWidget', resizingWidgetId.value, {
      width: newWidth,
      height: newHeight
    })
  }
}

const handleMouseUp = () => {
  isDragging.value = false
  draggingWidgetId.value = null
  isResizing.value = false
  resizingWidgetId.value = null
}

/** 按方向移动选中组件（编辑模式箭头按钮用） */
const handleMoveBy = (widgetId: string, dx: number, dy: number) => {
  const widget = props.widgets.find(w => w.id === widgetId)
  if (!widget) return
  const config = widget.config as { x: number; y: number }
  emit('updateWidget', widgetId, {
    x: config.x + dx,
    y: config.y + dy
  })
}

onMounted(() => {
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
})

onUnmounted(() => {
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseup', handleMouseUp)
})
</script>

<template>
  <main
    ref="canvasRef"
    class="main-canvas"
    @click="handleCanvasClick"
    @dragover="handleDragOver"
    @dragleave="isNativeDrag = false"
    @drop="handleDrop"
  >
    <!-- 画布正中央淡灰色十字架 -->
    <div class="canvas-crosshair" :class="{ flare: showCenterFlare }">
      <div class="crosshair-h"></div>
      <div class="crosshair-v"></div>
    </div>
    <div
      v-for="widget in widgets"
      :key="widget.id"
      class="widget"
      :class="{
        'widget-removing': removingWidgetIds.has(widget.id),
        selected: props.showControls && widget.id === selectedWidgetId,
        'radio-type': widget.type === 'radio',
        'button-type': widget.type === 'button',
        'switch-type': widget.type === 'switch',
        'slider-type': widget.type === 'slider',
        'input-type': widget.type === 'input',
        'text-type': widget.type === 'text',
        'textarea-type': widget.type === 'textarea',
        'line-chart-type': widget.type === 'lineChart',
        'bar-chart-type': widget.type === 'barChart',
        'mini-area-type': widget.type === 'miniArea',
        'decorative-text-type': widget.type === 'decorativeText',
        transparent: isWidgetTransparent(widget),
        'center-title-fullscreen': shouldCenterTitleFullscreen(widget)
      }"
      :style="getWidgetStyle(widget)"
      @click="handleWidgetClick($event, widget.id)"
      @mousedown="handleDragStart($event, widget.id)"
    >
      <div class="widget-header">
        <h3 v-if="shouldShowTitle(widget)">{{ getWidgetTitle(widget) }}</h3>
        <span v-else class="widget-title-placeholder"></span>
        <button
          v-if="props.showControls"
          class="btn btn-danger btn-sm"
          style="padding: 2px 8px; font-size: 12px;"
          @click.stop="handleDeleteWidget(widget.id)"
        >
          删除
        </button>
      </div>
      <div class="widget-content">
        <LineChartWidget
          v-if="widget.type === 'lineChart'"
          :config="getWidgetConfig(widget)"
          :data="widgetData[widget.id] || {}"
        />
        <BarChartWidget
          v-else-if="widget.type === 'barChart'"
          :config="widget.config"
          :data="(widgetData[widget.id]?.[widget.id]) || []"
        />
        <ButtonWidget
          v-else-if="widget.type === 'button'"
          :config="widget.config"
        />
        <SwitchWidget
          v-else-if="widget.type === 'switch'"
          :config="widget.config"
          :data="widgetData[widget.id] || {}"
        />
        <SliderWidget
          v-else-if="widget.type === 'slider'"
          :config="widget.config"
          :data="widgetData[widget.id] || {}"
        />
        <TextWidget
          v-else-if="widget.type === 'text' || widget.type === 'textarea'"
          :config="widget.config"
          :data="widgetData[widget.id] || {}"
        />
        <MiniAreaWidget
          v-else-if="widget.type === 'miniArea'"
          :config="widget.config as any"
          :data="getMiniAreaData(widget.id)"
        />
        <InputWidget
          v-else-if="widget.type === 'input'"
          :config="widget.config"
        />
        <RadioWidget
          v-else-if="widget.type === 'radio'"
          :config="widget.config"
          :data="widgetData[widget.id] || {}"
          @resize="(width, height) => emit('updateWidgetSize', widget.id, width, height)"
        />
        <DecorativeTextWidget
          v-else-if="widget.type === 'decorativeText'"
          :config="widget.config as any"
        />
      </div>
      <div 
        v-if="props.showControls && widget.type !== 'radio'"
        class="widget-resize-handle"
        @mousedown="handleResizeStart($event, widget.id)"
      ></div>
      
      <!-- 编辑模式：选中组件的位置控制箭头 -->
      <div v-if="props.showControls && widget.id === selectedWidgetId" class="widget-pos-controls">
        <div class="pos-display">{{ (widget.config as any).x }}, {{ (widget.config as any).y }}</div>
        <button class="pos-btn pos-up" title="上移 5px" @click.stop="handleMoveBy(widget.id, 0, -5)">▲</button>
        <button class="pos-btn pos-down" title="下移 5px" @click.stop="handleMoveBy(widget.id, 0, 5)">▼</button>
        <button class="pos-btn pos-left" title="左移 5px" @click.stop="handleMoveBy(widget.id, -5, 0)">◀</button>
        <button class="pos-btn pos-right" title="右移 5px" @click.stop="handleMoveBy(widget.id, 5, 0)">▶</button>
      </div>
    </div>
  </main>
</template>

<style scoped>
.widget {
  z-index: 1;
  user-select: none;
}

.widget.selected {
  z-index: 2;
  border-color: #5c9ce6;
  box-shadow: 0 0 0 2px rgba(92, 156, 230, 0.2);
}

.widget.radio-type :deep(.widget-content) {
  padding: 8px;
}

.widget-resize-handle {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 20px;
  height: 20px;
  cursor: se-resize;
  z-index: 1;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20'%3E%3Cpath fill='%23999' d='M18 2l2 2-14 14-2-2 14-14z'/%3E%3C/svg%3E") no-repeat;
}

.widget-resize-handle:hover {
  background: linear-gradient(135deg, transparent 50%, #1e88e5 50%);
}

/* 组件位置控制 */
.widget-pos-controls {
  position: absolute;
  top: -28px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(0, 0, 0, 0.75);
  border-radius: 6px;
  padding: 3px 6px;
  z-index: 10;
  white-space: nowrap;
}

.pos-display {
  color: #fff;
  font-size: 11px;
  font-family: monospace;
  padding: 0 4px;
}

.pos-btn {
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  font-size: 9px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
  padding: 0;
  line-height: 1;
}

.pos-btn:hover {
  background: rgba(255, 255, 255, 0.35);
}

.pos-btn:active {
  background: rgba(255, 255, 255, 0.5);
}

/* 画布正中央淡灰色十字架 */
.canvas-crosshair {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 0;
}

.canvas-crosshair.flare {
  animation: crosshair-flare 3.5s ease-in-out forwards;
}

@keyframes crosshair-flare {
  0%   { opacity: 1; z-index: 9999; }
  12%  { opacity: 0.1; z-index: 9999; }
  20%  { opacity: 1; z-index: 9999; }
  30%  { opacity: 0.1; z-index: 9999; }
  38%  { opacity: 1; z-index: 9999; }
  48%  { opacity: 0.1; z-index: 9999; }
  49%  { opacity: 0.1; z-index: 0; }
  62%  { opacity: 1; z-index: 0; }
  100% { opacity: 1; z-index: 0; }
}

.crosshair-h {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 60px;
  height: 1.5px;
  background: rgba(30, 30, 30, 0.85);
}

.crosshair-v {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 1.5px;
  height: 60px;
  background: rgba(30, 30, 30, 0.85);
}
</style>