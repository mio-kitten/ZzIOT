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

const isFullscreen = ref(false)
const showTopBar = ref(false)
const scrollWrapperRef = ref<HTMLElement | null>(null)
let topBarTimeout: number | null = null

// 消息更新防抖延迟（毫秒），避免高频更新导致卡顿
const MESSAGE_UPDATE_DELAY = 100

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
  if (!document.fullscreenElement && isFullscreen.value) {
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
    // 进入全屏：顶栏自动滑下，停留 2.5s 后上移
    showTopBar.value = true
    if (topBarTimeout) {
      clearTimeout(topBarTimeout)
      topBarTimeout = null
    }
    topBarTimeout = window.setTimeout(() => {
      showTopBar.value = false
    }, 2500)
    
    if (!scrollWrapperRef.value) {
      // 从项目管理进入时，scrollWrapperRef 尚未渲染，等待 DOM 更新
      await nextTick()
      if (!scrollWrapperRef.value) return
    }
    // 等待 DOM 更新（侧边栏隐藏等），确保 clientWidth/Height 为最终值
    await nextTick()
    const wrap = scrollWrapperRef.value
    
    if (savedViewCenter.value) {
      // 使用进入全屏前保存的视口中心，避免因侧边栏隐藏导致内容偏移
      wrap.scrollLeft = Math.max(0, savedViewCenter.value.x - wrap.clientWidth / 2)
      wrap.scrollTop = Math.max(0, savedViewCenter.value.y - wrap.clientHeight / 2)
      savedViewCenter.value = null
    } else if (currentProject.value) {
      // 降级：滚动到画布正中央（1500, 1500）
      const canvasCenterX = 1500
      const canvasCenterY = 1500
      wrap.scrollLeft = Math.max(0, canvasCenterX - wrap.clientWidth / 2)
      wrap.scrollTop = Math.max(0, canvasCenterY - wrap.clientHeight / 2)
    }
  } else if (!val && scrollWrapperRef.value) {
    // 退出全屏回到编辑模式：恢复进入前的滚动位置
    await nextTick()
    const wrap = scrollWrapperRef.value
    if (savedEditScrollPos.value) {
      wrap.scrollLeft = savedEditScrollPos.value.left
      wrap.scrollTop = savedEditScrollPos.value.top
      savedEditScrollPos.value = null
    }
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
  if (oldVal && !newVal && !isConnected.value) {
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

const getAllTopics = () => {
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
    
    // 取消所有旧订阅
    mqttClient.unsubscribeAll()
    
    // 订阅新主题
    if (topics.length > 0) {
      mqttClient.subscribe(topics)
      lastTopics = topicsStr
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
    // 进入编辑模式
    const saved = savedScrollPosMap.value.get(pid)
    if (saved) {
      // 有保存的位置则恢复
      await nextTick()
      requestAnimationFrame(() => {
        const w = scrollWrapperRef.value
        if (!w) return
        w.scrollTo({ left: saved.left, top: saved.top, behavior: 'smooth' })
      })
    } else {
      // 首次进入：滚到画布中心
      await nextTick()
      requestAnimationFrame(() => {
        const w = scrollWrapperRef.value
        if (!w) return
        w.scrollTo({ left: Math.max(0, (w.scrollWidth - w.clientWidth) / 2), top: Math.max(0, (w.scrollHeight - w.clientHeight) / 2), behavior: 'smooth' })
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
    
    isConnected.value = true
    
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
    
    mqttClient.setOnMessageCallback((topic: string, message: string) => {
      handleMessage(topic, message)
    })
    
    const topics = getAllTopics()
    if (topics.length > 0) {
      mqttClient.subscribe(topics)
    }
    
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
    // 解析新的返回格式：{ topic: { mode, originalTopic } }
    Object.keys(data).forEach(topic => {
      topicModes.value[topic] = data[topic].mode || 'siot'
      topicOriginalTopics.value[topic] = data[topic].originalTopic || ''
    })
  } catch (e) {
    console.warn('获取主题模式失败:', e)
  }
}

const handleMessage = (topic: string, message: string) => {
  // 将消息添加到待处理队列（防抖处理）
  pendingMessages.value.set(topic, { topic, message })
  
  // 如果定时器不存在，创建新的定时器批量刷新
  if (!flushTimer) {
    flushTimer = setTimeout(flushPendingMessages, MESSAGE_UPDATE_DELAY)
  }
}

const processMessage = (topic: string, message: string) => {
  // 从 项目ID/用户主题 格式中提取用户主题
  let userTopic = topic
  // 解析主题：Mixly格式是 用户名/项目名/主题（三层），SIoT格式是直接主题名（单层）
  const parts = topic.split('/')
  const isMixlyFormat = parts.length >= 3
  if (isMixlyFormat) {
    userTopic = parts[parts.length - 1]
  }
  
  // 根据主题模式过滤消息
  // mode 可以是 'siot', 'bafayun', 'mixly'
  const mode = topicModes.value[userTopic] || 'siot'
  if (isMixlyFormat && mode !== 'mixly' && mode !== 'bafayun') return
  if (!isMixlyFormat && mode !== 'siot') return
  
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
  })
}

const handleSendMessage = (topic: string, message: string) => {
  // 走 HTTP API，让服务端根据主题模式同时发送 SIoT 和 Mixly 格式
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
  delete widgetData[widgetId]
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
const handleScrollToCenter = () => {
  const wrap = scrollWrapperRef.value
  if (!wrap) return
  wrap.scrollTo({
    left: Math.max(0, (wrap.scrollWidth - wrap.clientWidth) / 2),
    top: Math.max(0, (wrap.scrollHeight - wrap.clientHeight) / 2),
    behavior: 'smooth'
  })
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
const panStart = ref({ mouseX: 0, mouseY: 0, scrollLeft: 0, scrollTop: 0 })

const handleCanvasPanStart = (e: MouseEvent) => {
  if (e.button !== 0) return
  // 左键按下画布背景开始平移
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
}

const handleCanvasPanMove = (e: MouseEvent) => {
  if (!isPanning.value) return
  const wrap = scrollWrapperRef.value
  if (!wrap) return
  const dx = e.clientX - panStart.value.mouseX
  const dy = e.clientY - panStart.value.mouseY
  wrap.scrollLeft = panStart.value.scrollLeft - dx
  wrap.scrollTop = panStart.value.scrollTop - dy
}

const handleCanvasPanEnd = () => {
  if (isPanning.value) {
    isPanning.value = false
    const wrap = scrollWrapperRef.value
    if (wrap) {
      wrap.style.cursor = ''
    }
  }
}

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
      if (saved) {
        w.scrollTo({ left: saved.left, top: saved.top, behavior: 'smooth' })
      } else {
        w.scrollTo({ left: Math.max(0, (w.scrollWidth - w.clientWidth) / 2), top: Math.max(0, (w.scrollHeight - w.clientHeight) / 2), behavior: 'smooth' })
      }
    })
  }

  if (newId && newId !== oldId) {
    // 冷却中禁止切换
    if (isSwitchCooldown.value) return

    // 设置冷却
    isSwitchCooldown.value = true
    setTimeout(() => { isSwitchCooldown.value = false }, 800)

    // 统一断开当前连接
    disconnectFromPlatform()

    const project = projects.value.find((p: Project) => p.id === newId)
    if (project?.platformConfig) {
      connectToPlatform(project.platformConfig, true)
    } else if (defaultPlatformConfig.value) {
      connectToPlatform(defaultPlatformConfig.value, true)
    }
  }
})

