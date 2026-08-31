/**
 * 项目管理弹窗组件
 * 提供项目列表的创建、选择、查看、删除操作
 */
<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import type { Project } from '../types'

const props = defineProps<{
  projects: Project[]
  triggerCreateCount: number
}>()

const emit = defineEmits<{
  create: [name: string]
  select: [id: string]
  view: [id: string]
  delete: [id: string]
  rename: [id: string, newName: string]
  reorder: [fromIndex: number, toIndex: number]
}>()

const showCreateModal = ref(false)
const newProjectName = ref('')
const deleteConfirmProjectId = ref<string | null>(null)
const isHoveringProject = ref(false)

const showRenameModal = ref(false)
const renameProjectId = ref<string | null>(null)
const renameProjectName = ref('')
const isRenameModalClosing = ref(false)

/** 检查重命名时输入的名称是否冲突（排除自身） */
const renameNameConflict = computed(() => {
  const name = renameProjectName.value.trim()
  if (!name) return null
  const found = props.projects.find(
    p => p.name.toLowerCase() === name.toLowerCase() && p.id !== renameProjectId.value
  )
  return found || null
})

/** 检查当前输入的项目名称是否已存在（忽略大小写） */
const nameConflict = computed(() => {
  const name = newProjectName.value.trim()
  if (!name) return null
  const found = props.projects.find(
    p => p.name.toLowerCase() === name.toLowerCase()
  )
  return found || null
})

const isCreateModalClosing = ref(false)
const isDeleteModalClosing = ref(false)

// 长按拖拽排序
const dragState = ref<'idle' | 'pressing' | 'dragging'>('idle')
const draggedIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)
const dragOverPosition = ref<'top' | 'bottom'>('top')
const longPressTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const dragStartY = ref(0)
const justFinishedDrag = ref(false)
const dragOffsetY = ref(0)
const animatingIndex = ref<number | null>(null)
let dragEl: HTMLElement | null = null

const onProjectEnter = () => {
  isHoveringProject.value = true
}

const onProjectLeave = () => {
  isHoveringProject.value = false
}

const canInteract = () => {
  return !justFinishedDrag.value
}

const handleCreate = () => {
  const name = newProjectName.value.trim()
  if (!name || nameConflict.value) return
  isCreateModalClosing.value = true
  setTimeout(() => {
    emit('create', name)
    newProjectName.value = ''
    showCreateModal.value = false
    isCreateModalClosing.value = false
  }, 200)
}

const openCreateModal = () => {
  newProjectName.value = ''
  showCreateModal.value = true
  isCreateModalClosing.value = false
}

const closeCreateModal = () => {
  isCreateModalClosing.value = true
  setTimeout(() => {
    showCreateModal.value = false
    isCreateModalClosing.value = false
  }, 200)
}

const confirmDelete = () => {
  if (deleteConfirmProjectId.value) {
    const id = deleteConfirmProjectId.value
    isDeleteModalClosing.value = true
    
    setTimeout(() => {
      // 关闭弹窗
      deleteConfirmProjectId.value = null
      isDeleteModalClosing.value = false
      
      // 找到要删除的项目元素并播放动画
      const projectEl = document.querySelector(`[data-project-id="${id}"]`) as HTMLElement
      
      if (projectEl) {
        // 手动 FLIP：记录其他项目的位置
        const container = projectEl.parentElement
        const siblings = Array.from(container?.children || []) as HTMLElement[]
        const siblingPositions = new Map<HTMLElement, number>()
        
        siblings.forEach(el => {
          if (el !== projectEl) {
            siblingPositions.set(el, el.getBoundingClientRect().top)
          }
        })
        
        // 播放删除动画
        const animation = projectEl.animate([
          { opacity: 1, transform: 'scale(1)', boxShadow: '0 0 0 0px transparent' },
          { opacity: 0, transform: 'scale(0.9)', boxShadow: '0 0 0 3px #ef5350, 0 8px 24px rgba(239, 83, 80, 0.4)' }
        ], {
          duration: 350,
          easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
          fill: 'forwards'
        })
        
        animation.onfinish = () => {
          // 先手动隐藏被删除的元素，避免闪现
          projectEl.style.display = 'none'
          
          // 从数组中移除项目
          emit('delete', id)
          
          // 下一帧执行 FLIP 动画
          requestAnimationFrame(() => {
            siblingPositions.forEach((oldTop, el) => {
              // 跳过已经被隐藏的元素
              if (el.style.display === 'none') return
              
              const newTop = el.getBoundingClientRect().top
              const diff = oldTop - newTop
              
              if (Math.abs(diff) > 1) {
                // 取消任何正在进行的动画
                el.getAnimations().forEach(a => a.cancel())
                
                // 完全重置样式
                el.style.transform = ''
                el.style.transition = ''
                el.style.animation = 'none'
                
                // 强制重排
                el.offsetHeight
                
                // 使用 Web Animations API 而不是 CSS transition
                el.animate([
                  { transform: `translateY(${diff}px)` },
                  { transform: 'translateY(0)' }
                ], {
                  duration: 350,
                  easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                  fill: 'forwards'
                })
              }
            })
          })
        }
      } else {
        emit('delete', id)
      }
    }, 200)
  }
}

