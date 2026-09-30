/**
 * 检查更新弹窗组件
 * 用户点击"检查更新"按钮后显示，检查 GitHub 是否有新版本
 *
 * 动画逻辑：
 * 1. onBeforeLeave 锁定当前尺寸（宽/高/最大宽）为内联样式
 * 2. onEnter 同步测量新内容高度，恢复锁定尺寸，然后触发 CSS transition
 * 3. onAfterEnter 清理 flex 布局样式（小状态），保留宽高内联值
 *
 * 尺寸规则：
 * - 检查中 / 已是最新 / 检查失败 → 340px 宽，高度自适应
 * - 检测到新版本 → 660px 宽，90vh 高，flex 布局
 */
<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { checkForUpdates, getVersionTypeLabel, type ReleaseInfo } from '@/utils/updateChecker'

const emit = defineEmits<{
  (e: 'close'): void
}>()

const state = ref<'checking' | 'latest' | 'hasUpdate' | 'error'>('checking')
const latestRelease = ref<ReleaseInfo | null>(null)
const currentVersion = ref('')
const versionType = ref('')
const errorMessage = ref('')

const mirroredBody = computed(() => {
  const body = latestRelease.value?.body
  if (!body) return ''
  return body
    .replace(/https:\/\/github\.com\//g, 'https://ghproxy.com/https://github.com/')
    .replace(/https:\/\/raw\.githubusercontent\.com\//g, 'https://ghproxy.com/https://raw.githubusercontent.com/')
})

const canClose = ref(false)
const closing = ref(false)
const modalRef = ref<HTMLElement | null>(null)
const prevState = ref<'checking' | 'latest' | 'hasUpdate' | 'error'>('checking')

watch(state, (_newVal, oldVal) => {
  prevState.value = (oldVal as typeof prevState.value) || 'checking'
})

const modalStyle = computed(() => ({}))

/* ========== 动画钩子 ========== */

function onBeforeLeave() {
  const el = modalRef.value
  if (!el) return
  el.style.width = el.offsetWidth + 'px'
  el.style.maxWidth = el.offsetWidth + 'px'
  el.style.height = el.offsetHeight + 'px'
  el.offsetHeight
}

function onEnter() {
  const el = modalRef.value
  if (!el) return
  const body = el.querySelector('.update-body') as HTMLElement

  if (state.value === 'hasUpdate') {
    setupHasUpdate(el, body)
    el.style.removeProperty('transition')
    el.style.maxWidth = '660px'
    el.style.width = '660px'
    el.style.height = '90vh'
    return
  }

  if (prevState.value === 'hasUpdate') {
    const lockedW = el.style.width
    const lockedH = el.style.height
    const lockedMaxW = el.style.maxWidth

    el.style.transition = 'none'
    resetFlex(el, body)
    el.style.height = lockedH
    el.offsetHeight

    setTimeout(() => {
      el.style.maxWidth = '340px'
      el.style.width = '340px'
      el.style.height = ''
      const naturalH = el.scrollHeight

      el.style.maxWidth = lockedMaxW
      el.style.width = lockedW
      el.style.height = lockedH
      el.offsetWidth
      el.offsetHeight
      el.style.removeProperty('transition')

      el.style.maxWidth = '340px'
      el.style.width = '340px'
      el.style.height = naturalH + 'px'
    }, 50)
    return
  }

  const lockedH = el.style.height

  el.style.transition = 'none'
  resetFlex(el, body)
  el.style.maxWidth = '340px'
  el.style.width = '340px'
  el.style.height = lockedH
  el.offsetHeight

  setTimeout(() => {
    el.style.height = ''
    const naturalH = el.scrollHeight
    el.style.height = lockedH
    el.offsetHeight
    el.style.removeProperty('transition')

    el.style.maxWidth = '340px'
    el.style.width = '340px'
    el.style.height = naturalH + 'px'
  }, 50)
}

function onAfterEnter() {
  const el = modalRef.value
  if (!el) return
  if (state.value !== 'hasUpdate') {
    el.style.transition = 'none'
    el.style.display = ''
    el.style.flexDirection = ''
    const body = el.querySelector('.update-body') as HTMLElement
    if (body) resetBodyFlex(body)
  }
}

/* ========== 辅助函数 ========== */

function resetFlex(el: HTMLElement, body: HTMLElement | null) {
  el.style.display = ''
  el.style.flexDirection = ''
  if (body) resetBodyFlex(body)
}

function resetBodyFlex(body: HTMLElement) {
  body.style.flex = ''
  body.style.minHeight = ''
  body.style.display = ''
  body.style.flexDirection = ''
  body.style.paddingTop = ''
  body.style.paddingBottom = ''
  body.style.marginBottom = ''
  body.style.paddingLeft = ''
  body.style.paddingRight = ''
}

function setupHasUpdate(el: HTMLElement, body: HTMLElement | null) {
  el.style.display = 'flex'
  el.style.flexDirection = 'column'
  if (body) {
    body.style.flex = '1'
    body.style.minHeight = '0'
    body.style.display = 'flex'
    body.style.flexDirection = 'column'
    body.style.paddingTop = '8px'
    body.style.paddingBottom = '4px'
    body.style.marginBottom = '0'
    body.style.paddingLeft = '12px'
    body.style.paddingRight = '12px'
  }
}

onMounted(async () => {
  const el = modalRef.value
  if (el) {
    el.style.width = '340px'
    el.style.maxWidth = '340px'
  }
  await doCheck()
  canClose.value = true
})

async function doCheck() {
  state.value = 'checking'
  latestRelease.value = null
  errorMessage.value = ''
  
  const startTime = Date.now()
  const result = await checkForUpdates()
  
  const elapsed = Date.now() - startTime
  const minDelay = 700
  if (elapsed < minDelay) {
    await new Promise(resolve => setTimeout(resolve, minDelay - elapsed))
  }

  if (result.hasUpdate && result.latestRelease) {
    state.value = 'hasUpdate'
    latestRelease.value = result.latestRelease
    currentVersion.value = result.currentVersion
    versionType.value = getVersionTypeLabel(result.versionType)
  } else if (result.error) {
    state.value = 'error'
    errorMessage.value = result.error
  } else {
    state.value = 'latest'
    currentVersion.value = result.currentVersion
    versionType.value = getVersionTypeLabel(result.versionType)
  }
}

function handleClose() {
  if (closing.value) return
  if (state.value !== 'checking' && !canClose.value) return
  closing.value = true
  setTimeout(() => {
    emit('close')
  }, 250)
}
</script>

<template>
  <div class="modal-overlay" :class="{ closing: closing }" @click.self="handleClose">
    <div class="modal-content update-modal" ref="modalRef" :style="modalStyle">

      <div class="modal-body update-body">
        <Transition name="state" mode="out-in" @before-leave="onBeforeLeave" @enter="onEnter" @after-enter="onAfterEnter">
          <!-- 检查中 -->
          <div v-if="state === 'checking'" key="checking" class="update-state checking">
            <div class="spinner"></div>
            <p>正在检查更新...</p>
          </div>

          <!-- 已是最新版本 -->
          <div v-else-if="state === 'latest'" key="latest" class="update-state latest">
            <div class="update-icon-wrap success">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
            </div>
            <p class="update-state-title">已是最新版本</p>
            <p class="update-state-version">当前{{ versionType }}: {{ currentVersion }}</p>
          </div>

          <!-- 发现新版本 -->
          <div v-else-if="state === 'hasUpdate' && latestRelease" key="hasUpdate" class="update-state has-update">
            <div class="update-top">
              <div class="update-icon-wrap new">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                </svg>
              </div>
              <p class="update-state-title">有新版本! q(≧▽≦q)</p>
              <p class="update-state-new-version">{{ latestRelease.version }}</p>
              <p class="update-state-current">当前{{ versionType }}: {{ currentVersion }}</p>
            </div>
            <div v-if="latestRelease.body" class="update-body-content">
              <pre class="release-body">{{ mirroredBody }}</pre>
            </div>
            <p class="update-hint">请运行文件中的 <span class="bat-highlight">一键更新.bat</span> 进行更新</p>
          </div>

          <!-- 检查失败 -->
          <div v-else-if="state === 'error'" key="error" class="update-state error">
            <div class="update-icon-wrap error-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
            </div>
            <p class="update-state-title">检查失败</p>
            <p class="update-state-error">{{ errorMessage }}</p>
          </div>
        </Transition>
      </div>

      <div class="modal-footer update-footer">
        <Transition name="state" mode="out-in" appear>
          <div v-if="state === 'checking'" key="checking-footer"></div>
          <div v-else-if="state === 'latest'" key="latest" class="footer-btns">
            <button class="btn btn-secondary" @click="doCheck">重新检查</button>
            <button class="btn btn-primary" style="margin-left: 8px;" @click="handleClose">OK啦(‾◡◝)</button>
          </div>
          <div v-else-if="state === 'hasUpdate'" key="hasUpdate" class="footer-btns">
            <button class="btn btn-secondary" @click="doCheck">重新检查</button>
            <button class="btn btn-primary" style="margin-left: 8px;" @click="handleClose">OK啦(‾◡◝)</button>
          </div>
          <div v-else-if="state === 'error'" key="error" class="footer-btns">
            <button class="btn btn-secondary" @click="doCheck">重新检查</button>
            <button class="btn btn-primary" style="margin-left: 8px;" @click="handleClose">OK啦(‾◡◝)</button>
          </div>
        </Transition>
      </div>
    </div>
  </div>
</template>

<style scoped>
.update-modal {
  background: linear-gradient(160deg, #050d18 0%, #0e162c 20%, #121d32 38%, #15253a 52%, #162d3e 65%, #142638 78%, #0f1c2a 90%, #08101a 100%);
  border: 1px solid rgba(0, 210, 255, 0.22);
  border-radius: 14px;
  padding: 0;
  transition: width 0.25s ease, max-width 0.25s ease, height 0.25s ease;
  overflow: hidden;
  min-width: 0;
  animation: none;
  box-shadow:
    0 8px 40px rgba(0, 0, 0, 0.55),
    0 0 28px rgba(0, 200, 255, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.update-body {
  padding: 24px 24px;
  text-align: center;
}

.update-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.update-state.has-update {
  flex: 1;
  min-height: 0;
  height: 100%;
  gap: 8px;
}

.update-top {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.update-state.has-update .update-icon-wrap {
  margin-bottom: 0;
}

.spinner {
  width: 42px;
  height: 42px;
  border: 3.5px solid rgba(0, 200, 255, 0.15);
  border-top-color: #00c8ff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.update-icon-wrap {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
}

.update-icon-wrap svg {
  width: 28px;
  height: 28px;
}

.update-icon-wrap.success {
  background: rgba(0, 200, 100, 0.15);
  color: #00c864;
}

.update-icon-wrap.new {
  background: rgba(0, 200, 255, 0.15);
  color: #fff;
  animation: pulse-glow 2s ease-in-out infinite;
}

@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.25); }
  50% { box-shadow: 0 0 0 12px rgba(255, 255, 255, 0); }
}

.update-icon-wrap.error-icon {
  background: rgba(231, 76, 60, 0.15);
  color: #e74c3c;
}

.checking p {
  color: #8899aa;
  font-size: 16px;
}

.update-state.checking {
  padding-top: 48px;
  padding-bottom: 8px;
}

.update-state-title {
  font-size: 16px;
  font-weight: 600;
  color: #eaf4ff;
  margin: 0;
}

.update-state.latest .update-state-title {
  color: #00c8ff;
}

.update-state.has-update .update-state-title {
  color: #00c8ff;
}

.update-state-version {
  font-size: 13px;
  color: #8899aa;
  margin: 0;
}

.update-state-new-version {
  font-size: 28px;
  font-weight: 700;
  color: #fff;
  margin: 0;
  letter-spacing: 1px;
}

.update-state-current {
  font-size: 13px;
  color: #8899aa;
  margin: 0;
}

.update-state-error {
  font-size: 13px;
  color: #e74c3c;
  margin: 0;
}

.update-footer {
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.footer-btns {
  display: flex;
  justify-content: center;
  padding: 16px 24px;
}

.update-hint {
  font-size: 13px;
  color: #8899aa;
  margin: 8px 0 0;
  line-height: 1.6;
  text-align: center;
  flex-shrink: 0;
}

.bat-highlight {
  color: #00c8ff;
  font-weight: 600;
  background: rgba(0, 200, 255, 0.15);
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
}

.btn {
  padding: 8px 24px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.btn-primary {
  background: rgba(0, 200, 255, 0.2);
  color: #00c8ff;
}

.btn-primary:hover {
  background: rgba(0, 200, 255, 0.35);
  box-shadow: 0 0 12px rgba(0, 200, 255, 0.3);
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.06);
  color: #8899aa;
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #aabbcc;
}

/* ========== 状态切换动画 ========== */
.state-enter-active {
  transition: opacity 0.4s ease, transform 0.4s ease, filter 0.4s ease;
}

.state-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease, filter 0.25s ease;
}

.state-enter-from {
  opacity: 0;
  transform: translateY(12px) scale(0.95);
  filter: blur(8px);
}

.state-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.95);
  filter: blur(8px);
}

.update-body-content {
  margin-top: 12px;
  overflow-y: auto;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 12px;
  text-align: left;
  width: 100%;
  background: rgba(0, 0, 0, 0.15);
}

.update-body-content::-webkit-scrollbar {
  width: 5px;
}

.update-body-content::-webkit-scrollbar-track {
  background: transparent;
}

.update-body-content::-webkit-scrollbar-thumb {
  background: rgba(0, 200, 255, 0.2);
  border-radius: 3px;
}

.update-body-content::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 200, 255, 0.35);
}

.update-state.has-update .update-body-content {
  flex: 1;
  min-height: 0;
  max-height: none;
  margin-top: 8px;
}

.release-body {
  margin: 0;
  font-size: 13px;
  color: #aabbcc;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  line-height: 1.6;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>