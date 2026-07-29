/**
 * 左侧组件面板
 * 提供可拖拽的组件列表（基础组件和显示组件），用户可搜索过滤并拖入画布
 */
<script setup lang="ts">
import { ref } from 'vue'

const searchQuery = ref('')

const basicComponents = [
  { id: 'button', name: '按钮', icon: '◉', desc: '点击发送数据到指定主题' },
  { id: 'switch', name: '开关', icon: '⚇', desc: '切换开关状态并发送对应值' },
  { id: 'slider', name: '滑动条', icon: '▭', desc: '拖动滑块发送数值' },
  { id: 'input', name: '输入框', icon: '▭', desc: '点击输入框输入内容，按发送键发送到主题' },
  { id: 'radio', name: '单选框', icon: '◎', desc: '选择选项并发送对应值到主题' },
  { id: 'text', name: '单行文字', icon: 'T', desc: '显示单个主题接收到的消息' },
  { id: 'textarea', name: '多行文本', icon: 'TT', desc: '读取多个主题，每行显示一个主题的数据' }
]

const displayComponents = [
  { id: 'lineChart', name: '折线图', icon: '〰', desc: '支持两种模式：多主题各显示一条线；或单主题按/分隔解析多个数据' },
  { id: 'barChart', name: '柱状图', icon: '▮', desc: '显示数据对比柱状图' },
  { id: 'miniArea', name: '迷你面积图', icon: '∿', desc: '显示最新数据的迷你面积图，右上角显示当前数值' }
]

const decorativeComponents = [
  { id: 'decorativeText', name: '文本', icon: 'T', desc: '自定义显示文本内容，支持多种隐藏模式' }
]

const handleDragStart = (e: DragEvent, type: string) => {
  if (e.dataTransfer) {
    e.dataTransfer.setData('widgetType', type)
  }
}

const emit = defineEmits<{
  addWidget: [type: string, x: number, y: number]
}>()

const handleDoubleClick = (type: string, e: MouseEvent) => {
  // 传递鼠标 y 坐标（clientY），x 用 -1 作为标志，由父组件计算紧靠侧栏右边缘的位置
  emit('addWidget', type, -1, e.clientY)
}
</script>

<template>
  <aside class="sidebar-left">
    <div class="search-box">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="搜索组件..."
      />
    </div>
    
    <div class="component-group">
      <div class="group-title">基础组件</div>
      <div
        v-for="comp in basicComponents.filter(c => searchQuery === '' || c.name.toLowerCase().includes(searchQuery.toLowerCase()))"
        :key="comp.id"
        class="component-item"
        :draggable="true"
        @dragstart="handleDragStart($event, comp.id)"
        @dblclick="handleDoubleClick(comp.id, $event)"
      >
        <span>{{ comp.icon }}</span>
        <span>{{ comp.name }}</span>
      </div>
    </div>
    
    <div class="component-group">
      <div class="group-title">装饰组件</div>
      <div
        v-for="comp in decorativeComponents.filter(c => searchQuery === '' || c.name.toLowerCase().includes(searchQuery.toLowerCase()))"
        :key="comp.id"
        class="component-item"
        :draggable="true"
        @dragstart="handleDragStart($event, comp.id)"
        @dblclick="handleDoubleClick(comp.id, $event)"
      >
        <span>{{ comp.icon }}</span>
        <span>{{ comp.name }}</span>
      </div>
    </div>
    
    <div class="component-group">
      <div class="group-title">显示组件</div>
      <div
        v-for="comp in displayComponents.filter(c => searchQuery === '' || c.name.toLowerCase().includes(searchQuery.toLowerCase()))"
        :key="comp.id"
        class="component-item"
        :draggable="true"
        @dragstart="handleDragStart($event, comp.id)"
        @dblclick="handleDoubleClick(comp.id, $event)"
      >
        <span>{{ comp.icon }}</span>
        <span>{{ comp.name }}</span>
      </div>
    </div>
  </aside>
</template>