const cancelDelete = () => {
  isDeleteModalClosing.value = true
  setTimeout(() => {
    deleteConfirmProjectId.value = null
    isDeleteModalClosing.value = false
  }, 200)
}

// 监听来自 Header 的触发信号
watch(() => props.triggerCreateCount, () => {
  openCreateModal()
})

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const handleView = (projectId: string) => {
  emit('view', projectId)
}

const handleDelete = (projectId: string) => {
  deleteConfirmProjectId.value = projectId
  isDeleteModalClosing.value = false
}

const openRenameModal = (projectId: string, currentName: string) => {
  renameProjectId.value = projectId
  renameProjectName.value = currentName
  showRenameModal.value = true
  isRenameModalClosing.value = false
}

const closeRenameModal = () => {
  isRenameModalClosing.value = true
  setTimeout(() => {
    showRenameModal.value = false
    renameProjectId.value = null
    renameProjectName.value = ''
    isRenameModalClosing.value = false
  }, 200)
}

const handleRename = () => {
  const name = renameProjectName.value.trim()
  if (!name || renameNameConflict.value || !renameProjectId.value) return
  isRenameModalClosing.value = true
  setTimeout(() => {
    emit('rename', renameProjectId.value!, name)
    showRenameModal.value = false
    renameProjectId.value = null
    renameProjectName.value = ''
    isRenameModalClosing.value = false
  }, 200)
}

// 长按拖拽排序

const handlePointerMove = (clientY: number) => {
  if (dragState.value === 'pressing') {
    if (Math.abs(clientY - dragStartY.value) > 20) {
      cancelDrag()
    }
    return
  }
  if (dragState.value !== 'dragging' || draggedIndex.value === null) return
  
  const offset = clientY - dragStartY.value
  if (dragEl) {
    dragEl.style.setProperty('transform', `translateY(${offset}px)`, 'important')
  }
  
  const items = document.querySelectorAll('.project-item')
  const total = items.length
  let hoveredIndex: number | null = null
  let position: 'top' | 'bottom' = 'top'
  
  for (let i = 0; i < total; i++) {
    if (i === draggedIndex.value) continue
    const rect = items[i].getBoundingClientRect()
    if (clientY < rect.top) {
      hoveredIndex = i
      position = 'top'
      break
    }
    if (clientY < rect.bottom) {
      hoveredIndex = i
      const midY = rect.top + rect.height / 2
      position = clientY < midY ? 'top' : 'bottom'
      break
    }
  }
  
  if (hoveredIndex === null) {
    for (let i = total - 1; i >= 0; i--) {
      if (i === draggedIndex.value) continue
      hoveredIndex = i
      position = 'bottom'
      break
    }
  }
  
  if (hoveredIndex !== null) {
    dragOverIndex.value = hoveredIndex
    dragOverPosition.value = position
  }
}

