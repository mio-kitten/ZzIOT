/**
 * 根组件 - 应用主入口
 * 管理全局状态：项目切换、MQTT连接、组件数据流、编辑/查看模式切换
 * 通过 provide/inject 向下传递连接状态和消息发送能力
 */
<script setup lang="ts">
import { ref, reactive, provide, onMounted, onUnmounted, computed, watch, nextTick } from 'vue'
import { useProject } from './composables/useProject'
import { MqttClientWrapper } from './utils/mqttClient'
import type { PlatformConfig, DataPoint, Widget, Project } from './types'
import Header from './components/Header.vue'
import SidebarLeft from './components/SidebarLeft.vue'
import MainCanvas from './components/MainCanvas.vue'
import SidebarRight from './components/SidebarRight.vue'
import PlatformConfigModal from './components/PlatformConfigModal.vue'
import ProjectManager from './components/ProjectManager.vue'
import TopBar from './components/TopBar.vue'
import RippleEffect from './components/RippleEffect.vue'
import NetworkConfigModal from './components/NetworkConfigModal.vue'
import CmdWarningModal from './components/CmdWarningModal.vue'
import ExportModal from './components/ExportModal.vue'
import CheckUpdateModal from './components/CheckUpdateModal.vue'
import UpdateToast from './components/UpdateToast.vue'
import { checkForUpdates, getVersionTypeLabel } from './utils/updateChecker'
import type { RippleItem } from './components/RippleEffect.vue'
import { APP_VERSION } from './version'

const {
  projects,
  currentProject,
  currentProjectId,
  loadProjects,
  createProject,
  updateProject,
  deleteProject,
  reorderProjects,
  setCurrentProject,
  addWidget,
  updateWidget,
  removeWidget,
  savePlatformConfig,
  loadPlatformConfig,
  exportProjects,
  importMultipleProjects,
  importDialog,
  createWidget
} = useProject()

const isConnected = ref(false)
const isConnecting = ref(false)
const showPlatformConfig = ref(false)
const showProjectManager = ref(!currentProjectId.value)
const showNetworkConfig = ref(false)
const showCmdWarning = ref(true)
const showExportModal = ref(false)
const showCheckUpdate = ref(false)
const showUpdateToast = ref(false)
const updateToastType = ref<'update' | 'error'>('update')
const toastData = ref({ versionType: '', newVersion: '', currentVersion: '' })
const noProjectAlert = ref(false)
const triggerCreateCount = ref(0)
const selectedWidgetId = ref<string | null>(null)
const selectedWidget = computed(() => {
  return currentProject.value?.widgets.find((w: Widget) => w.id === selectedWidgetId.value) || undefined
})
const mqttClient = new MqttClientWrapper()
const topicModes = ref<Record<string, string>>({})
const topicOriginalTopics = ref<Record<string, string>>({})
let topicModesInterval: number | null = null

// 白名单：内网模式下只处理数据面板已创建的主题
const allowedTopics = ref<Set<string>>(new Set())
const isInternalMode = ref(false)

const isFullscreen = ref(false)
const showTopBar = ref(false)
const scrollWrapperRef = ref<HTMLElement | null>(null)
let topBarTimeout: number | null = null

// 消息更新防抖延迟（毫秒），避免高频更新导致卡顿
const MESSAGE_UPDATE_DELAY = 300

// 缓存最新的消息数据
const pendingMessages = ref<Map<string, { topic: string; message: string }>>(new Map())
let flushTimer: ReturnType<typeof setTimeout> | null = null

// 批量刷新消息数据
const flushPendingMessages = () => {
  if (pendingMessages.value.size === 0) return
  
  pendingMessages.value.forEach(({ topic, message }) => {
    processMessage(topic, message)
  })
  
  pendingMessages.value.clear()
  flushTimer = null
}

// 快捷切换项目冷却（0.8s 内禁止重复切换）
const isSwitchCooldown = ref(false)

const handleFullscreenChange = () => {
  if (document.fullscreenElement && isFullscreen.value) {
    // 浏览器已真实进入全屏，调整滚动位置（ResizeObserver 会自动更新绿框）
    const wrap = scrollWrapperRef.value
    if (!wrap) return
    suppressMinimapCancel.value = true
    if (savedViewCenter.value) {
      wrap.scrollLeft = Math.max(0, savedViewCenter.value.x - wrap.clientWidth / 2)
      wrap.scrollTop = Math.max(0, savedViewCenter.value.y - wrap.clientHeight / 2)
      savedViewCenter.value = null
    } else if (currentProject.value) {
      // 降级：从项目管理直接进入全屏时，滚动到画布正中央
      const canvasCenterX = 1500
      const canvasCenterY = 1500
      wrap.scrollLeft = Math.max(0, canvasCenterX - wrap.clientWidth / 2)
      wrap.scrollTop = Math.max(0, canvasCenterY - wrap.clientHeight / 2)
    }
    setTimeout(() => { suppressMinimapCancel.value = false }, 300)
  } else if (!document.fullscreenElement && isFullscreen.value) {
    showTopBar.value = false
    isFullscreen.value = false
    // 安全退出：清除选中组件、确保回到编辑界面
    selectedWidgetId.value = null
    // 关闭内网服务弹窗
    showNetworkConfig.value = false
  }
}

document.addEventListener('fullscreenchange', handleFullscreenChange)

/** 进入全屏前保存编辑模式的视口中心（画布坐标） */
const savedViewCenter = ref<{ x: number; y: number } | null>(null)
/** 进入全屏前保存编辑模式的滚动位置，退出时恢复 */
const savedEditScrollPos = ref<{ left: number; top: number } | null>(null)

/** 全屏（查看模式）时保持与编辑模式相同的视口中心 */
watch(isFullscreen, async (val) => {
  if (val) {
    // 进入全屏：显示小地图 2s（ResizeObserver 会在容器尺寸变化时自动更新绿框）
    await nextTick()
    if (!isFullscreen.value) return
    await new Promise(resolve => requestAnimationFrame(resolve))
    if (!isFullscreen.value) return
    triggerMinimapOnEntry()
    
    // 进入全屏：顶栏自动滑下，停留 2.5s 后上移
    showTopBar.value = true
    if (topBarTimeout) {
      clearTimeout(topBarTimeout)
      topBarTimeout = null
    }
    topBarTimeout = window.setTimeout(() => {
      showTopBar.value = false
    }, 2500)
  } else if (!val && scrollWrapperRef.value) {
    // 退出全屏回到编辑模式：恢复进入前的滚动位置
    await nextTick()
    if (isFullscreen.value) return
    await new Promise(resolve => requestAnimationFrame(resolve))
    if (isFullscreen.value) return
    const wrap = scrollWrapperRef.value
    suppressMinimapCancel.value = true
    if (savedEditScrollPos.value) {
      wrap.scrollLeft = savedEditScrollPos.value.left
      wrap.scrollTop = savedEditScrollPos.value.top
      savedEditScrollPos.value = null
    }
    setTimeout(() => { suppressMinimapCancel.value = false }, 300)
  }
})

const widgetData = reactive<Record<string, Record<string, DataPoint[]>>>({})
const healthCheckInterval = ref<number | null>(null)

const pendingPlatformConfig = ref<PlatformConfig | null>(null)
const defaultPlatformConfig = ref<PlatformConfig | null>(loadPlatformConfig())

// 连接光效管理
const rippleIdCounter = ref(0)
const ripples = ref<RippleItem[]>([])

const triggerRipple = (type: 'success' | 'error') => {
  rippleIdCounter.value++
  const id = rippleIdCounter.value
  ripples.value.push({ id, type })
  // 2.8s 后自动移除（匹配动画时长：1.2s散射 + 1.5s虚化）
  setTimeout(() => {
    ripples.value = ripples.value.filter(r => r.id !== id)
  }, 2800)
}

