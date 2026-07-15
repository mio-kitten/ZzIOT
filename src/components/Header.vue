/**
 * 顶部标题栏组件
 * 显示应用标题、连接状态、项目选择器、全屏/项目管理按钮
 */
<script setup lang="ts">
import { computed, inject } from 'vue'

const props = defineProps<{
  isConnected: boolean
  projectId: string
  showFullscreenBtn: boolean
  showProjectSelector: boolean
  projects: any[]
  isEditorMode: boolean
  showProjectManagerBtn: boolean
  switchCooldown: boolean
}>()

const emit = defineEmits<{
  connect: []
  disconnect: []
  openProjectManager: []
  toggleFullscreen: []
  selectProject: [id: string]
  scrollToCenter: []
  createProject: []
  openIoTService: []
}>()

const openNetworkConfig = inject<() => void>('openNetworkConfig', () => {})

const handleChangeProject = (e: Event) => {
  const projectId = (e.target as HTMLSelectElement).value
  if (projectId) {
    emit('selectProject', projectId)
  }
}

const headerTitle = computed(() => {
  if (!props.projectId || !props.showProjectSelector) {
    return '项目管理'
  }
  return props.isEditorMode ? '编辑模式' : '查看模式'
})
</script>

<template>
  <header class="blue-header">
    <div class="header-left">
      <button v-if="showProjectManagerBtn" class="btn btn-secondary" @click="emit('openProjectManager')" style="margin-right: 12px;">
        项目管理
      </button>
      <button v-if="!showProjectSelector" class="btn btn-secondary" @click="emit('createProject')" style="margin-right: 12px;">
        + 新建项目
      </button>
      <button v-if="!showProjectSelector" class="btn btn-secondary" @click="openNetworkConfig()" style="margin-right: 12px;">
        内网服务
      </button>
      <select v-if="showProjectSelector" :value="projectId" class="project-select" :disabled="switchCooldown" @change="handleChangeProject" style="background: rgba(255,255,255,0.2); color: white; border: none; padding: 6px 12px; border-radius: 4px; font-size: 13px;">
        <option v-if="projects.length === 0" value="">未选择项目</option>
        <option v-for="project in projects" :key="project.id" :value="project.id">{{ project.name }}</option>
      </select>
      <button v-if="showProjectSelector" class="btn btn-secondary" @click="openNetworkConfig()" style="margin-left: 12px;">
        内网服务
      </button>
    </div>
    
    <h1>{{ headerTitle }}</h1>
    
    <div class="header-right">
      <div class="connection-status" :class="{ connected: isConnected, disconnected: !isConnected }">
        <span class="status-dot" :class="{ connected: isConnected, disconnected: !isConnected }"></span>
        <span>{{ isConnected ? '已连接' : '未连接' }}</span>
      </div>
      
      <button
        class="btn"
        :class="isConnected ? 'btn-danger' : 'btn-success'"
        @click="isConnected ? emit('disconnect') : emit('connect')"
        style="margin-left: 12px;"
      >
        {{ isConnected ? '断开连接' : '连接平台' }}
      </button>
      
      <button
        v-if="showProjectSelector"
        class="btn btn-secondary"
        style="margin-left: 12px;"
        @click="emit('scrollToCenter')"
      >
        回到画布中心
      </button>
      
      <button 
        v-if="showFullscreenBtn && showProjectSelector"
        class="btn btn-secondary" 
        style="margin-left: 12px;"
        @click="emit('toggleFullscreen')"
      >
        全屏
      </button>
    </div>
  </header>
</template>

<style scoped>
.header-left {
  display: flex;
  align-items: center;
  position: relative;
  z-index: 1;
}

.header-right {
  display: flex;
  align-items: center;
  position: relative;
  z-index: 1;
}

.blue-header h1 {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  margin: 0;
}

.project-select {
  transition: box-shadow 0.2s;
}

.project-select option {
  color: #333;
}

.project-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
  font-weight: 500;
}

.btn:hover {
  opacity: 0.88;
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
}

.connection-status.connected {
  background: #00c853;
  color: #ffffff;
  font-weight: 700;
  border: 1.5px solid #00e676;
  box-shadow: 0 0 10px rgba(0, 230, 118, 0.5);
}

.connection-status.disconnected {
  background: #e53935;
  color: #ffffff;
  font-weight: 700;
  border: 1.5px solid #ff5252;
  box-shadow: 0 0 10px rgba(255, 82, 82, 0.5);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-dot.connected {
  background: #ffffff;
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.8);
}

.status-dot.disconnected {
  background: #ffffff;
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.8);
}

.btn-success {
  background-color: #66bb6a;
  color: #fff;
}

.btn-danger {
  background-color: #ef5350;
  color: #fff;
}

.header-right .btn-success:hover {
  background-color: #81c784;
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.8);
  opacity: 1;
}

.header-right .btn-danger:hover {
  background-color: #e57373;
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.8);
  opacity: 1;
}

.btn-secondary {
  background-color: rgba(255, 255, 255, 0.25);
  color: #fff;
}

.header-left .btn-secondary:hover,
.header-right .btn-secondary:hover {
  background-color: rgba(255, 255, 255, 0.45);
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.8);
  opacity: 1;
}

.project-select:hover {
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.8);
}
</style>