const finishDrag = () => {
  if (dragState.value !== 'dragging' || draggedIndex.value === null) {
    cancelDrag()
    return
  }
  
  const fromIndex = draggedIndex.value
  const neighborIndex = dragOverIndex.value
  const adjustedNeighbor = neighborIndex !== null && neighborIndex > fromIndex ? neighborIndex - 1 : (neighborIndex ?? fromIndex)
  const toIndex = dragOverPosition.value === 'top' ? adjustedNeighbor : adjustedNeighbor + 1
  
  const el = dragEl
  const savedRect = el ? el.getBoundingClientRect() : null

  if (el) {
    el.animate([
      { opacity: '1' },
      { opacity: '0' }
    ], {
      duration: 150,
      easing: 'ease-out',
      fill: 'forwards'
    })
  }

  if (longPressTimer.value) {
    clearTimeout(longPressTimer.value)
    longPressTimer.value = null
  }
  dragEl = null
  dragState.value = 'idle'
  draggedIndex.value = null
  dragOverIndex.value = null
  dragOverPosition.value = 'top'
  dragOffsetY.value = 0
  document.body.style.userSelect = ''
  
  if (fromIndex !== toIndex) {
    emit('reorder', fromIndex, toIndex)
  }
  
  justFinishedDrag.value = true
  setTimeout(() => { justFinishedDrag.value = false }, 300)
  
  const otherItems: { el: HTMLElement; top: number }[] = []
  document.querySelectorAll('.project-item').forEach((item) => {
    const elItem = item as HTMLElement
    if (elItem === el) return
    otherItems.push({ el: elItem, top: elItem.getBoundingClientRect().top })
  })
  
  const animatingToIndex = toIndex
  animatingIndex.value = animatingToIndex
  
  nextTick(() => {
    requestAnimationFrame(() => {
      if (el && savedRect) {
        el.style.transition = 'none'
        el.style.transform = ''
        el.style.opacity = '0'
        const rect = el.getBoundingClientRect()
        const offset = savedRect.top - rect.top
        
        el.style.visibility = ''
        const moveAnimation = el.animate([
          { transform: `translateY(${offset}px) scale(0.92)`, opacity: '0', boxShadow: '0 0 0 0px #42a5f5, 0 8px 24px rgba(66, 165, 245, 0)' },
          { transform: 'translateY(0) scale(1)', opacity: '1', boxShadow: '0 0 0 2px #42a5f5, 0 8px 24px rgba(66, 165, 245, 0.25)' }
        ], {
          duration: 400,
          easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
          fill: 'forwards'
        })
        
        moveAnimation.onfinish = () => {
          el.style.transform = ''
          el.style.opacity = ''
          
          const fadeOutAnimation = el.animate([
            { boxShadow: '0 0 0 2px #42a5f5, 0 8px 24px rgba(66, 165, 245, 0.25)' },
            { boxShadow: '0 0 0 0px #42a5f5, 0 8px 24px rgba(66, 165, 245, 0)' }
          ], {
            duration: 300,
            easing: 'ease-out',
            fill: 'forwards'
          })
          
          fadeOutAnimation.onfinish = () => {
            animatingIndex.value = null
          }
        }
      }
      
      otherItems.forEach(({ el: itemEl, top: savedTop }) => {
        const rectAfter = itemEl.getBoundingClientRect()
        const diff = rectAfter.top - savedTop
        if (Math.abs(diff) > 1) {
          itemEl.animate([
            { transform: `translateY(${-diff}px)` },
            { transform: 'translateY(0)' }
          ], {
            duration: 400,
            easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
            fill: 'forwards'
          })
        }
      })
    })
  })
}

const cancelDrag = () => {
  if (longPressTimer.value) {
    clearTimeout(longPressTimer.value)
    longPressTimer.value = null
  }
  const el = dragEl
  dragEl = null
  if (el) {
    el.style.transform = ''
    el.style.transition = ''
    el.style.opacity = ''
    el.style.visibility = ''
  }
  dragState.value = 'idle'
  draggedIndex.value = null
  dragOverIndex.value = null
  dragOverPosition.value = 'top'
  document.body.style.userSelect = ''
}

