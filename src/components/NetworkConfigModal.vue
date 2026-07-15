<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const emit = defineEmits<{
  close: []
}>()

const ip = ref('127.0.0.1')
const esp32IP = ref('127.0.0.1')
const webPort = ref(8080)
const brokerRunning = ref(false)
const wsPort = ref(1853)
const tcpPort = ref(1883)
const clientCount = ref(0)
const accessUrl = ref('')
const loading = ref(false)
const errorMsg = ref('')
const isOffline = ref(false)
const hotspotStarted = ref(false)
const apInfo = ref<{ ssid: string; password: string } | null>(null)

const API_BASE = 'http://localhost:8080'

const fetchStatus = async () => {
  try {
    const res = await fetch(`${API_BASE}/api/status?_=${Date.now()}`, { cache: 'no-store' })
    const data = await res.json()
    ip.value = data.ip
    esp32IP.value = data.esp32IP || data.ip
    webPort.value = data.webPort
    brokerRunning.value = data.broker.running
    wsPort.value = data.broker.wsPort
    tcpPort.value = data.broker.tcpPort
    clientCount.value = data.broker.clients
    accessUrl.value = data.accessUrl
    isOffline.value = data.isOffline || false
    hotspotStarted.value = data.hotspotStarted || false
    apInfo.value = data.apInfo || null
    errorMsg.value = ''
  } catch {
    ip.value = '---.---.---'
    accessUrl.value = ''
    brokerRunning.value = false
    clientCount.value = 0
    isOffline.value = false
    hotspotStarted.value = false
    apInfo.value = null
    errorMsg.value = '无法连接到内网服务，请确保后端服务器已启动'
  }
}

const toggleBroker = async () => {
  loading.value = true
  errorMsg.value = ''
  try {
    if (brokerRunning.value) {
      const res = await fetch(`${API_BASE}/api/broker/stop`, { method: 'POST', cache: 'no-store' })
      const data = await res.json()
      if (data.success) {
        brokerRunning.value = false
        clientCount.value = 0
      } else {
        errorMsg.value = data.error || '停止失败'
      }
    } else {
      const res = await fetch(`${API_BASE}/api/broker/start`, { method: 'POST', cache: 'no-store' })
      const data = await res.json()
      if (data.success) {
        brokerRunning.value = true
        if (data.ip) {
          ip.value = data.ip
          accessUrl.value = `http://${data.ip}:${webPort.value}`
        }
      } else {
        errorMsg.value = data.error || '启动失败'
      }
    }
  } catch {
    errorMsg.value = '操作失败，请检查后端服务是否正常'
  } finally {
    loading.value = false
  }
}

let pollTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  fetchStatus()
  pollTimer = setInterval(fetchStatus, 2000)
})

