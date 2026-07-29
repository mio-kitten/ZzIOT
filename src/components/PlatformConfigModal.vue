/**
 * 平台连接配置弹窗
 * 配置 SIoT V2 或巴法云 MQTT 的连接参数（服务器地址、端口、用户名、密码等）
 */
<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import type { PlatformConfig, SiotConfig, BafayunConfig } from '@/types'

const props = defineProps<{
  config: PlatformConfig | null
}>()

const emit = defineEmits<{
  confirm: [config: PlatformConfig]
  cancel: []
}>()

const platform = ref<'siot' | 'bafayun'>('siot')

const siotConfig = ref<SiotConfig>({
  server: '127.0.0.1',
  port: 1888,
  username: 'siot',
  password: 'dfrobot'
})

const bafayunConfig = ref<BafayunConfig>({
  server: 'bemfa.com',
  port: 9504,
  privateKey: ''
})

const isInternalNetwork = computed(() => siotConfig.value.port === 1853)

watch(() => props.config, (newConfig) => {
  if (newConfig) {
    platform.value = newConfig.platform
    
    siotConfig.value = {
      server: newConfig.siot?.server || '127.0.0.1',
      port: newConfig.siot?.port || 1888,
      username: newConfig.siot?.username || 'siot',
      password: newConfig.siot?.password || 'dfrobot'
    }
    
    bafayunConfig.value = {
      server: newConfig.bafayun?.server || 'bemfa.com',
      port: newConfig.bafayun?.port || 9504,
      privateKey: newConfig.bafayun?.privateKey || ''
    }
  }
}, { immediate: true })

watch(() => siotConfig.value.port, (newPort, oldPort) => {
  const wasInternal = oldPort === 1853
  const isInternal = newPort === 1853
  // 只有离开内网模式时才重置地址，进入内网模式时保留现有IP
  if (wasInternal && !isInternal) {
    siotConfig.value.server = '127.0.0.1'
  }
})

const isClosing = ref(false)

const handleClose = () => {
  isClosing.value = true
  setTimeout(() => {
    emit('cancel')
  }, 200)
}

const handleConfirm = () => {
  if (platform.value === 'siot') {
    if (!siotConfig.value.server.trim()) {
      alert('请输入服务器地址')
      return
    }
  } else {
    if (!bafayunConfig.value.server.trim()) {
      alert('请输入服务器地址')
      return
    }
    if (!bafayunConfig.value.privateKey.trim()) {
      alert('请输入巴法云私钥')
      return
    }
  }
  
  const config: PlatformConfig = {
    platform: platform.value,
    siot: { ...siotConfig.value },
    bafayun: { ...bafayunConfig.value }
  }
  isClosing.value = true
  setTimeout(() => {
    emit('confirm', config)
  }, 200)
}
</script>

<template>
  <div class="modal-overlay" :class="{ closing: isClosing }" @click.self="handleClose">
    <div class="modal-content">
      <div class="modal-header">
        <h2>选择物联网平台</h2>
        <button class="close-btn" @click="handleClose">×</button>
      </div>
      
      <div class="modal-body">
        <div class="platform-options">
          <label>
            <input
              type="radio"
              name="platform"
              value="siot"
              v-model="platform"
            />
            IOT/SIoT V2
          </label>
          <label>
            <input
              type="radio"
              name="platform"
              value="bafayun"
              v-model="platform"
            />
            巴法云 MQTT
          </label>
        </div>
        
        <template v-if="platform === 'siot'">
          <div class="config-item">
            <label>服务器地址</label>
            <input v-model="siotConfig.server" type="text" placeholder="请输入服务器地址" />
          </div>
          
          <div class="config-item">
            <label>端口</label>
            <div class="port-warning" v-if="isInternalNetwork">
              ⚠ 1853是本项目的内网端口，其余会默认为SIoT V2
            </div>
            <input v-model.number="siotConfig.port" type="number" />
          </div>
          
          <template v-if="!isInternalNetwork">
            <div class="config-item">
              <label>用户名</label>
              <input v-model="siotConfig.username" type="text" placeholder="请输入用户名" />
            </div>
            
            <div class="config-item">
              <label>密码</label>
              <input v-model="siotConfig.password" type="password" placeholder="请输入密码" />
            </div>
          </template>
        </template>
        
        <template v-else>
          <div class="config-item">
            <label>服务器地址</label>
            <input v-model="bafayunConfig.server" type="text" placeholder="请输入服务器地址" />
          </div>
          
          <div class="config-item">
            <label>端口</label>
            <input v-model.number="bafayunConfig.port" type="number" />
          </div>
          
          <div class="config-item">
            <label>私钥（Topic密钥）</label>
            <input v-model="bafayunConfig.privateKey" type="text" placeholder="请输入巴法云的私钥" />
          </div>
          
          <div class="info-panel">
            <h4>巴法云配置说明</h4>
            <p>
              私钥在巴法云控制台获取<br/>
              服务器地址固定为 bemfa.com<br/>
              端口固定为 9504
            </p>
          </div>
        </template>
      </div>
      
      <div class="modal-footer">
        <button class="btn btn-secondary" @click="emit('cancel')">取消</button>
        <button class="btn btn-success" @click="handleConfirm">完成</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.platform-options {
  display: flex;
  gap: 20px;
  margin-bottom: 20px;
}

.platform-options label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
  color: #444;
}

.platform-options input[type="radio"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
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

.port-warning {
  background: #fff3cd;
  border: 1px solid #ffc107;
  color: #856404;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 12px;
  margin-bottom: 6px;
}

.info-panel {
  background: #f5f5f5;
  border-radius: 6px;
  padding: 12px;
  margin-top: 16px;
}

.info-panel h4 {
  font-size: 13px;
  margin-bottom: 8px;
  color: #333;
  font-weight: 600;
}

.info-panel p {
  font-size: 12px;
  color: #666;
  line-height: 1.6;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 16px;
  border-top: 1px solid #eee;
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

.btn-secondary {
  background-color: #e8e8e8;
  color: #444;
}
</style>