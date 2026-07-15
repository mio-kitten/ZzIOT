/**
 * 全局 TypeScript 类型定义
 * 包含项目、组件、平台配置、MQTT 数据等所有核心数据结构
 */
export interface SiotConfig {
  server: string
  port: number
  username: string
  password: string
}

export interface BafayunConfig {
  server: string
  port: number
  privateKey: string
}

export interface PlatformConfig {
  platform: 'siot' | 'bafayun'
  siot: SiotConfig
  bafayun: BafayunConfig
}

export interface ThemeConfig {
  id: string
  name: string
  topic: string
  color: string
}

export interface LineChartWidgetConfig {
  id: string
  title: string
  width: number
  height: number
  x: number
  y: number
  maxDataPoints: number
  yAxisUnit: string
  displayMode: 'multiTopic' | 'singleTopic'
  topic?: string
  themes: ThemeConfig[]
}

export interface Widget {
  id: string
  type: 'lineChart' | 'barChart' | 'text' | 'miniArea' | 'button' | 'switch' | 'slider' | 'input' | 'textarea'
  config: LineChartWidgetConfig | Record<string, unknown>
}

export interface Project {
  id: string
  name: string
  widgets: Widget[]
  platformConfig: PlatformConfig | null
  createdAt: string
  updatedAt: string
}

export interface DataPoint {
  timestamp: number
  value: number
  themeId: string
}

export interface ParsedData {
  index: number
  value: number
}