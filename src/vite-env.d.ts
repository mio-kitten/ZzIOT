/**
 * Vite 环境类型声明
 * 引用 Vite 客户端类型，并声明 .vue 文件模块类型
 */
/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}