watch(() => currentProject.value?.widgets?.length, () => {
  updateSubscriptions()
})

provide('mqttClient', mqttClient)
provide('widgetData', widgetData)
provide('sendMessage', handleSendMessage)

// 挂载文档级平移事件
onMounted(() => {
  loadProjects()
  document.addEventListener('mousemove', handleCanvasPanMove)
  document.addEventListener('mouseup', handleCanvasPanEnd)
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
})
</script>

<template>
  <div 
    class="app-container" 
    :class="{ 'fullscreen-mode': isFullscreen }"
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
      <SidebarLeft 
        v-if="showEditor" 
        @add-widget="handleAddWidget" 
      />
      
      <div ref="scrollWrapperRef" class="canvas-scroll-wrapper" :class="{ 'editor-mode': showEditor }" @mousedown="handleCanvasPanStart">
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
      
      <SidebarRight
        v-if="showEditor"
        :widget="selectedWidget"
        :widget-data="widgetData[selectedWidgetId || '']"
        @update="handleSidebarUpdate"
        @remove="selectedWidgetId && handleRemoveWidget(selectedWidgetId)"
        @clear-data="selectedWidgetId && handleClearWidgetData(selectedWidgetId)"
      />
    </div>
    
    <!-- 连接光效 -->
    <RippleEffect :ripples="ripples" />
    
    <!-- 页面水印 -->
    <div class="watermark">
      <div class="watermark-left">自制IOT物联网显示面板 | {{ APP_VERSION }}</div>
      <div class="watermark-right">By—雪菱(mio-kitten)</div>
    </div>

    <ExportModal
      v-if="showExportModal"
      :projects="projects"
      @export="handleExportConfirm"
      @close="showExportModal = false"
    />

    <div v-if="noProjectAlert" class="modal-overlay" @click.self="noProjectAlert = false">
      <div class="modal-content">
        <div class="modal-header">
          <h2>提示</h2>
          <button class="close-btn" @click="noProjectAlert = false">×</button>
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
          <button class="close-btn" @click="importDialog.resolve?.(false)">×</button>
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
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
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
  padding: 8px 18px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
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
</style>