onUnmounted(() => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
})
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal-content">
      <div class="modal-header">
        <h2>内网服务配置</h2>
        <button class="close-btn" @click="emit('close')">×</button>
      </div>

      <div class="modal-body">
        <div v-if="errorMsg" class="error-msg">{{ errorMsg }}</div>

        <div class="info-tip" v-if="!brokerRunning">
          请先开启内网服务，设备才能连接
        </div>

        <div class="status-section">
          <div class="status-label">MQTT Broker</div>
          <div class="status-row">
            <span class="status-dot" :class="{ active: brokerRunning }"></span>
            <span>{{ brokerRunning ? '运行中' : '未启动' }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">TCP端口（仿SIoT，是主板连接默认值）</span>
            <span class="info-value">{{ tcpPort }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">本面板连接内网端口</span>
            <span class="info-value">{{ wsPort }}</span>
          </div>
          <div class="info-yellow-tip">
            将本面板的连接平台的 SIoT 配置端口改为此 WebSocket 端口即可切换本内网连接，这个端口与主板连接的端口无关，TCP 才是主板连接的端口（默认）
          </div>
        </div>

        <div class="status-section">
          <div class="status-label">电脑连接地址（不是主板的）</div>
          <div class="info-row ip-row">
            <span class="info-label">IP</span>
            <span class="info-value ip-value">{{ ip }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">数据管理页面</span>
            <span class="info-value ip-value">{{ accessUrl }}</span>
          </div>
          <div class="info-tip" v-if="brokerRunning">
            <a :href="accessUrl" target="_blank" class="quick-link">📋 打开数据管理面板</a>
          </div>
          <div class="info-tip" v-else>
            开启内网服务后，可在此快速打开数据管理面板
          </div>
        </div>

        <div class="status-section" v-if="((isOffline || hotspotStarted) && apInfo)">
          <div class="status-label">{{ hotspotStarted ? 'WiFi热点AP' : '模拟AP信息（无网模式）' }}</div>
          <div class="ap-info-banner">
            <div class="ap-warning">
              {{ hotspotStarted ? '✓ 真实WiFi热点已创建（AP模式）' : '⚠ 当前电脑无网络连接，已启用模拟AP模式' }}
            </div>
            <div class="ap-info-row">
              <span class="ap-info-label">WiFi名称</span>
              <span class="ap-info-value ap-ssid">{{ apInfo.ssid }}</span>
            </div>
            <div class="ap-info-row">
              <span class="ap-info-label">WiFi密码</span>
              <span class="ap-info-value ap-password">{{ apInfo.password }}</span>
            </div>
            <div class="ap-info-note">
              本机请通过 <strong>http://localhost:{{ webPort }}</strong> 访问数据管理页面。<br>
              设备连接 ↓ ↓ ↓
              <div v-if="!hotspotStarted && isOffline" class="ap-fail-tip">
                <br><strong>提示：WiFi热点创建失败，请检查是否以管理员身份运行此程序。</strong>
              </div>
            </div>
          </div>
        </div>

        <div class="status-section">
          <div class="status-label">连接设备</div>
          <div class="info-row">
            <span class="info-label">设备数</span>
            <span class="info-value">{{ clientCount }} 台</span>
          </div>
        </div>

        <div class="status-section">
          <div class="status-label">设备连接信息（ESP32 / Mind+）</div>
          <div class="info-row">
            <span class="info-label">服务器地址</span>
            <span class="info-value ip-value">{{ esp32IP }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">TCP端口（仿SIoT，是主板连接默认值）</span>
            <span class="info-value ip-value">{{ tcpPort }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">默认账号</span>
            <span class="info-value">siot</span>
          </div>
          <div class="info-row">
            <span class="info-label">默认密码</span>
            <span class="info-value">dfrobot</span>
          </div>
          <div class="info-note">
            TCP 的 1883 端口、账号、密码均是用来适配各大平台特别是 Mind+ 的 SIoT 配置的，无需担忧；<br>
            比如要在 Mind+ 里配置本内网，也只需将这里显示的 IP 输入即可
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" @click="emit('close')">关闭</button>
        <button
          class="btn"
          :class="brokerRunning ? 'btn-danger' : 'btn-success'"
          :disabled="loading"
          @click="toggleBroker"
        >
          {{ loading ? '处理中...' : (brokerRunning ? '关闭内网服务' : '开启内网服务') }}
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
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.modal-content {
  background: #fff;
  border-radius: 12px;
  width: 440px;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #eee;
}

.modal-header h2 {
  font-size: 16px;
  font-weight: 600;
  color: #333;
  margin: 0;
}

.close-btn {
  background: none;
  border: none;
  font-size: 22px;
  color: #999;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.close-btn:hover { color: #333; }

.modal-body { padding: 20px; }

.error-msg {
  background: #fff3cd;
  color: #856404;
  padding: 10px 14px;
  border-radius: 6px;
  font-size: 13px;
  margin-bottom: 16px;
}

.status-section {
  margin-bottom: 16px;
  padding: 14px;
  background: #f8f9fa;
  border-radius: 8px;
}

.status-section:last-child { margin-bottom: 0; }

.status-label {
  font-size: 12px;
  color: #888;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 10px;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #333;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #ccc;
  transition: background 0.3s;
}

.status-dot.active {
  background: #00c853;
  box-shadow: 0 0 6px rgba(0, 200, 83, 0.4);
}

.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
  padding: 6px 0;
}

.info-label { font-size: 13px; color: #666; }

.info-value { font-size: 13px; color: #333; font-weight: 500; }

.ip-row { border-bottom: 1px dashed #e0e0e0; padding-bottom: 10px; }

.ip-value {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 13px;
  color: #5c9ce6;
  font-weight: 700;
}

.info-tip {
  margin-top: 8px;
  font-size: 12px;
  color: #999;
  padding: 6px 10px;
  background: #e8f0fe;
  border-radius: 4px;
}

.info-note {
  margin-top: 10px;
  font-size: 12px;
  color: #1a73e8;
  padding: 10px 12px;
  background: #e8f0fe;
  border-radius: 6px;
  line-height: 1.6;
  border-left: 3px solid #1a73e8;
}

.info-tip {
  margin-bottom: 12px;
  font-size: 13px;
  color: #cf1322;
  font-weight: 600;
  padding: 8px 12px;
  background: #fff2f0;
  border: 1px solid #ffccc7;
  border-radius: 6px;
  text-align: center;
}

.info-yellow-tip {
  margin-top: 8px;
  font-size: 12px;
  color: #ad6800;
  padding: 8px 12px;
  background: #fffbe6;
  border: 1px solid #ffe58f;
  border-radius: 6px;
  line-height: 1.5;
}

.quick-link {
  color: #1a73e8;
  text-decoration: none;
  font-weight: 600;
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.quick-link:hover {
  text-decoration: underline;
  color: #1557b0;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 20px;
  border-top: 1px solid #eee;
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s;
}

.btn:disabled { opacity: 0.6; cursor: not-allowed; }

.btn:hover:not(:disabled) { opacity: 0.88; }

.btn-secondary {
  background: #f0f0f0;
  color: #666;
}

.btn-success { background-color: #66bb6a; color: #fff; }

.btn-danger { background-color: #ef5350; color: #fff; }

.ap-info-banner {
  margin-top: 8px;
  padding: 12px;
  background: #e6f7ff;
  border: 1px solid #91d5ff;
  border-radius: 8px;
}

.ap-warning {
  font-size: 13px;
  color: #fa8c16;
  font-weight: 600;
  margin-bottom: 10px;
  padding: 6px 10px;
  background: #fff7e6;
  border-radius: 4px;
  text-align: center;
}

.ap-info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 6px;
  padding: 4px 0;
}

.ap-info-label {
  font-size: 13px;
  color: #666;
}

.ap-info-value {
  font-size: 13px;
  font-weight: 700;
  font-family: 'Consolas', 'Monaco', monospace;
}

.ap-ssid {
  color: #1890ff;
  font-size: 15px;
}

.ap-password {
  color: #52c41a;
  font-size: 15px;
  letter-spacing: 1px;
}

.ap-info-note {
  margin-top: 8px;
  font-size: 12px;
  color: #595959;
  padding: 6px 10px;
  background: #fafafa;
  border-radius: 4px;
  line-height: 1.5;
}

.ap-fail-tip {
  color: #cf1322;
}
</style>