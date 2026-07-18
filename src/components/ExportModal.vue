/**
 * 导出项目弹窗组件
 * 选择要导出的项目及保存方式（手动保存 / 自动下载）
 */
<script setup lang="ts">
import { ref } from 'vue'
import type { Project } from '../types'

const props = defineProps<{
  projects: Project[]
}>()

const emit = defineEmits<{
  export: [project: Project, method: 'manual' | 'auto']
  close: []
}>()

const selectedProjectId = ref<string | null>(null)

const handleExport = (method: 'manual' | 'auto') => {
  const project = props.projects.find(p => p.id === selectedProjectId.value)
  if (project) {
    emit('export', project, method)
  }
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal-content">
      <div class="modal-header">
        <h2>导出项目</h2>
        <button class="close-btn" @click="emit('close')">×</button>
      </div>
      <div class="modal-body">
        <p class="modal-desc">请选择要导出的项目：</p>
        <div class="project-list">
          <label
            v-for="project in projects"
            :key="project.id"
            class="project-option"
            :class="{ selected: selectedProjectId === project.id }"
          >
            <input
              type="radio"
              :value="project.id"
              v-model="selectedProjectId"
              class="radio-input"
            />
            <span class="project-name">{{ project.name }}</span>
            <span class="project-meta">{{ project.widgets.length }} 个组件</span>
          </label>
        </div>
        <p v-if="projects.length === 0" class="empty-text">暂无项目可导出</p>
      </div>
      <div class="modal-footer export-footer">
        <button class="btn btn-secondary" @click="emit('close')">取消</button>
        <button
          class="btn btn-save-manual"
          :disabled="!selectedProjectId"
          @click="handleExport('manual')"
          title="弹出文件夹选择器，将文件保存到指定目录"
        >
          📂 手动保存
        </button>
        <button
          class="btn btn-save-auto"
          :disabled="!selectedProjectId"
          @click="handleExport('auto')"
          title="由浏览器自动下载到默认下载目录"
        >
          ⬇ 自动下载
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.45);
  z-index: 1000;
  display: flex;
  justify-content: center;
  align-items: center;
}

.modal-content {
  background: #fff;
  border-radius: 12px;
  width: 480px;
  max-width: 90vw;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #eee;
}

.modal-header h2 {
  margin: 0;
  font-size: 16px;
  color: #333;
}

.close-btn {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: #999;
  padding: 0 4px;
}

.close-btn:hover {
  color: #333;
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.modal-desc {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #666;
}

.project-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
}

.project-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border: 2px solid #e8e8e8;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.project-option:hover {
  border-color: #91d5ff;
  background: #f0f9ff;
}

.project-option.selected {
  border-color: #1890ff;
  background: #e6f7ff;
}

.radio-input {
  accent-color: #1890ff;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.project-name {
  font-size: 14px;
  font-weight: 500;
  color: #333;
  flex: 1;
}

.project-meta {
  font-size: 12px;
  color: #999;
}

.empty-text {
  text-align: center;
  color: #999;
  font-size: 14px;
  padding: 20px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid #eee;
}

.export-footer {
  flex-wrap: wrap;
}

.btn {
  padding: 8px 18px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s;
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-secondary {
  background: #f0f0f0;
  color: #666;
}

.btn-secondary:hover:not(:disabled) {
  background: #e0e0e0;
}

.btn-save-manual {
  background: #1890ff;
  color: #fff;
}

.btn-save-manual:hover:not(:disabled) {
  background: #40a9ff;
}

.btn-save-auto {
  background: #52c41a;
  color: #fff;
}

.btn-save-auto:hover:not(:disabled) {
  background: #73d13d;
}
</style>