<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  config: {
    imageData?: string | null
    imageName?: string
  }
}>()

const hasImage = computed(() => !!props.config.imageData)
</script>

<template>
  <div class="image-widget">
    <img
      v-if="hasImage"
      :src="config.imageData!"
      :alt="config.imageName || '图片'"
      class="image-display"
    />
    <div v-else class="image-placeholder">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#bbb" stroke-width="1.5">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>
      <span class="placeholder-text">请在属性中导入图片</span>
    </div>
  </div>
</template>

<style scoped>
.image-widget {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.image-display {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.image-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #bbb;
}

.placeholder-text {
  font-size: 12px;
  color: #aaa;
}
</style>