const onMouseDown = (e: MouseEvent, index: number) => {
  if (dragState.value !== 'idle') return
  e.preventDefault()
  const target = e.currentTarget as HTMLElement
  dragState.value = 'pressing'
  dragStartY.value = e.clientY
  
  longPressTimer.value = setTimeout(() => {
    dragState.value = 'dragging'
    draggedIndex.value = index
    dragOverIndex.value = index
    dragOverPosition.value = 'top'
    dragOffsetY.value = 0
    document.body.style.userSelect = 'none'
    dragEl = target
    if (dragEl) {
      dragEl.getAnimations().forEach(a => a.cancel())
      dragEl.style.setProperty('transition', 'none', 'important')
      dragEl.style.setProperty('animation', 'none', 'important')
      dragEl.style.setProperty('transform', 'translateY(0px)', 'important')
    }
  }, 300)
}

const onMouseMove = (e: MouseEvent) => {
  handlePointerMove(e.clientY)
}

const onMouseUp = () => {
  finishDrag()
}

onMounted(() => {
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
})

onUnmounted(() => {
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
  cancelDrag()
})
</script>

<template>
  <div class="project-manager">
    <div class="drag-hint-bar" :class="{ visible: isHoveringProject }">长按拖动项目可改变位置</div>
    <div class="project-list-container">
      <TransitionGroup name="project-list" tag="div" class="projects-wrapper" appear>
        <div
          v-for="(project, index) in projects"
          :key="project.id"
          class="project-item"
          :class="{
            'drag-pressing': dragState === 'pressing' && draggedIndex === null,
            'dragging': dragState === 'dragging' && draggedIndex === index,
            'animating': animatingIndex === index,
            'drag-over-top': dragState === 'dragging' && dragOverIndex === index && dragOverPosition === 'top' && draggedIndex !== index,
            'drag-over-bottom': dragState === 'dragging' && dragOverIndex === index && dragOverPosition === 'bottom' && draggedIndex !== index,
          }"
          :style="{ 
            animationDelay: index * 0.08 + 's',
          }"
          @mousedown.prevent="onMouseDown($event, index)"
          @mouseenter="onProjectEnter"
          @mouseleave="onProjectLeave"
          :data-project-id="project.id"
        >
          <div class="project-info" @click="canInteract() && emit('select', project.id)">
            <h3>{{ project.name }}</h3>
            <p>最后修改: {{ formatDate(project.updatedAt) }} · {{ project.widgets.length }} 个组件</p>
            <div class="project-info-hover">
              <div class="hover-rename" @click.stop="canInteract() && openRenameModal(project.id, project.name)">
                ——修改项目名称——
              </div>
              <div class="hover-edit">
                ——点击进入编辑模式——
              </div>
            </div>
          </div>
          <div class="project-actions" v-if="dragState !== 'dragging' || draggedIndex !== index">
            <button class="action-btn edit-btn" @click.stop="canInteract() && emit('select', project.id)">
              编辑
            </button>
            <button class="action-btn view-btn" @click.stop="canInteract() && handleView(project.id)">
              查看
            </button>
            <button class="action-btn delete-btn" @click.stop="canInteract() && handleDelete(project.id)">
              删除
            </button>
          </div>
        </div>
      </TransitionGroup>
      
      <div v-if="projects.length === 0" class="empty-state">
        <p>暂无项目</p>
        <p style="font-size: 12px; margin-top: 8px;">点击上方按钮创建新项目</p>
      </div>
    </div>
    
    <div v-if="showCreateModal" class="modal-overlay" :class="{ closing: isCreateModalClosing }" @click.self="closeCreateModal">
      <div class="modal-content">
        <div class="modal-header">
          <h2>新建项目</h2>
          <button class="close-btn" @click="closeCreateModal">×</button>
        </div>
        <div class="modal-body">
          <div class="config-item">
            <label>项目名称</label>
            <input
              v-model="newProjectName"
              type="text"
              placeholder="请输入项目名称"
              @keyup.enter="handleCreate"
              :class="{ 'input-error': nameConflict }"
            />
            <p v-if="nameConflict" class="error-text">已存在同名项目「{{ nameConflict.name }}」，请换一个名称</p>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeCreateModal">取消</button>
          <button class="btn btn-success" :disabled="!newProjectName.trim() || !!nameConflict" @click="handleCreate">创建</button>
        </div>
      </div>
    </div>

    <div v-if="deleteConfirmProjectId" class="modal-overlay" :class="{ closing: isDeleteModalClosing }" @click.self="cancelDelete">
      <div class="modal-content">
        <div class="modal-header">
          <h2>确认删除</h2>
          <button class="close-btn" @click="cancelDelete">×</button>
        </div>
        <div class="modal-body">
          <p>确定要删除该项目吗？此操作无法撤销。</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="cancelDelete">取消</button>
          <button class="btn btn-danger" @click="confirmDelete">确认删除</button>
        </div>
      </div>
    </div>

    <div v-if="showRenameModal" class="modal-overlay" :class="{ closing: isRenameModalClosing }" @click.self="closeRenameModal">
      <div class="modal-content">
        <div class="modal-header">
          <h2>修改项目名称</h2>
          <button class="close-btn" @click="closeRenameModal">×</button>
        </div>
        <div class="modal-body">
          <div class="config-item">
            <label>项目名称</label>
            <input
              v-model="renameProjectName"
              type="text"
              placeholder="请输入新的项目名称"
              @keyup.enter="handleRename"
              :class="{ 'input-error': renameNameConflict }"
            />
            <p v-if="renameNameConflict" class="error-text">已存在同名项目「{{ renameNameConflict.name }}」，请换一个名称</p>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeRenameModal">取消</button>
          <button class="btn btn-warning" :disabled="!renameProjectName.trim() || !!renameNameConflict" @click="handleRename">确认修改</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.project-manager {
  width: 100vw;
  height: calc(100vh - 48px);
  background-color: #f0f2f5;
  padding-top: 20px;
  position: relative;
}

