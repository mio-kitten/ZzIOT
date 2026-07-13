const express = require('express')
const http = require('http')
const path = require('path')
const fs = require('fs')
const os = require('os')
const net = require('net')
const WebSocket = require('ws')
const mqtt = require('mqtt')

const WEB_PORT = 8080
const BROKER_WS_PORT = 1853
const BROKER_TCP_PORT = 1883
const DATA_DIR = path.join(__dirname, 'data')

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

const app = express()
app.use(express.json())
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200)
  }
  next()
})
app.use(express.static(path.join(__dirname, 'public')))

let broker = null
let wsServer = null
let tcpServer = null
let clientCount = 0
const connectedClients = new Set()

function getDataFilePath() {
  return path.join(DATA_DIR, 'iot-data.json')
}

function loadData() {
  try {
    if (fs.existsSync(getDataFilePath())) {
      return JSON.parse(fs.readFileSync(getDataFilePath(), 'utf-8'))
    }
  } catch (e) {
    console.error('读取数据文件失败:', e.message)
  }
  return []
}

function saveData(topics) {
  fs.writeFileSync(getDataFilePath(), JSON.stringify(topics, null, 2), 'utf-8')
}

function getLocalIP() {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address
      }
    }
  }
  return '127.0.0.1'
}

function addSystemMessage(payload) {
  const topics = loadData()
  const sysTopic = topics.find(t => t.topic === '系统信息')
  const message = { timestamp: Date.now(), payload }
  if (sysTopic) {
    sysTopic.messages.push(message)
    if (sysTopic.messages.length > 500) {
      sysTopic.messages = sysTopic.messages.slice(-500)
    }
  } else {
    topics.push({ topic: '系统信息', messages: [message] })
  }
  saveData(topics)
}

function ensureSystemTopic() {
  let topics = loadData()
  topics = topics.filter(t => !t.topic.startsWith('$SYS/'))
  if (!topics.find(t => t.topic === '系统信息')) {
    topics.push({ topic: '系统信息', messages: [{ timestamp: Date.now(), payload: '内网服务已启动' }] })
  }
  saveData(topics)
}

async function startBroker() {
  if (broker) {
    return { wsPort: BROKER_WS_PORT, tcpPort: BROKER_TCP_PORT, status: 'already_running' }
  }
  const { Aedes } = await import('aedes')
  broker = await Aedes.createBroker({
    id: 'iot-panel-broker',
    concurrency: 100,
    authenticate: (client, username, password, callback) => {
      // 匿名连接（可视化面板自己用）
      if (!username) {
        return callback(null, true)
      }
      // 接受默认 SIoT 凭证（Mind+ 用）
      const user = username.toString()
      const pass = password ? password.toString() : ''
      if (user === 'siot' && pass === 'dfrobot') {
        return callback(null, true)
      }
      // 其他凭证拒绝
      return callback(null, false)
    }
  })

  broker.on('client', (client) => {
    if (!connectedClients.has(client.id)) {
      connectedClients.add(client.id)
      clientCount = connectedClients.size
      addSystemMessage(`设备已连接 (ID: ${client.id})`)
    }
  })

  broker.on('clientDisconnect', (client) => {
    connectedClients.delete(client.id)
    clientCount = connectedClients.size
    addSystemMessage(`设备已断开 (ID: ${client.id})`)
  })

  broker.on('publish', (packet, client) => {
    // 跳过 HTTP API 自身发布的消息（带 __fromHttp 标记），避免发送方看到自己的消息
    if (packet.__fromHttp) return
    if (packet.topic && packet.payload && !packet.topic.startsWith('$SYS/')) {
      const topics = loadData()
      const topicName = packet.topic
      const payload = packet.payload.toString()
      const existing = topics.find(t => t.topic === topicName)
      const message = { timestamp: Date.now(), payload }
      if (existing) {
        existing.messages.push(message)
        if (existing.messages.length > 500) {
          existing.messages = existing.messages.slice(-500)
        }
      } else {
        topics.push({ topic: topicName, messages: [message] })
      }
      saveData(topics)
    }
  })

  return new Promise((resolve, reject) => {
    // WebSocket 服务器（浏览器 MQTT.js 用）
    wsServer = new WebSocket.Server({ port: BROKER_WS_PORT, host: '0.0.0.0' })
    wsServer.on('connection', (ws) => {
      const stream = WebSocket.createWebSocketStream(ws)
      broker.handle(stream)
    })
    wsServer.on('listening', () => {
      console.log(`MQTT Broker (WebSocket) 已启动，端口 ${BROKER_WS_PORT}`)
    })
    wsServer.on('error', (err) => {
      console.error('WebSocket 服务器启动失败:', err.message)
    })

    // TCP 服务器（Mind+ / ESP32 用）
    tcpServer = net.createServer(broker.handle)
    tcpServer.listen(BROKER_TCP_PORT, '0.0.0.0', () => {
      console.log(`MQTT Broker (TCP) 已启动，端口 ${BROKER_TCP_PORT}`)
      addSystemMessage(`MQTT Broker 已启动 (WebSocket:${BROKER_WS_PORT}, TCP:${BROKER_TCP_PORT})`)
      resolve({ wsPort: BROKER_WS_PORT, tcpPort: BROKER_TCP_PORT, status: 'started' })
    })
    tcpServer.on('error', (err) => {
      console.error('TCP 服务器启动失败:', err.message)
      wsServer.close()
      wsServer = null
      tcpServer = null
      broker = null
      reject(err)
    })
  })
}

