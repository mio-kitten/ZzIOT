/**
 * 装饰文本组件
 * 用于显示自定义文本内容，支持多种隐藏模式
 */
<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  config: {
    content: string
    textColor: string
    fontSize: number
    fontWeight: 'normal' | 'bold'
  }
}>()

const textStyle = computed(() => ({
  color: props.config.textColor,
  fontSize: `${props.config.fontSize}px`,
  fontWeight: props.config.fontWeight
}))
</script>

<template>
  <div class="decorative-text-widget">
    <div class="text-content" :style="textStyle">
      {{ config.content || '请在属性中设置文本内容' }}
    </div>
  </div>
</template>

<style scoped>
.decorative-text-widget {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  box-sizing: border-box;
}

.text-content {
  text-align: center;
  word-break: break-all;
  line-height: 1.5;
}
</style>