// 监听连接状态变化 → 触发光效 + 全屏模式自动弹出顶栏
watch(isConnected, (newVal, oldVal) => {
  if (newVal === oldVal) return

  if (newVal && !oldVal) {
    // 从未连接 → 已连接：成功光效
    triggerRipple('success')
  } else if (!newVal && oldVal) {
    // 从已连接 → 未连接：失败光效（包括手动断开）
    triggerRipple('error')
  }

  // 全屏模式下：连接状态变化时强制弹出顶栏
  if (isFullscreen.value) {
    showTopBar.value = true
    if (topBarTimeout) {
      clearTimeout(topBarTimeout)
      topBarTimeout = null
    }
    // 成功连接停留更久（5s），断开连接停留较短（2s）
    const duration = newVal ? 5000 : 2000
    topBarTimeout = window.setTimeout(() => {
      showTopBar.value = false
    }, duration)
  }
})

// 监听连接中状态：连接失败（连接中结束但未连接上）
watch(isConnecting, (newVal, oldVal) => {
  if (oldVal && !newVal && !isConnected.value && !showProjectManager.value) {
    // 连接中结束但未连接上 → 失败光效
    triggerRipple('error')
    // 全屏模式下：强制弹出顶栏
    if (isFullscreen.value) {
      showTopBar.value = true
      if (topBarTimeout) {
        clearTimeout(topBarTimeout)
        topBarTimeout = null
      }
      topBarTimeout = window.setTimeout(() => {
        showTopBar.value = false
      }, 2000)
    }
  }
})

const getAllTopics = (): string[] => {
  if (!currentProject.value) return []
  
  const userTopics = currentProject.value.widgets
    .flatMap((w: Widget) => {
      if (w.type === 'lineChart') {
        const config = w.config as { displayMode: string; topic?: string; themes: { topic: string }[] }
        if (config.displayMode === 'singleTopic') {
          return config.topic ? [config.topic] : []
        } else {
          return config.themes
            .filter(t => t.topic)
            .map(t => t.topic)
        }
      }
      if (w.type === 'switch') {
        const config = w.config as { topic?: string }
        return config.topic ? [config.topic] : []
      }
      if (w.type === 'text') {
        const config = w.config as { topic?: string }
        return config.topic ? [config.topic] : []
      }
      if (w.type === 'textarea') {
        const config = w.config as { themes?: { topic: string }[] }
        if (config.themes) {
          return config.themes
            .filter(t => t.topic)
            .map(t => t.topic)
        }
        return []
      }
      if (w.type === 'barChart') {
        const config = w.config as { topic?: string }
        return config.topic ? [config.topic] : []
      }
      if (w.type === 'miniArea') {
        const config = w.config as { topic?: string }
        return config.topic ? [config.topic] : []
      }
      if (w.type === 'button') {
        const config = w.config as { topic?: string }
        return config.topic ? [config.topic] : []
      }
      if (w.type === 'input') {
        const config = w.config as { topic?: string }
        return config.topic ? [config.topic] : []
      }
      if (w.type === 'slider') {
        const config = w.config as { topic?: string }
        return config.topic ? [config.topic] : []
      }
      if (w.type === 'radio') {
        const config = w.config as { topic?: string }
        return config.topic ? [config.topic] : []
      }
      if (w.type === 'light') {
        const config = w.config as { topic?: string }
        return config.topic ? [config.topic] : []
      }
      return []
    })
  
  // 去重
  const uniqueTopics = [...new Set(userTopics)]
  
  // 只订阅直接主题名（服务端内部会做 Mixly 格式路由）
  return uniqueTopics
}

  let lastTopics = ''

  const updateSubscriptions = () => {
    if (!mqttClient.isConnected()) return
    
    const topics = getAllTopics()
    const topicsStr = topics.sort().join(',')
    
    // 仅在主题真正变化时才重新订阅
    if (topicsStr === lastTopics) return
    
    // 增量更新：只取消不再需要的，只订阅新增的，保持不变的主题不受影响
    const oldTopics = lastTopics ? lastTopics.split(',').filter(Boolean) : []
    const newTopics = topics
    
    const toUnsubscribe = oldTopics.filter(t => !newTopics.includes(t))
    const toSubscribe = newTopics.filter(t => !oldTopics.includes(t))
    
    if (toUnsubscribe.length > 0) {
      mqttClient.unsubscribe(toUnsubscribe)
    }
    if (toSubscribe.length > 0) {
      mqttClient.subscribe(toSubscribe)
    }
    
    lastTopics = topicsStr
    
    // 内网模式下确保白名单更新主题已订阅
    if (isInternalMode.value) {
      mqttClient.subscribe(['$system/topics'])
    }
  }

const showEditor = computed(() => !isFullscreen.value && !showProjectManager.value)
const showProjectSelector = computed(() => !showProjectManager.value)
const showProjectManagerBtn = computed(() => !showProjectManager.value)

/** 按项目ID保存编辑模式退出前的滚动位置 */
const savedScrollPosMap = ref<Map<string, { left: number; top: number }>>(new Map())
/** 全屏模式下的项目滚动位置缓存 */
const savedFullscreenScrollPosMap = ref<Map<string, { left: number; top: number }>>(new Map())

/** 编辑模式：进入时恢复上次位置/初始居中，离开时保存位置 */
watch(showEditor, async (val) => {
  const pid = currentProjectId.value
  if (!pid) return

  if (val) {
    // 进入编辑模式：显示小地图 2s（rAF 等 DOM 布局完成后再算绿框尺寸）
    await nextTick()
    if (!showEditor.value) return
    await new Promise(resolve => requestAnimationFrame(resolve))
    if (!showEditor.value) return
    updateEditorMinimap()
    triggerMinimapOnEntry()
    
    // 进入编辑模式
    const saved = savedScrollPosMap.value.get(pid)
    if (saved) {
      // 有保存的位置则恢复
      await nextTick()
      if (!showEditor.value) return
      requestAnimationFrame(() => {
        if (!showEditor.value) return
        const w = scrollWrapperRef.value
        if (!w) return
        suppressMinimapCancel.value = true
        w.scrollTo({ left: saved.left, top: saved.top, behavior: 'smooth' })
        setTimeout(() => { suppressMinimapCancel.value = false }, 2500)
      })
    } else {
      // 首次进入：滚到画布中心
      await nextTick()
      if (!showEditor.value) return
      requestAnimationFrame(() => {
        if (!showEditor.value) return
        const w = scrollWrapperRef.value
        if (!w) return
        suppressMinimapCancel.value = true
        w.scrollTo({ left: Math.max(0, (w.scrollWidth - w.clientWidth) / 2), top: Math.max(0, (w.scrollHeight - w.clientHeight) / 2), behavior: 'smooth' })
        setTimeout(() => { suppressMinimapCancel.value = false }, 2500)
      })
    }
  } else {
    // 离开编辑模式：按当前项目保存位置
    const wrap = scrollWrapperRef.value
    if (!wrap) return
    savedScrollPosMap.value.set(pid, { left: wrap.scrollLeft, top: wrap.scrollTop })
  }
})

const headerTitle = computed(() => {
  if (!currentProjectId.value || showProjectManager.value) {
    return '项目管理'
  }
  return showEditor.value ? '编辑模式' : '查看模式'
})

const connectToPlatform = async (config: PlatformConfig, isFromProjectSwitch = false) => {
  if (isConnecting.value) return
  
  isConnecting.value = true
  
  try {
    await mqttClient.connect(config)
    
    if (!mqttClient.isConnected()) {
      throw new Error('连接失败')
    }
    
    // 先设置消息回调，避免 isConnected 后到订阅前之间的消息丢失
    mqttClient.setOnMessageCallback((topic: string, message: string) => {
      if (topic === '$system/topics') {
        try {
          const names = JSON.parse(message)
          allowedTopics.value = new Set(names)
        } catch (e) { /* ignore parse error */ }
        return
      }
      handleMessage(topic, message)
    })
    
    isConnected.value = true
    
    // 内网模式：初始化白名单
    isInternalMode.value = config.platform === 'siot' && config.siot.port === 1853
    if (isInternalMode.value) {
      fetchAllowedTopics()
    }
    
    fetchTopicModes()
    if (topicModesInterval) clearInterval(topicModesInterval)
    topicModesInterval = window.setInterval(fetchTopicModes, 5000)
    
    if (!isFromProjectSwitch) {
      const shouldUpdateDefault = checkAndUpdateDefaultConfig(config)
      if (shouldUpdateDefault) {
        defaultPlatformConfig.value = { ...config }
        savePlatformConfig(config)
      }
    }
    
    if (currentProject.value) {
      updateProject(currentProject.value.id, { platformConfig: config })
    }
    
    // 重连后强制重新订阅所有主题
    lastTopics = ''
    updateSubscriptions()
    
    mqttClient.setOnStatusChange((connected) => {
      if (!connected && isConnected.value) {
        isConnected.value = false
        stopHealthCheck()
      }
    })
    
    startHealthCheck()
  } catch (error) {
    console.error('连接失败:', error)
    isConnected.value = false
  } finally {
    isConnecting.value = false
  }
}

