/**
 * MQTT 客户端封装
 * 支持巴法云 MQTT（WSS）和 SIoT（WS）两种连接方式
 * 负责连接/断开、订阅/取消订阅、发送消息、接收消息解析
 */
import mqtt from 'mqtt'
import type { MqttClient, IClientOptions } from 'mqtt'
import type { PlatformConfig, ParsedData } from '@/types'

export class MqttClientWrapper {
  private client: MqttClient | null = null
  private onMessageCallback: ((topic: string, message: string) => void) | null = null
  private onStatusChange: ((connected: boolean) => void) | null = null
  private connectResolve: (() => void) | null = null
  private connectReject: ((error: Error) => void) | null = null
  private subscribedTopics: Set<string> = new Set()

  connect(config: PlatformConfig): Promise<void> {
    // 先断开旧连接，避免重复连接导致旧连接残留
    if (this.client) {
      this.client.end(true)
      this.client = null
      this.subscribedTopics.clear()
    }

    return new Promise((resolve, reject) => {
      this.connectResolve = resolve
      this.connectReject = reject
      
      let url: string
      let options: IClientOptions = {}
      
      if (config.platform === 'bafayun') {
        const bafayun = config.bafayun
        url = `wss://${bafayun.server}:${bafayun.port}/wss`
        options = {
          clientId: bafayun.privateKey || `mqtt_${Math.random().toString(16).substr(2, 8)}`,
          username: bafayun.privateKey,
          password: '',
          clean: true,
          connectTimeout: 10000,
          keepalive: 60,
          protocolId: 'MQTT',
          protocolVersion: 4,
          reconnectPeriod: 0
        }
      } else {
        const siot = config.siot
        url = `ws://${siot.server}:${siot.port}/ws`
        const isInternal = siot.port === 1853
        options = {
          username: isInternal ? '' : siot.username,
          password: isInternal ? '' : siot.password,
          clientId: `iot-visualization-${Date.now()}`,
          clean: true,
          connectTimeout: 10000,
          keepalive: 60,
          protocolId: 'MQTT',
          protocolVersion: 4,
          reconnectPeriod: 0
        }
      }

      console.log('MQTT连接参数:', { url, options })

      try {
        this.client = mqtt.connect(url, options)

        this.client.on('connect', () => {
          console.log('MQTT连接成功')
          this.onStatusChange?.(true)
          if (this.connectResolve) {
            this.connectResolve()
            this.connectResolve = null
          }
        })

        this.client.on('error', (error) => {
          console.error('MQTT连接错误:', error)
          this.onStatusChange?.(false)
          if (this.connectReject) {
            this.connectReject(error)
            this.connectReject = null
          }
        })

        this.client.on('close', () => {
          console.log('MQTT连接关闭')
          this.onStatusChange?.(false)
        })

        this.client.on('disconnect', () => {
          console.log('MQTT断开连接')
          this.onStatusChange?.(false)
        })

        this.client.on('message', (topic, payload) => {
          const message = payload.toString()
          this.onMessageCallback?.(topic, message)
        })

        setTimeout(() => {
          if (this.connectReject && !this.isConnected()) {
            this.connectReject(new Error('连接超时'))
            this.connectReject = null
          }
        }, 10000)
      } catch (error) {
        console.error('MQTT连接初始化失败:', error)
        reject(error as Error)
      }
    })
  }

  subscribe(topics: string[]): void {
    if (this.client) {
      topics.forEach(topic => {
        if (!this.subscribedTopics.has(topic)) {
          this.client?.subscribe(topic)
          this.subscribedTopics.add(topic)
        }
      })
    }
  }

  unsubscribe(topics: string[]): void {
    if (this.client) {
      topics.forEach(topic => {
        this.client?.unsubscribe(topic)
        this.subscribedTopics.delete(topic)
      })
    }
  }

  /** 取消所有订阅 */
  unsubscribeAll(): void {
    if (this.client && this.subscribedTopics.size > 0) {
      const topics = Array.from(this.subscribedTopics)
      topics.forEach(topic => {
        this.client?.unsubscribe(topic)
      })
      this.subscribedTopics.clear()
    }
  }

  publish(topic: string, message: string): void {
    if (this.client) {
      this.client.publish(topic, message)
    }
  }

  disconnect(): void {
    if (this.client) {
      this.client.end(true)
      this.client = null
    }
    this.subscribedTopics.clear()
  }

  setOnMessageCallback(callback: (topic: string, message: string) => void): void {
    this.onMessageCallback = callback
  }

  setOnStatusChange(callback: (connected: boolean) => void): void {
    this.onStatusChange = callback
  }

  isConnected(): boolean {
    return this.client?.connected ?? false
  }
}

export function parseData(message: string): ParsedData | null {
  const parts = message.split('\\')
  if (parts.length !== 2) {
    return null
  }
  
  const index = parseInt(parts[0])
  const value = parseFloat(parts[1])
  
  if (isNaN(index) || isNaN(value)) {
    return null
  }
  
  return { index, value }
}