.project-list-container {
  padding: 20px;
  overflow-y: auto;
  height: 100%;
}

.projects-wrapper {
  display: flex;
  flex-direction: column;
  gap: 12px;
  position: relative;
}

.project-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  border-radius: 10px;
  padding: 0;
  overflow: hidden;
  position: relative;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  transition: transform 0.3s ease;
  touch-action: none;
  user-select: none;
}

.project-item.drag-pressing {
  cursor: grab;
}

.project-item.dragging {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  opacity: 0.92;
  animation: none !important;
  transition: none;
  z-index: 9999;
  isolation: isolate;
  will-change: transform;
}

.project-item.animating {
  box-shadow: 0 0 0 0px #ef5350, 0 8px 24px rgba(239, 83, 80, 0);
}

.project-item.drag-over-top {
  overflow: visible;
}
.project-item.drag-over-top::before {
  content: '';
  position: absolute;
  top: -2px;
  left: 8px;
  right: 8px;
  height: 4px;
  background: #ff9800;
  border-radius: 2px;
  z-index: 10;
}

.project-item.drag-over-bottom {
  overflow: visible;
}
.project-item.drag-over-bottom::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 8px;
  right: 8px;
  height: 4px;
  background: #ff9800;
  border-radius: 2px;
  z-index: 10;
}

.project-list-enter-active {
  animation-name: projectFadeIn;
  animation-duration: 0.45s;
  animation-timing-function: cubic-bezier(0.25, 0.46, 0.45, 0.94);
  animation-fill-mode: backwards;
}