const checkAndUpdateDefaultConfig = (config: PlatformConfig): boolean => {
  if (!defaultPlatformConfig.value) return true
  
  if (config.platform !== defaultPlatformConfig.value.platform) {
    const confirmOverride = confirm(`检测到平台配置已更改，是否覆盖默认配置？\n\n当前默认: ${defaultPlatformConfig.value.platform || '未设置'}\n新配置: ${config.platform || '未设置'}`)
    return confirmOverride
  }
  
  if (config.platform === 'siot') {
    const siot = config.siot
    const defaultSiot = defaultPlatformConfig.value.siot
    if (siot.server !== defaultSiot.server || siot.port !== defaultSiot.port ||
        siot.username !== defaultSiot.username || siot.password !== defaultSiot.password) {
      const confirmOverride = confirm(`检测到SIoT配置已更改，是否覆盖默认配置？`)
      return confirmOverride
    }
  } else {
    const bafayun = config.bafayun
    const defaultBafayun = defaultPlatformConfig.value.bafayun
    if (bafayun.server !== defaultBafayun.server || bafayun.port !== defaultBafayun.port ||
        bafayun.privateKey !== defaultBafayun.privateKey) {
      const confirmOverride = confirm(`检测到巴法云配置已更改，是否覆盖默认配置？`)
      return confirmOverride
    }
  }
  
  return true
}

const MAX_DATA_BUFFER = 500

const fetchTopicModes = async () => {
  try {
    const res = await fetch('http://localhost:8080/api/topics/modes?_=' + Date.now(), { cache: 'no-store' })
    const data = await res.json()
    Object.keys(data).forEach(topic => {
      topicModes.value[topic] = data[topic].mode || 'siot'
      topicOriginalTopics.value[topic] = data[topic].originalTopic || ''
    })
  } catch (e) {
    console.warn('获取主题模式失败:', e)
  }
}

const fetchAllowedTopics = async () => {
  try {
    const res = await fetch('http://localhost:8080/api/topics?_=' + Date.now(), { cache: 'no-store' })
    const data = await res.json()
    const names = data.map((t: any) => t.topic).filter((n: string) => n !== '系统信息')
    allowedTopics.value = new Set(names)
  } catch (e) {
    console.warn('获取主题列表失败:', e)
  }
}

const handleMessage = (topic: string, message: string) => {
  if (!isConnected.value) return
  
  // 内网模式：白名单过滤，只处理数据面板已创建的主题
  if (isInternalMode.value) {
    const parts = topic.split('/')
    const userTopic = parts[parts.length - 1]
    if (!allowedTopics.value.has(topic) && !allowedTopics.value.has(userTopic)) return
  }
  
  // 将消息添加到待处理队列（防抖处理）
  pendingMessages.value.set(topic, { topic, message })
  
  // 如果定时器不存在，创建新的定时器批量刷新
  if (!flushTimer) {
    flushTimer = setTimeout(flushPendingMessages, MESSAGE_UPDATE_DELAY)
  }
}

const processMessage = (topic: string, message: string) => {
  // 从 项目ID/用户主题 或 私钥/主题 格式中提取用户主题
  let userTopic = topic
  // 解析主题：Mixly格式是 用户名/项目名/主题（三层），巴法云格式是 私钥/主题（两层），SIoT格式是直接主题名（单层）
  const parts = topic.split('/')
  const isMixlyFormat = parts.length >= 3
  const isBafayunFormat = parts.length === 2
  if (isMixlyFormat || isBafayunFormat) {
    userTopic = parts[parts.length - 1]
  }
  
  // 根据主题模式过滤消息
  // mode 可以是 'siot', 'bafayun', 'mixly'
  // 查找时优先用完整主题名，其次用提取的用户主题名
  const mode = topicModes.value[topic] || topicModes.value[userTopic] || 'siot'
  if (isMixlyFormat && mode !== 'mixly' && mode !== 'bafayun') return
  if (isBafayunFormat && mode !== 'bafayun') return
  if (!isMixlyFormat && !isBafayunFormat && mode !== 'siot') return
  
  // 只要有组件就处理消息，不依赖 currentProject
  const widgets = currentProject.value?.widgets || []
  
  widgets.forEach((widget: Widget) => {
    if (!widgetData[widget.id]) {
      widgetData[widget.id] = {}
    }
    const wd = widgetData[widget.id]

    if (widget.type === 'lineChart') {
      const config = widget.config as { themes: { id: string; topic: string }[]; maxDataPoints: number; displayMode: string; topic?: string }

      if (config.displayMode === 'singleTopic' && config.topic === userTopic) {
        const values = message.split('/')
        for (let index = 0; index < values.length; index++) {
          const lineId = `line-${index + 1}`
          const data = [...(wd[lineId] || [])]
          const numValue = parseFloat(values[index].trim())
          data.push({ timestamp: Date.now(), value: isNaN(numValue) ? 0 : numValue, themeId: lineId })
          if (data.length > MAX_DATA_BUFFER) data.shift()
          wd[lineId] = data
        }
      } else if (config.displayMode === 'multiTopic') {
        const parts = message.split('\\')
        let value: number
        if (parts.length === 2) {
          value = parseFloat(parts[1])
          if (isNaN(value)) return
        } else {
          value = parseFloat(message)
          if (isNaN(value)) return
        }
        const data = [...(wd[userTopic] || [])]
        data.push({ timestamp: Date.now(), value, themeId: userTopic })
        if (data.length > MAX_DATA_BUFFER) data.shift()
        wd[userTopic] = data
      }
    }

    if (widget.type === 'barChart') {
      const config = widget.config as { topic?: string; color?: string; maxDataPoints?: number }
      if (config.topic === userTopic) {
        const value = parseFloat(message)
        if (!isNaN(value)) {
          const data = [...(wd[widget.id] || [])]
          data.push({ timestamp: Date.now(), value, themeId: widget.id })
          if (data.length > MAX_DATA_BUFFER) data.shift()
          wd[widget.id] = data
        }
      }
    }

    if (widget.type === 'miniArea') {
      const config = widget.config as { topic?: string; color?: string; maxDataPoints?: number }
      if (config.topic === userTopic) {
        const value = parseFloat(message)
        if (!isNaN(value)) {
          const data = [...(wd[widget.id] || [])]
          data.push({ timestamp: Date.now(), value, themeId: widget.id })
          if (data.length > MAX_DATA_BUFFER) data.shift()
          wd[widget.id] = data
        }
      }
    }

    if (widget.type === 'text') {
      const config = widget.config as { topic?: string }
      if (config.topic === userTopic) {
        const data = [...(wd[userTopic] || [])]
        data.push({ timestamp: Date.now(), value: 0, themeId: userTopic } as unknown as DataPoint)
        ;(data[data.length - 1] as any).value = message
        if (data.length > MAX_DATA_BUFFER) data.shift()
        wd[userTopic] = data
      }
    }

    if (widget.type === 'textarea') {
      const config = widget.config as { displayMode?: string; topic?: string; themes?: { topic: string }[] }
      if (config.displayMode === 'singleTopic' && config.topic === userTopic) {
        const values = message.split('/')
        for (let index = 0; index < values.length; index++) {
          const lineId = `line-${index + 1}`
          const data = [...(wd[lineId] || [])]
          data.push({ timestamp: Date.now(), value: 0, themeId: lineId } as unknown as DataPoint)
          ;(data[data.length - 1] as any).value = values[index].trim()
          if (data.length > MAX_DATA_BUFFER) data.shift()
          wd[lineId] = data
        }
      } else if (config.themes?.some(t => t.topic === userTopic)) {
        const data = [...(wd[userTopic] || [])]
        data.push({ timestamp: Date.now(), value: 0, themeId: userTopic } as unknown as DataPoint)
        ;(data[data.length - 1] as any).value = message
        if (data.length > MAX_DATA_BUFFER) data.shift()
        wd[userTopic] = data
      }
    }

    if (widget.type === 'switch') {
      const config = widget.config as { topic?: string }
      if (config.topic === userTopic) {
        const data = [...(wd[userTopic] || [])]
        data.push({ timestamp: Date.now(), value: 0, themeId: userTopic } as unknown as DataPoint)
        ;(data[data.length - 1] as any).value = message
        if (data.length > MAX_DATA_BUFFER) data.shift()
        wd[userTopic] = data
      }
    }

    if (widget.type === 'radio') {
      const config = widget.config as { topic?: string }
      if (config.topic === userTopic) {
        const data = [...(wd[userTopic] || [])]
        data.push({ timestamp: Date.now(), value: 0, themeId: userTopic } as unknown as DataPoint)
        ;(data[data.length - 1] as any).value = message
        if (data.length > MAX_DATA_BUFFER) data.shift()
        wd[userTopic] = data
      }
    }

    if (widget.type === 'light') {
      const config = widget.config as { topic?: string }
      if (config.topic === userTopic) {
        const data = [...(wd[userTopic] || [])]
        data.push({ timestamp: Date.now(), value: 0, themeId: userTopic } as unknown as DataPoint)
        ;(data[data.length - 1] as any).value = message
        if (data.length > MAX_DATA_BUFFER) data.shift()
        wd[userTopic] = data
      }
    }
  })
}

