/**
 * 导出项目弹窗组件
 * 选择要导出的项目及保存方式（手动保存 / 自动下载）
 * 支持多选导出
 */
<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Project } from '../types'

const props = defineProps<{
  projects: Project[]
}>()

const emit = defineEmits<{
  close: []
  export: [projects: Project[]]
}>()

const selectedProjectIds = ref<Set<string>>(new Set())
const isClosing = ref(false)

const allSelected = computed(() => {
  return props.projects.length > 0 && selectedProjectIds.value.size === props.projects.length
})

const hasSelection = computed(() => selectedProjectIds.value.size > 0)

const toggleProject = (id: string) => {
  const newSet = new Set(selectedProjectIds.value)
  if (newSet.has(id)) {
    newSet.delete(id)
  } else {
    newSet.add(id)
  }
  selectedProjectIds.value = newSet
}

const toggleAll = () => {
  if (allSelected.value) {
    selectedProjectIds.value = new Set()
  } else {
    selectedProjectIds.value = new Set(props.projects.map(p => p.id))
  }
}

const handleClose = () => {
  isClosing.value = true
  setTimeout(() => {
    emit('close')
  }, 200)
}

const handleExport = () => {
  const selectedProjects = props.projects.filter(p => selectedProjectIds.value.has(p.id))
  if (selectedProjects.length > 0) {
    isClosing.value = true
    setTimeout(() => {
      emit('export', selectedProjects)
    }, 200)
  }
}
</script>

<template>
  <div class="modal-overlay" :class="{ closing: isClosing }" @click.self="handleClose">
    <div class="modal-content">
      <div class="modal-header">
        <h2>导出项目</h2>
        <button class="close-btn" @click="handleClose">×</button>
      </div>
      <div class="modal-body">
        <p class="modal-desc">请选择要导出的项目（可多选）：</p>
        <div class="select-all-row" v-if="projects.length > 0">
          <label class="select-all-label">
            <input
              type="checkbox"
              :checked="allSelected"
              @change="toggleAll"
              class="checkbox-input"
            />
            <span class="select-all-text">全选</span>
          </label>
          <span class="selected-count">已选 {{ selectedProjectIds.size }} / {{ projects.length }}</span>
        </div>
        <div class="project-list">
          <label
            v-for="project in projects"
            :key="project.id"
            class="project-option"
            :class="{ selected: selectedProjectIds.has(project.id) }"
          >
            <input
              type="checkbox"
              :checked="selectedProjectIds.has(project.id)"
              @change="toggleProject(project.id)"
              class="checkbox-input"
            />
            <span class="project-name">{{ project.name }}</span>
            <span class="project-meta">{{ project.widgets.length }} 个组件</span>
          </label>
        </div>
        <p v-if="projects.length === 0" class="empty-text">暂无项目可导出</p>
      </div>
      <div class="modal-footer export-footer">
        <button class="btn btn-secondary" @click="handleClose">取消</button>
        <button
          class="btn btn-save"
          :disabled="!hasSelection"
          @click="handleExport"
          title="由浏览器自动下载到默认下载目录"
        >
          ⬇ 导出选中项目
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

.checkbox-input {
  accent-color: #1890ff;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.select-all-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0 10px 0;
  border-bottom: 1px solid #f0f0f0;
  margin-bottom: 8px;
}

.select-all-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  color: #666;
}

.select-all-text {
  user-select: none;
}

.selected-count {
  font-size: 12px;
  color: #1890ff;
  font-weight: 500;
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
  transition: all 0.2s, transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn:active:not(:disabled) {
  transform: scale(0.93);
}

.btn-secondary {
  background: #f0f0f0;
  color: #666;
}

.btn-secondary:hover:not(:disabled) {
  background: #e0e0e0;
}

.btn-save {
  background: #52c41a;
  color: #fff;
}

.btn-save:hover:not(:disabled) {
  background: #73d13d;
}
</style>