@keyframes projectFadeIn {
  from {
    opacity: 0;
    transform: translateY(24px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.project-list-leave-active {
  position: absolute;
  width: 100%;
  transition: opacity 0.35s cubic-bezier(0.34, 1.56, 0.64, 1),
              transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1),
              box-shadow 0.35s ease;
  z-index: 100;
}

.project-list-leave-to {
  opacity: 0;
  transform: scale(0.9) translateX(-20px);
  box-shadow: 0 0 0 3px #ef5350, 0 8px 24px rgba(239, 83, 80, 0.4);
}

.project-list-move {
  transition: transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}



.project-info {
  flex: 1;
  padding: 16px;
  cursor: pointer;
  border: 2px solid transparent;
  border-right: none;
  border-radius: 10px 0 0 10px;
  transition: all 0.2s;
  position: relative;
  overflow: hidden;
}

.project-info:hover {
  background: #f5f9fd;
}



.project-info-hover {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  opacity: 0;
  transition: opacity 0.25s;
  pointer-events: none;
}

.project-info:hover .project-info-hover {
  opacity: 1;
}

.project-item.dragging .project-info-hover {
  opacity: 0 !important;
}

.hover-rename {
  flex: 0 0 25%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 152, 0, 0.08);
  color: #e65100;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 1px;
  white-space: nowrap;
  cursor: pointer;
  pointer-events: auto;
  transition: background 0.2s, transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.hover-rename:hover {
  background: rgba(255, 152, 0, 0.3);
}

.hover-rename:active {
  transform: scale(0.93);
}

.hover-edit {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(92, 156, 230, 0.1);
  color: #5c9ce6;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 1px;
  white-space: nowrap;
  cursor: pointer;
  pointer-events: auto;
  transition: background 0.2s, transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.hover-edit:hover {
  background: rgba(92, 156, 230, 0.22);
}

.hover-edit:active {
  transform: scale(0.95);
}

.project-info h3 {
  font-size: 15px;
  font-weight: 800;
  margin-bottom: 4px;
  color: #333;
}

.project-info p {
  font-size: 12px;
  color: #999;
}

.drag-hint-bar {
  position: absolute;
  top: 14px;
  left: 50%;
  transform: translateX(-50%);
  text-align: center;
  color: #9c27b0;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 1px;
  padding: 0;
  line-height: 1;
  opacity: 0;
  transition: opacity 0.25s;
  z-index: 100;
  pointer-events: none;
  white-space: nowrap;
}

.drag-hint-bar.visible {
  opacity: 1;
}

.project-actions {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-left: 1px solid #eee;
  opacity: 0;
  transition: opacity 0.3s;
}

.project-item:hover .project-actions {
  opacity: 1;
}

.action-btn {
  padding: 6px 12px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s, transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
  font-weight: 500;
}

.action-btn:active {
  transform: scale(0.93);
}

.edit-btn {
  background: #e3f2fd;
  color: #5c9ce6;
}

.edit-btn:hover {
  background: #bbdefb;
}

.view-btn {
  background: #e8f5e9;
  color: #4caf50;
}

.view-btn:hover {
  background: #c8e6c9;
}

.delete-btn {
  background: #ffebee;
  color: #ef5350;
}

.delete-btn:hover {
  background: #ffcdd2;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #999;
}

.empty-state p {
  font-size: 14px;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: #fff;
  border-radius: 10px;
  padding: 24px;
  min-width: 360px;
  max-width: 90vw;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.modal-header h2 {
  font-size: 18px;
  font-weight: 600;
  color: #222;
}

.modal-header .close-btn {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: #999;
  transition: color 0.2s;
}

.modal-header .close-btn:hover {
  color: #555;
}

.modal-body {
  margin-bottom: 20px;
}

.modal-body p {
  color: #666;
  line-height: 1.6;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s, transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.btn:hover {
  opacity: 0.88;
}

.btn:active {
  transform: scale(0.93);
}

.btn-success {
  background-color: #66bb6a;
  color: #fff;
}

.btn-success:disabled {
  background-color: #a5d6a7;
  cursor: not-allowed;
  opacity: 0.7;
}

.btn-danger {
  background-color: #ef5350;
  color: #fff;
}

.btn-secondary {
  background-color: #e8e8e8;
  color: #444;
}

.btn-warning {
  background-color: #ff9800;
  color: #fff;
}

.btn-warning:disabled {
  background-color: #ffcc80;
  cursor: not-allowed;
  opacity: 0.7;
}

.config-item {
  margin-bottom: 16px;
}

.config-item label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: #555;
  font-weight: 500;
}

.config-item input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 13px;
  transition: border-color 0.2s;
}

.config-item input:focus {
  outline: none;
  border-color: #5c9ce6;
}

.config-item input.input-error {
  border-color: #ef5350;
}

.config-item input.input-error:focus {
  border-color: #ef5350;
}

.error-text {
  color: #ef5350;
  font-size: 12px;
  margin-top: 6px;
}
</style>