const handleSendMessage = (topic: string, message: string) => {
  if (!isConnected.value) return
  // 内网模式：走 HTTP API，让服务端根据主题模式同时发送 SIoT 和 Mixly 格式
  if (isInternalMode.value) {
    fetch(`http://localhost:8080/api/topics/${encodeURIComponent(topic)}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: message })
    }).then(() => {
      console.log(`消息已发送到主题 ${topic}: ${message}`)
    }).catch((e) => {
      console.warn('发送消息失败:', e)
      // 降级：直接通过 MQTT 发送
      if (mqttClient.isConnected()) {
        mqttClient.publish(topic, message)
        console.log(`通过 MQTT 发送到主题 ${topic}: ${message}`)
      }
    })
  } else {
    // 外部平台：直接 MQTT 发送
    mqttClient.publish(topic, message)
    console.log(`消息已发送到主题 ${topic}: ${message}`)
  }
}

const disconnectFromPlatform = () => {
  if (topicModesInterval) {
    clearInterval(topicModesInterval)
    topicModesInterval = null
  }
  mqttClient.disconnect()
  isConnected.value = false
  isConnecting.value = false
  stopHealthCheck()
  lastTopics = ''
}

const startHealthCheck = () => {
  stopHealthCheck()
  healthCheckInterval.value = window.setInterval(() => {
    if (isConnected.value && !mqttClient.isConnected()) {
      console.log('健康检查：MQTT连接已断开')
      isConnected.value = false
      stopHealthCheck()
    }
  }, 5000)
}

const stopHealthCheck = () => {
  if (healthCheckInterval.value) {
    clearInterval(healthCheckInterval.value)
    healthCheckInterval.value = null
  }
}

const handleAddWidget = async (type: string, x: number, y: number) => {
  if (!currentProjectId.value || isFullscreen.value) return
  
  const isDoubleClick = x === -1
  
  // 双击添加时（x = -1）：组件左边缘紧靠侧栏右边缘，y 为鼠标高度
  if (isDoubleClick && scrollWrapperRef.value) {
    const wrap = scrollWrapperRef.value
    const wrapRect = wrap.getBoundingClientRect()
    // x：紧靠侧栏右边缘（即 scrollWrapper 可见区域的最左边）
    x = wrap.scrollLeft
    // y：将鼠标 clientY 转换为画布坐标
    y = wrap.scrollTop + (y - wrapRect.top)
  }
  
  const widget = createWidget(type, x, y)
  
  // 双击添加时：y 上移组件自身高度的一半，使组件中心对准鼠标位置
  if (isDoubleClick) {
    const config = widget.config as { height: number; y: number }
    config.y = y - config.height / 2
  }
  
  // 确保组件不超出画板边界（3000x3000）
  const cfg = widget.config as { x: number; y: number; width: number; height: number }
  cfg.x = Math.max(0, Math.min(cfg.x, 3000 - (cfg.width || 200)))
  cfg.y = Math.max(0, Math.min(cfg.y, 3000 - (cfg.height || 150)))
  
  await addWidget(currentProjectId.value, widget)
  widgetData[widget.id] = {}
}

const handleUpdateWidget = async (widgetId: string, updates: Record<string, unknown>) => {
  if (!currentProjectId.value) return
  await updateWidget(currentProjectId.value, widgetId, updates)
}

const handleRemoveWidget = async (widgetId: string) => {
  if (!currentProjectId.value || isFullscreen.value) return
  await removeWidget(currentProjectId.value, widgetId)
  delete widgetData[widgetId]
}

const handleUpdateWidgetSize = async (widgetId: string, width: number, height: number) => {
  if (!currentProjectId.value) return
  await updateWidget(currentProjectId.value, widgetId, { width, height })
}

const handleSidebarUpdate = (updates: Record<string, unknown>) => {
  if (selectedWidgetId.value) {
    handleUpdateWidget(selectedWidgetId.value, updates)
  }
}

const handleClearWidgetData = (widgetId: string) => {
  widgetData[widgetId] = {}
  // 滑动条清空数据：通过配置传递归中信号
  const widget = currentProject.value?.widgets.find((w: Widget) => w.id === widgetId)
  if (widget?.type === 'slider') {
    handleUpdateWidget(widgetId, { _reset: Date.now() } as any)
  }
}

const handleSelectWidget = (widgetId: string | null) => {
  if (isFullscreen.value) {
    selectedWidgetId.value = null
    return
  }
  selectedWidgetId.value = widgetId
}

const handleCreateProject = (name: string) => {
  const project = createProject(name)
  showProjectManager.value = false
  
  if (pendingPlatformConfig.value) {
    updateProject(project.id, { platformConfig: pendingPlatformConfig.value })
    connectToPlatform(pendingPlatformConfig.value)
    pendingPlatformConfig.value = null
  } else if (defaultPlatformConfig.value) {
    updateProject(project.id, { platformConfig: defaultPlatformConfig.value })
  }
}

/** 滚动到画布正中心 */
const showCenterFlare = ref(false)
const handleScrollToCenter = async () => {
  const wrap = scrollWrapperRef.value
  if (!wrap) return

  cancelMinimapOnEntry()
  isScrollingToCenter.value = true
  updateMinimap()
  if (showEditor.value) updateEditorMinimap()
  await nextTick()

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  const onScroll = () => {
    updateMinimap()
    if (showEditor.value) updateEditorMinimap()
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      isScrollingToCenter.value = false
      wrap.removeEventListener('scroll', onScroll)
    }, 200)
  }
  wrap.addEventListener('scroll', onScroll, { passive: true })

  wrap.scrollTo({
    left: Math.max(0, (wrap.scrollWidth - wrap.clientWidth) / 2),
    top: Math.max(0, (wrap.scrollHeight - wrap.clientHeight) / 2),
    behavior: 'smooth'
  })

  // 安全兜底：3秒后强制隐藏小地图
  setTimeout(() => {
    if (isScrollingToCenter.value) {
      isScrollingToCenter.value = false
      wrap.removeEventListener('scroll', onScroll)
    }
  }, 3000)

  // 触发十字架闪烁动画
  showCenterFlare.value = true
  setTimeout(() => { showCenterFlare.value = false }, 3500)
}

const handleSelectProject = (projectId: string) => {
  // 冷却中禁止切换
  if (isSwitchCooldown.value) return

  // 设置冷却，0.8s 内不允许再次切换
  isSwitchCooldown.value = true
  setTimeout(() => { isSwitchCooldown.value = false }, 800)

  // 统一断开当前连接（无论正在连接还是已连接）
  disconnectFromPlatform()

  setCurrentProject(projectId)
  showProjectManager.value = false

  const newProject = currentProject.value
  if (newProject?.platformConfig) {
    connectToPlatform(newProject.platformConfig, true)
  } else if (defaultPlatformConfig.value) {
    connectToPlatform(defaultPlatformConfig.value, true)
  }
}

const handleViewProject = (projectId: string) => {
  // 冷却中禁止切换
  if (isSwitchCooldown.value) return

  // 设置冷却
  isSwitchCooldown.value = true
  setTimeout(() => { isSwitchCooldown.value = false }, 800)

  // 统一断开当前连接
  disconnectFromPlatform()

  setCurrentProject(projectId)
  showProjectManager.value = false
  isFullscreen.value = true
  
  const container = document.querySelector('.app-container')
  if (container && !document.fullscreenElement) {
    container.requestFullscreen().catch(err => {
      console.error('全屏请求失败:', err)
    })
  }
  
  const project = currentProject.value
  if (project?.platformConfig) {
    connectToPlatform(project.platformConfig, true)
  } else if (defaultPlatformConfig.value) {
    connectToPlatform(defaultPlatformConfig.value, true)
  }
}

const handleDeleteProject = (projectId: string) => {
  deleteProject(projectId)
  if (!currentProjectId.value) {
    showProjectManager.value = true
  }
}

const handleRenameProject = (projectId: string, newName: string) => {
  updateProject(projectId, { name: newName })
}

const handleReorderProjects = (fromIndex: number, toIndex: number) => {
  reorderProjects(fromIndex, toIndex)
}

const handleOpenProjectManager = () => {
  if (isFullscreen.value) {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(err => {
        console.error('退出全屏失败:', err)
      })
    }
    isFullscreen.value = false
    showTopBar.value = false
  }
  showProjectManager.value = true

  // 回到项目管理时，取消正在进行的连接请求（不中断已建立的连接）
  if (isConnecting.value) {
    mqttClient.abortConnect()
    isConnecting.value = false
  }
}

const handleCreateProjectClick = () => {
  triggerCreateCount.value++
}

const handleExportProjects = () => {
  if (projects.value.length === 0) {
    noProjectAlert.value = true
    return
  }
  showExportModal.value = true
}

const handleExportConfirm = async (projects: Project[]) => {
  showExportModal.value = false
  await exportProjects(projects)
}

const handleImportProjects = async (files: FileList) => {
  await importMultipleProjects(files)
}

const handleOpenIoTService = () => {
  showNetworkConfig.value = true
  console.log('handleOpenIoTService called, showNetworkConfig:', showNetworkConfig.value)
}

const handleCloseIoTService = () => {
  showNetworkConfig.value = false
}

provide('openNetworkConfig', handleOpenIoTService)

const toggleFullscreen = () => {
  if (!isFullscreen.value) {
    // 进入全屏前：保存编辑模式的视口中心（画布坐标）和滚动位置
    const wrap = scrollWrapperRef.value
    if (wrap) {
      savedViewCenter.value = {
        x: wrap.scrollLeft + wrap.clientWidth / 2,
        y: wrap.scrollTop + wrap.clientHeight / 2
      }
      savedEditScrollPos.value = {
        left: wrap.scrollLeft,
        top: wrap.scrollTop
      }
    }
    
    isFullscreen.value = true
    selectedWidgetId.value = null
    
    const container = document.querySelector('.app-container')
    if (container && !document.fullscreenElement) {
      container.requestFullscreen().catch(err => {
        console.error('全屏请求失败:', err)
      })
    }
  } else {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(err => {
        console.error('退出全屏失败:', err)
      })
    }
    isFullscreen.value = false
    showTopBar.value = false
  }
}

const handleMouseMove = (e: MouseEvent) => {
  if (!isFullscreen.value) return
  
  if (e.clientY <= 20) {
    showTopBar.value = true
    
    if (topBarTimeout) {
      clearTimeout(topBarTimeout)
      topBarTimeout = null
    }
  } else if (e.clientY > 60) {
    if (topBarTimeout) {
      clearTimeout(topBarTimeout)
    }
    topBarTimeout = window.setTimeout(() => {
      showTopBar.value = false
    }, 500)
  }
}

const handleMouseLeave = () => {
  if (isFullscreen.value && topBarTimeout) {
    clearTimeout(topBarTimeout)
  }
  showTopBar.value = false
}

// 画布拖拽平移（编辑/查看模式）
const isPanning = ref(false)
const isScrollingToCenter = ref(false)
const isWheelScrolling = ref(false)
const justEndedPanning = ref(false)
const showMinimapOnEntry = ref(false)
let minimapEntryTimer: ReturnType<typeof setTimeout> | null = null
const suppressMinimapCancel = ref(false)

/** 触发入口小地图，2s 后自动隐藏，可被用户交互打断 */
const triggerMinimapOnEntry = () => {
  if (minimapEntryTimer) clearTimeout(minimapEntryTimer)
  showMinimapOnEntry.value = true
  minimapEntryTimer = setTimeout(() => {
    showMinimapOnEntry.value = false
    minimapEntryTimer = null
  }, 2000)
}

/** 打断入口小地图（用户开始拖拽/滚动时调用） */
const cancelMinimapOnEntry = () => {
  if (minimapEntryTimer) {
    clearTimeout(minimapEntryTimer)
    minimapEntryTimer = null
  }
  showMinimapOnEntry.value = false
}

const panStart = ref({ mouseX: 0, mouseY: 0, scrollLeft: 0, scrollTop: 0 })

const handleCanvasPanStart = (e: MouseEvent) => {
  if (e.button !== 0) return
  cancelMinimapOnEntry()
  isPanning.value = true
  const wrap = scrollWrapperRef.value
  if (wrap) {
    panStart.value = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      scrollLeft: wrap.scrollLeft,
      scrollTop: wrap.scrollTop
    }
    wrap.style.cursor = 'grabbing'
  }
  updateMinimap()
  if (showEditor.value) updateEditorMinimap()
}

const handleCanvasPanMove = (e: MouseEvent) => {
  if (!isPanning.value) return
  const wrap = scrollWrapperRef.value
  if (!wrap) return
  const dx = e.clientX - panStart.value.mouseX
  const dy = e.clientY - panStart.value.mouseY
  wrap.scrollLeft = panStart.value.scrollLeft - dx
  wrap.scrollTop = panStart.value.scrollTop - dy
  updateMinimap()
  if (showEditor.value) updateEditorMinimap()
}

const handleCanvasPanEnd = () => {
  if (isPanning.value) {
    isPanning.value = false
    justEndedPanning.value = true
    setTimeout(() => { justEndedPanning.value = false }, 150)
    const wrap = scrollWrapperRef.value
    if (wrap) {
      wrap.style.cursor = ''
    }
  }
}

// 滚轮/触控板滚动时触发小地图
let wheelDebounceTimer: ReturnType<typeof setTimeout> | null = null
const handleWheelScroll = () => {
  if (isPanning.value || justEndedPanning.value) return
  if (!suppressMinimapCancel.value) cancelMinimapOnEntry()
  isWheelScrolling.value = true
  updateMinimap()
  if (showEditor.value) updateEditorMinimap()
  if (wheelDebounceTimer) clearTimeout(wheelDebounceTimer)
  wheelDebounceTimer = setTimeout(() => {
    isWheelScrolling.value = false
    wheelDebounceTimer = null
  }, 200)
}

const MINIMAP_SIZE = 180
const CANVAS_SIZE = 3000
const MINIMAP_SCALE = MINIMAP_SIZE / CANVAS_SIZE

const minimapViewportStyle = ref<Record<string, string>>({})

const updateMinimap = () => {
  const wrap = scrollWrapperRef.value
  if (!wrap) return
  const vpLeft = wrap.scrollLeft * MINIMAP_SCALE
  const vpTop = wrap.scrollTop * MINIMAP_SCALE
  const vpWidth = Math.min(wrap.clientWidth * MINIMAP_SCALE, MINIMAP_SIZE)
  const vpHeight = Math.min(wrap.clientHeight * MINIMAP_SCALE, MINIMAP_SIZE)
  minimapViewportStyle.value = {
    left: `${vpLeft}px`,
    top: `${vpTop}px`,
    width: `${vpWidth}px`,
    height: `${vpHeight}px`
  }
}

const minimapWidgetDots = computed(() => {
  const widgets = currentProject.value?.widgets || []
  return widgets.map(w => {
    const cfg = w.config as Record<string, unknown>
    const x = (cfg.x as number) || 0
    const y = (cfg.y as number) || 0
    const ww = (cfg.width as number) || 100
    const wh = (cfg.height as number) || 80
    return {
      id: w.id,
      type: w.type,
      left: `${x * MINIMAP_SCALE}px`,
      top: `${y * MINIMAP_SCALE}px`,
      width: `${Math.max(ww * MINIMAP_SCALE, 3)}px`,
      height: `${Math.max(wh * MINIMAP_SCALE, 3)}px`
    }
  })
})

const EDITOR_MINIMAP_SIZE = 140
const EDITOR_MINIMAP_SCALE = EDITOR_MINIMAP_SIZE / CANVAS_SIZE

const editorMinimapViewport = ref({ left: 0, top: 0, width: 0, height: 0 })

const updateEditorMinimap = () => {
  const wrap = scrollWrapperRef.value
  if (!wrap) return
  editorMinimapViewport.value = {
    left: wrap.scrollLeft * EDITOR_MINIMAP_SCALE,
    top: wrap.scrollTop * EDITOR_MINIMAP_SCALE,
    width: Math.min(wrap.clientWidth * EDITOR_MINIMAP_SCALE, EDITOR_MINIMAP_SIZE),
    height: Math.min(wrap.clientHeight * EDITOR_MINIMAP_SCALE, EDITOR_MINIMAP_SIZE)
  }
}

const editorMinimapWidgetDots = computed(() => {
  const widgets = currentProject.value?.widgets || []
  return widgets.map(w => {
    const cfg = w.config as Record<string, unknown>
    const x = (cfg.x as number) || 0
    const y = (cfg.y as number) || 0
    const ww = (cfg.width as number) || 100
    const wh = (cfg.height as number) || 80
    return {
      id: w.id,
      type: w.type,
      left: `${x * EDITOR_MINIMAP_SCALE}px`,
      top: `${y * EDITOR_MINIMAP_SCALE}px`,
      width: `${Math.max(ww * EDITOR_MINIMAP_SCALE, 2)}px`,
      height: `${Math.max(wh * EDITOR_MINIMAP_SCALE, 2)}px`
    }
  })
})

const handlePlatformConfigConfirm = async (config: PlatformConfig) => {
  if (!currentProject.value) {
    pendingPlatformConfig.value = config
  }
  
  if (currentProject.value) {
    updateProject(currentProject.value.id, { platformConfig: config })
  }
  
  defaultPlatformConfig.value = { ...config }
  savePlatformConfig(config)
  
  showPlatformConfig.value = false
  await connectToPlatform(config)
}

watch(() => currentProjectId.value, async (newId, oldId) => {
  // 切换项目：保存旧项目位置，恢复新项目位置
  if (oldId && newId && newId !== oldId) {
    if (showEditor.value) {
      // 编辑模式：保存旧位置到编辑缓存
      const wrap = scrollWrapperRef.value
      if (wrap) {
        savedScrollPosMap.value.set(oldId, { left: wrap.scrollLeft, top: wrap.scrollTop })
      }
    } else {
      // 全屏模式：保存旧位置到全屏缓存
      const wrap = scrollWrapperRef.value
      if (wrap) {
        savedFullscreenScrollPosMap.value.set(oldId, { left: wrap.scrollLeft, top: wrap.scrollTop })
      }
    }
    
    // 恢复新项目位置
    const saved = showEditor.value
      ? savedScrollPosMap.value.get(newId)
      : savedFullscreenScrollPosMap.value.get(newId)
    await nextTick()
    requestAnimationFrame(() => {
      const w = scrollWrapperRef.value
      if (!w) return
      suppressMinimapCancel.value = true
      if (saved) {
        w.scrollTo({ left: saved.left, top: saved.top, behavior: 'smooth' })
      } else {
        w.scrollTo({ left: Math.max(0, (w.scrollWidth - w.clientWidth) / 2), top: Math.max(0, (w.scrollHeight - w.clientHeight) / 2), behavior: 'smooth' })
      }
      setTimeout(() => { suppressMinimapCancel.value = false }, 2500)
    })
    
    // 切换项目时显示小地图 2s
    if (showEditor.value) updateEditorMinimap()
    else updateMinimap()
    triggerMinimapOnEntry()
  }

  if (newId && newId !== oldId) {
    // 冷却中禁止切换
    if (isSwitchCooldown.value) return

    // 设置冷却
    isSwitchCooldown.value = true
    setTimeout(() => { isSwitchCooldown.value = false }, 800)

    // 统一断开当前连接
    disconnectFromPlatform()

    // 项目管理界面打开时（含首次启动）不自动连接，等用户手动选择项目
    if (showProjectManager.value) return

    const project = projects.value.find((p: Project) => p.id === newId)
    if (project?.platformConfig) {
      connectToPlatform(project.platformConfig, true)
    } else if (defaultPlatformConfig.value) {
      connectToPlatform(defaultPlatformConfig.value, true)
    }
  }
})

let updateSubscriptionsDebounce: ReturnType<typeof setTimeout> | null = null

watch(() => {
  if (!currentProject.value) return ''
  return getAllTopics().sort().join(',')
}, () => {
  if (updateSubscriptionsDebounce) clearTimeout(updateSubscriptionsDebounce)
  updateSubscriptionsDebounce = setTimeout(updateSubscriptions, 300)
})

provide('mqttClient', mqttClient)
provide('widgetData', widgetData)
provide('sendMessage', handleSendMessage)

// 挂载文档级平移事件
onMounted(() => {
  loadProjects()
  document.addEventListener('mousemove', handleCanvasPanMove)
  document.addEventListener('mouseup', handleCanvasPanEnd)
  // 监视画布容器尺寸变化，自动更新小地图绿框
  const wrap = scrollWrapperRef.value
  if (wrap) {
    const ro = new ResizeObserver(() => {
      if (isFullscreen.value) updateMinimap()
      if (showEditor.value) updateEditorMinimap()
    })
    ro.observe(wrap)
    ;(window as any).__minimapResizeObserver = ro
  }
})

// 启动时后台检查更新，CMD警告关闭后显示右下角提示
let startupUpdateChecked = false
let startupUpdatePromise: Promise<Awaited<ReturnType<typeof checkForUpdates>>> | null = null

startupUpdatePromise = checkForUpdates()

watch(showCmdWarning, async (val) => {
  if (!val && !startupUpdateChecked) {
    startupUpdateChecked = true
    const result = await startupUpdatePromise
    if (!result) return
    if (result.hasUpdate && result.latestRelease) {
      updateToastType.value = 'update'
      toastData.value = {
        versionType: getVersionTypeLabel(result.versionType),
        newVersion: result.latestRelease.version,
        currentVersion: result.currentVersion
      }
      showUpdateToast.value = true
    } else if (result.error) {
      updateToastType.value = 'error'
      showUpdateToast.value = true
    }
  }
})

onUnmounted(() => {
  disconnectFromPlatform()
  if (topBarTimeout) {
    clearTimeout(topBarTimeout)
  }
  if (defaultPlatformConfig.value) {
    savePlatformConfig(defaultPlatformConfig.value)
  }
  document.removeEventListener('mousemove', handleCanvasPanMove)
  document.removeEventListener('mouseup', handleCanvasPanEnd)
  const ro = (window as any).__minimapResizeObserver
  if (ro) { ro.disconnect(); delete (window as any).__minimapResizeObserver }
})
</script>

<template>
  <div 
    class="app-container" 
    :class="{ 'fullscreen-mode': isFullscreen, 'editor-mode': showEditor }"
    @mousemove="handleMouseMove"
    @mouseleave="handleMouseLeave"
  >
    <TopBar
      v-if="isFullscreen"
      :is-visible="showTopBar"
      :is-connected="isConnected"
      :title="headerTitle"
      :project-id="currentProjectId || ''"
      :projects="projects"
      :switch-cooldown="isSwitchCooldown"
      @exit-fullscreen="toggleFullscreen"
      @connect="showPlatformConfig = true"
      @disconnect="disconnectFromPlatform"
      @open-project-manager="handleOpenProjectManager"
      @select-project="handleSelectProject"
      @scroll-to-center="handleScrollToCenter"
      @openIoTService="handleOpenIoTService"
    />
    
    <Header
      v-if="!isFullscreen"
      :is-connected="isConnected"
      :project-id="currentProjectId || ''"
      :projects="projects"
      :show-fullscreen-btn="!!currentProjectId"
      :show-project-selector="showProjectSelector"
      :is-editor-mode="showEditor"
      :show-project-manager-btn="showProjectManagerBtn"
      :switch-cooldown="isSwitchCooldown"
      @connect="showPlatformConfig = true"
      @disconnect="disconnectFromPlatform"
      @open-project-manager="handleOpenProjectManager"
      @toggle-fullscreen="toggleFullscreen"
      @select-project="handleSelectProject"
      @scroll-to-center="handleScrollToCenter"
      @create-project="handleCreateProjectClick"
      @openIoTService="handleOpenIoTService"
      @export-projects="handleExportProjects"
      @import-projects="handleImportProjects"
      @check-update="showCheckUpdate = true"
    />
    
    <PlatformConfigModal
      v-if="showPlatformConfig"
      :config="currentProject?.platformConfig || defaultPlatformConfig || null"
      @confirm="handlePlatformConfigConfirm"
      @cancel="showPlatformConfig = false"
    />
    
    <NetworkConfigModal
      v-if="showNetworkConfig"
      @close="handleCloseIoTService"
    />
    
    <CmdWarningModal
      v-if="showCmdWarning"
      @close="showCmdWarning = false"
    />
    
    <ProjectManager
      v-if="showProjectManager"
      :projects="projects"
      :trigger-create-count="triggerCreateCount"
      @create="handleCreateProject"
      @select="handleSelectProject"
      @view="handleViewProject"
      @delete="handleDeleteProject"
      @rename="handleRenameProject"
      @reorder="handleReorderProjects"
    />

    <div v-else class="panel-container">
      <Transition name="slide-left" appear>
        <SidebarLeft 
          v-if="showEditor" 
          @add-widget="handleAddWidget" 
        />
      </Transition>
      
      <div ref="scrollWrapperRef" class="canvas-scroll-wrapper" :class="{ 'editor-mode': showEditor }" @mousedown="handleCanvasPanStart" @scroll.passive="handleWheelScroll">
        <MainCanvas
          :widgets="currentProject?.widgets || []"
          :selected-widget-id="selectedWidgetId"
          :widget-data="widgetData"
          :show-controls="showEditor"
          :show-center-flare="showCenterFlare"
          @select-widget="handleSelectWidget"
          @add-widget="handleAddWidget"
          @update-widget="handleUpdateWidget"
          @remove-widget="handleRemoveWidget"
          @update-widget-size="handleUpdateWidgetSize"
        />
      </div>

      <Transition name="minimap-fade">
        <div v-if="(isPanning || isScrollingToCenter || isWheelScrolling || showMinimapOnEntry) && isFullscreen" class="canvas-minimap">
          <div class="minimap-grid">
            <div
              v-for="dot in minimapWidgetDots"
              :key="dot.id"
              class="minimap-dot"
              :class="'dot-' + dot.type"
              :style="{
                left: dot.left,
                top: dot.top,
                width: dot.width,
                height: dot.height
              }"
            ></div>
            <div class="minimap-viewport" :style="minimapViewportStyle"></div>
          </div>
        </div>
      </Transition>

      <Transition name="editor-minimap-fade">
        <div v-if="(isPanning || isScrollingToCenter || isWheelScrolling || showMinimapOnEntry) && showEditor" class="editor-minimap">
          <div class="editor-minimap-grid">
            <div
              v-for="dot in editorMinimapWidgetDots"
              :key="dot.id"
              class="editor-minimap-dot"
              :class="'dot-' + dot.type"
              :style="{
                left: dot.left,
                top: dot.top,
                width: dot.width,
                height: dot.height
              }"
            ></div>
            <div
              class="editor-minimap-viewport"
              :style="{
                left: editorMinimapViewport.left + 'px',
                top: editorMinimapViewport.top + 'px',
                width: editorMinimapViewport.width + 'px',
                height: editorMinimapViewport.height + 'px'
              }"
            ></div>
          </div>
        </div>
      </Transition>
      
      <Transition name="slide-right" appear>
        <SidebarRight
          v-if="showEditor"
          :widget="selectedWidget"
          :widget-data="widgetData[selectedWidgetId || '']"
          @update="handleSidebarUpdate"
          @remove="selectedWidgetId && handleRemoveWidget(selectedWidgetId)"
          @clear-data="selectedWidgetId && handleClearWidgetData(selectedWidgetId)"
          @send-message="(topic: string, message: string) => handleSendMessage(topic, message)"
        />
      </Transition>
    </div>
    
    <!-- 连接光效 -->
    <RippleEffect :ripples="ripples" />

    <!-- 页面水印 -->
    <div class="watermark">
      <div class="watermark-left">ZzIOT-可视化面板 | {{ APP_VERSION }}</div>
      <div class="watermark-right">By—雪菱(mio-kitten)</div>
    </div>

    <ExportModal
      v-if="showExportModal"
      :projects="projects"
      @export="handleExportConfirm"
      @close="showExportModal = false"
    />

    <CheckUpdateModal
      v-if="showCheckUpdate"
      @close="showCheckUpdate = false"
    />

    <UpdateToast
      v-if="showUpdateToast"
      :type="updateToastType"
      :version-type="toastData.versionType"
      :new-version="toastData.newVersion"
      :current-version="toastData.currentVersion"
      @click="showUpdateToast = false; showCheckUpdate = true"
      @close="showUpdateToast = false"
    />

    <div v-if="noProjectAlert" class="modal-overlay" @click.self="noProjectAlert = false">
      <div class="modal-content">
        <div class="modal-header">
          <h2>提示</h2>
        </div>
        <div class="modal-body">
          <p style="text-align: center; font-size: 15px; color: #666;">当前没有任何项目，请先创建一个项目后再导出。</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="noProjectAlert = false">知道了</button>
        </div>
      </div>
    </div>

    <div v-if="importDialog.show" class="modal-overlay" :class="{ 'modal-closing': importDialog.closing }">
      <div class="modal-content">
        <div class="modal-header">
          <h2>{{ importDialog.message }}</h2>
        </div>
        <div class="modal-body">
          <p style="text-align: center; font-size: 16px; color: #333; white-space: pre-line; line-height: 1.6;">{{ importDialog.detail }}</p>
        </div>
        <div class="modal-footer">
          <template v-if="importDialog.type === 'confirm'">
            <button class="btn btn-secondary" @click="importDialog.resolve?.(false)">取消</button>
            <button class="btn btn-primary" @click="importDialog.resolve?.(true)">覆盖</button>
          </template>
          <template v-else>
            <button class="btn btn-secondary" @click="importDialog.resolve?.(false)">知道了</button>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-container {
  width: 100vw;
  height: 100vh;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.app-container.fullscreen-mode {
  cursor: none;
  width: 100%;
  height: 100%;
  min-height: 100%;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 9999;
}

.app-container.fullscreen-mode .panel-container {
  height: 100%;
  min-height: 100%;
}

/* 全屏模式：画布可滚动，隐藏滚动条，自动居中滚动到组件群 */
.app-container.fullscreen-mode .canvas-scroll-wrapper {
  overflow: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.app-container.fullscreen-mode .canvas-scroll-wrapper::-webkit-scrollbar {
  display: none;
}
.app-container.fullscreen-mode .main-canvas {
  min-width: 3000px;
  min-height: 3000px;
}

/* 编辑模式：顶栏悬浮覆盖，面板撑满全高 */
.app-container.editor-mode .panel-container {
  height: 100%;
}

.app-container.editor-mode :deep(.blue-header) {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
}

.app-container.editor-mode :deep(.sidebar-left),
.app-container.editor-mode :deep(.sidebar-right) {
  padding-top: 48px;
}

/* 编辑模式：画布滚动容器 */
.canvas-scroll-wrapper {
  flex: 1;
  min-width: 0;
  position: relative;
  overflow: hidden;
  display: flex;
}

.canvas-scroll-wrapper.editor-mode {
  overflow: auto;
}

.canvas-scroll-wrapper.editor-mode .main-canvas {
  min-width: 3000px;
  min-height: 3000px;
}

.app-container.fullscreen-mode:hover {
  cursor: default;
}

/* 页面水印 */
.watermark {
  position: fixed;
  bottom: 6px;
  left: 10px;
  right: 10px;
  font-size: 12px;
  color: #c0c0c0;
  pointer-events: none;
  user-select: none;
  z-index: 10000;
  font-family: 'HarmonyOS Sans SC', 'HarmonyOS Sans', sans-serif;
  letter-spacing: 0.3px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.watermark-left {
  font-size: 12px;
  color: #c0c0c0;
}

.watermark-right {
  font-size: 12px;
  color: #c0c0c0;
}

/* 无项目提示弹窗 */
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
  opacity: 1;
  transition: opacity 0.2s ease;
}

.modal-overlay.modal-closing {
  opacity: 0;
}

.modal-content {
  background: #fff;
  border-radius: 12px;
  width: 420px;
  max-width: 90vw;
  overflow: hidden;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
  transform: scale(1);
  opacity: 1;
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.modal-closing .modal-content {
  transform: scale(0.95);
  opacity: 0;
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
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid #eee;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 9px 18px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  line-height: 1.2;
  font-weight: 500;
  transition: all 0.2s;
}

.btn-secondary {
  background: #f0f0f0;
  color: #666;
}

.btn-secondary:hover {
  background: #e0e0e0;
}

/* 侧边栏进入动画 */
.slide-left-enter-active {
  transition: transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.slide-left-enter-from {
  transform: translateX(-100%);
}

.slide-right-enter-active {
  transition: transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.slide-right-enter-from {
  transform: translateX(100%);
}

/* 画布小地图（全屏拖拽时显示） */
.canvas-minimap {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 99999;
  background: rgba(30, 30, 30, 0.85);
  border-radius: 10px;
  padding: 6px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5), 0 0 0 2px rgba(168, 230, 168, 0.4);
  backdrop-filter: blur(6px);
}

.minimap-grid {
  width: 180px;
  height: 180px;
  background-color: #2a2a2a;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.06) 1px, transparent 1px);
  background-size: calc(180px / 15) calc(180px / 15);
  background-repeat: repeat;
  border-radius: 6px;
  position: relative;
  overflow: hidden;
}

.minimap-viewport {
  position: absolute;
  background: rgba(168, 230, 168, 0.25);
  border: 2px solid #a8e6a8;
  border-radius: 3px;
  box-shadow: 0 0 8px rgba(168, 230, 168, 0.5), inset 0 0 4px rgba(168, 230, 168, 0.2);
  pointer-events: none;
  z-index: 2;
}

.minimap-dot {
  position: absolute;
  border-radius: 2px;
  background: rgba(200, 200, 200, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.3);
  pointer-events: none;
  z-index: 1;
}

.minimap-dot.dot-lineChart,
.minimap-dot.dot-barChart,
.minimap-dot.dot-miniArea {
  background: rgba(100, 180, 255, 0.55);
  border-color: rgba(100, 180, 255, 0.7);
}

.minimap-dot.dot-image {
  background: rgba(210, 180, 140, 0.55);
  border-color: rgba(210, 180, 140, 0.7);
}

.minimap-dot.dot-light {
  background: rgba(255, 180, 100, 0.55);
  border-color: rgba(255, 180, 100, 0.7);
}

.minimap-dot.dot-button {
  background: rgba(100, 220, 150, 0.55);
  border-color: rgba(100, 220, 150, 0.7);
}

.minimap-dot.dot-switch {
  background: rgba(100, 220, 150, 0.55);
  border-color: rgba(100, 220, 150, 0.7);
}

.minimap-dot.dot-slider {
  background: rgba(220, 180, 100, 0.55);
  border-color: rgba(220, 180, 100, 0.7);
}

.minimap-dot.dot-text,
.minimap-dot.dot-textarea {
  background: rgba(200, 200, 200, 0.55);
  border-color: rgba(200, 200, 200, 0.7);
}

.minimap-dot.dot-decorativeText {
  background: rgba(200, 140, 220, 0.55);
  border-color: rgba(200, 140, 220, 0.7);
}

.minimap-dot.dot-radio {
  background: rgba(100, 220, 150, 0.55);
  border-color: rgba(100, 220, 150, 0.7);
}

.minimap-dot.dot-input {
  background: rgba(255, 220, 100, 0.55);
  border-color: rgba(255, 220, 100, 0.7);
}

/* 小地图淡入淡出动画 */
.minimap-fade-enter-active {
  transition: opacity 0.2s ease, transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.minimap-fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.minimap-fade-enter-from {
  opacity: 0;
  transform: translateX(-50%) translateY(12px) scale(0.9);
}

.minimap-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(12px) scale(0.9);
}

/* 编辑模式画布右下角小地图（靠组件属性面板左侧） */
.editor-minimap {
  position: absolute;
  bottom: 12px;
  right: 272px;
  z-index: 100;
  background: rgba(30, 30, 30, 0.78);
  border-radius: 8px;
  padding: 5px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.4), 0 0 0 1.5px rgba(168, 230, 168, 0.35);
  backdrop-filter: blur(4px);
  pointer-events: none;
}

.editor-minimap-grid {
  width: 140px;
  height: 140px;
  background-color: #2a2a2a;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
  background-size: calc(100px / 10) calc(100px / 10);
  background-repeat: repeat;
  border-radius: 4px;
  position: relative;
  overflow: hidden;
}

.editor-minimap-dot {
  position: absolute;
  border-radius: 1px;
  background: rgba(200, 200, 200, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.2);
  pointer-events: none;
  z-index: 1;
}

.editor-minimap-dot.dot-lineChart,
.editor-minimap-dot.dot-barChart,
.editor-minimap-dot.dot-miniArea {
  background: rgba(100, 180, 255, 0.5);
  border-color: rgba(100, 180, 255, 0.6);
}

.editor-minimap-dot.dot-image {
  background: rgba(210, 180, 140, 0.5);
  border-color: rgba(210, 180, 140, 0.6);
}

.editor-minimap-dot.dot-light {
  background: rgba(255, 180, 100, 0.5);
  border-color: rgba(255, 180, 100, 0.6);
}

.editor-minimap-dot.dot-button {
  background: rgba(100, 220, 150, 0.5);
  border-color: rgba(100, 220, 150, 0.6);
}

.editor-minimap-dot.dot-switch {
  background: rgba(100, 220, 150, 0.5);
  border-color: rgba(100, 220, 150, 0.6);
}

.editor-minimap-dot.dot-slider {
  background: rgba(220, 180, 100, 0.5);
  border-color: rgba(220, 180, 100, 0.6);
}

.editor-minimap-dot.dot-text,
.editor-minimap-dot.dot-textarea {
  background: rgba(200, 200, 200, 0.5);
  border-color: rgba(200, 200, 200, 0.6);
}

.editor-minimap-dot.dot-decorativeText {
  background: rgba(200, 140, 220, 0.5);
  border-color: rgba(200, 140, 220, 0.6);
}

.editor-minimap-dot.dot-radio {
  background: rgba(100, 220, 150, 0.5);
  border-color: rgba(100, 220, 150, 0.6);
}

.editor-minimap-dot.dot-input {
  background: rgba(255, 220, 100, 0.5);
  border-color: rgba(255, 220, 100, 0.6);
}

.editor-minimap-viewport {
  position: absolute;
  background: rgba(168, 230, 168, 0.2);
  border: 1.5px solid #a8e6a8;
  border-radius: 2px;
  box-shadow: 0 0 6px rgba(168, 230, 168, 0.4);
  pointer-events: none;
  z-index: 2;
}

/* 编辑模式小地图淡入淡出 */
.editor-minimap-fade-enter-active {
  transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.editor-minimap-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.editor-minimap-fade-enter-from {
  opacity: 0;
  transform: scale(0.85);
}

.editor-minimap-fade-leave-to {
  opacity: 0;
  transform: scale(0.85);
}
</style>