function stopBroker() {
  return new Promise((resolve) => {
    if (broker) {
      broker.close(() => {
        if (wsServer) {
          wsServer.close()
          wsServer = null
        }
        if (tcpServer) {
          tcpServer.close()
          tcpServer = null
        }
        broker = null
        connectedClients.clear()
        clientCount = 0
        addSystemMessage('MQTT Broker 已停止')
        console.log('MQTT Broker 已停止')
        resolve({ status: 'stopped' })
      })
    } else {
      resolve({ status: 'not_running' })
    }
  })
}

function getBrokerStatus() {
  return {
    running: !!broker,
    wsPort: BROKER_WS_PORT,
    tcpPort: BROKER_TCP_PORT,
    clients: clientCount
  }
}

app.get('/api/status', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.set('Pragma', 'no-cache')
  const ip = getLocalIP()
  res.json({
    ip,
    webPort: WEB_PORT,
    broker: getBrokerStatus(),
    accessUrl: `http://${ip}:${WEB_PORT}`
  })
})

app.post('/api/broker/start', async (req, res) => {
  try {
    const result = await startBroker()
    res.json({ success: true, ...result, ip: getLocalIP() })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

app.post('/api/broker/stop', async (req, res) => {
  try {
    const result = await stopBroker()
    res.json({ success: true, ...result })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

app.get('/api/topics', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.set('Pragma', 'no-cache')
  let topics = loadData()
  topics = topics.filter(t => !t.topic.startsWith('$SYS/'))
  const sysIdx = topics.findIndex(t => t.topic === '系统信息')
  if (sysIdx > 0) {
    const sysTopic = topics.splice(sysIdx, 1)[0]
    topics.unshift(sysTopic)
  }
  res.json(topics)
})

app.get('/api/topics/:topic', (req, res) => {
  const topics = loadData()
  const topic = topics.find(t => t.topic === req.params.topic)
  if (topic) {
    res.json(topic)
  } else {
    res.status(404).json({ error: '主题不存在' })
  }
})

app.delete('/api/topics/:topic', (req, res) => {
  if (req.params.topic === '系统信息') {
    return res.status(403).json({ error: '系统信息主题不可删除' })
  }
  let topics = loadData()
  topics = topics.filter(t => t.topic !== req.params.topic)
  saveData(topics)
  res.json({ success: true })
})

app.delete('/api/topics/:topic/messages', (req, res) => {
  const topics = loadData()
  const topic = topics.find(t => t.topic === req.params.topic)
  if (topic) {
    topic.messages = []
    saveData(topics)
    res.json({ success: true })
  } else {
    res.status(404).json({ error: '主题不存在' })
  }
})

app.delete('/api/topics', (req, res) => {
  const sysTopic = loadData().find(t => t.topic === '系统信息')
  saveData(sysTopic ? [sysTopic] : [])
  res.json({ success: true })
})

app.post('/api/topics/:topic/publish', (req, res) => {
  const { payload } = req.body
  if (!payload) {
    return res.status(400).json({ error: 'payload 不能为空' })
  }
  const topicName = req.params.topic

  // 确保主题存在于 JSON 中（但不保存消息，避免发送方看到自己的消息）
  const topics = loadData()
  if (!topics.find(t => t.topic === topicName)) {
    topics.push({ topic: topicName, messages: [] })
    saveData(topics)
  }

  if (broker) {
    const packet = { topic: topicName, payload, qos: 0, retain: false }
    packet.__fromHttp = true
    broker.publish(packet, () => {})
  }

  res.json({ success: true })
})

const httpServer = http.createServer(app)
ensureSystemTopic()
httpServer.listen(WEB_PORT, '0.0.0.0', () => {
  const ip = getLocalIP()
  console.log(`============================================`)
  console.log(`  IoT 内网服务已启动`)
  console.log(`  数据管理页面: http://${ip}:${WEB_PORT}`)
  console.log(`  MQTT Broker:   ${ip}:${BROKER_TCP_PORT} (TCP) / ${ip}:${BROKER_WS_PORT} (WebSocket)`)
  console.log(`  本地访问:      http://localhost:${WEB_PORT}`)
  console.log(`============================================`)
  console.log(`  ESP32/Mind+ 连接: IP ${ip}  端口 ${BROKER_TCP_PORT}  账号 siot  密码 dfrobot`)
  console.log(`  浏览器 MQTT.js:  ws://${ip}:${BROKER_WS_PORT}`)
  console.log(`============================================`)
  console.log(`\x1b[94m提示: 在可视化面板中点击"内网服务"可开关MQTT Broker\x1b[0m`)
  console.log(``)
  console.log(`\x1b[33m注意: 完全打开内网需要用可视化面板打开 Broker 服务！否则主板将无法连接！\x1b[0m`)
  console.log(``)
  console.log(`\x1b[31m警告: 关闭此窗口将停止所有服务\x1b[0m`)
  console.log(`============================================`)
})