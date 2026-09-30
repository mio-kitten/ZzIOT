/**
 * 应用入口文件
 * 创建 Vue 应用实例，挂载全局样式和根组件到 #app 节点
 */
import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

createApp(App).mount('#app')