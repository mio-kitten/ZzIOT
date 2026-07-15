/**
 * 全屏模式顶部控制栏
 * 全屏查看模式下显示的悬浮控制栏，包含退出全屏、连接、项目切换等功能
 */
<script setup lang="ts">
defineProps<{
  isVisible: boolean
  isConnected: boolean
  title: string
  projectId: string
  projects: any[]
  switchCooldown: boolean
}>()

const emit = defineEmits<{
  exitFullscreen: []
  connect: []
  disconnect: []
  openProjectManager: []
  selectProject: [id: string]
  scrollToCenter: []
  openIoTService: []
}>()

const handleChangeProject = (e: Event) => {
  const projectId = (e.target as HTMLSelectElement).value
  if (projectId) {
    emit('selectProject', projectId)
  }
}
</script>

<template>
  <div class="top-bar" :class="{ visible: isVisible }">
    <div class="top-bar-left">
      <button 
        class="btn btn-secondary"
        @click="emit('openProjectManager')"
        style="margin-right: 12px;"
      >
        项目管理
      </button>
      <select :value="projectId" class="project-select" :disabled="switchCooldown" @change="handleChangeProject" style="background: rgba(255,255,255,0.2); color: white; border: none; padding: 6px 12px; border-radius: 4px; font-size: 13px;">
        <option v-if="projects.length === 0" value="">未选择项目</option>
        <option v-for="project in projects" :key="project.id" :value="project.id">{{ project.name }}</option>
      </select>
      <button
        class="btn btn-secondary"
        style="margin-left: 12px;"
        @click="emit('openIoTService')"
      >
        内网服务
      </button>
    </div>
    
    <h1 class="top-bar-title">{{ title }}</h1>
    
    <div class="top-bar-right">
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
        class="btn btn-secondary"
        style="margin-left: 12px;"
        @click="emit('scrollToCenter')"
      >
        回到画布中心
      </button>
      
      <button 
        class="btn btn-secondary"
        @click="emit('exitFullscreen')"
        style="margin-left: 12px;"
      >
        退出全屏
      </button>
    </div>
  </div>
</template>

<style scoped>
.top-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  background: linear-gradient(135deg, #5c9ce6 0%, #4a8fd4 100%);
  color: #fff;
  padding: 0 20px;
  height: 48px;
  display: flex;
  align-items: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  z-index: 9999;
  transform: translateY(-100%);
  transition: transform 0.3s ease;
}

.top-bar.visible {
  transform: translateY(0);
}

.top-bar-left {
  display: flex;
  align-items: center;
  position: relative;
  z-index: 1;
}

.top-bar-right {
  display: flex;
  align-items: center;
  position: relative;
  z-index: 1;
  margin-left: auto;
}

.top-bar-title {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  font-size: 16px;
  font-weight: 500;
  margin: 0;
  color: #fff;
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

.btn-success {
  background-color: #66bb6a;
  color: #ffffff;
}

.btn-danger {
  background-color: #ef5350;
  color: #fff;
}

.btn-secondary {
  background-color: rgba(255, 255, 255, 0.25);
  color: #fff;
}

.top-bar-left .btn-secondary:hover,
.top-bar-right .btn-secondary:hover {
  background-color: rgba(255, 255, 255, 0.45);
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.8);
  opacity: 1;
}

.top-bar-right .btn-success:hover {
  background-color: #81c784;
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.8);
  opacity: 1;
}

.top-bar-right .btn-danger:hover {
  background-color: #e57373;
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.8);
  opacity: 1;
}

.project-select:hover {
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.8);
}
</style>