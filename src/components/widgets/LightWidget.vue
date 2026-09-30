<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { LightColorConfig } from '@/types'

const props = defineProps<{
  config: {
    topic?: string
    colors?: LightColorConfig[]
  }
  data?: Record<string, any[]>
}>()

const currentColor = computed(() => {
  const colors = props.config.colors || []
  const topicData = props.data

  if (!topicData || colors.length === 0) {
    return null
  }

  const latestEntry = topicData[Object.keys(topicData)[0]]
  if (!latestEntry || latestEntry.length === 0) {
    return null
  }

  const lastMessage = (latestEntry[latestEntry.length - 1] as any)?.value
  if (lastMessage === undefined) {
    return null
  }

  if (lastMessage === 'off' || lastMessage === 'OFF') {
    return 'off'
  }

  const matched = colors.find(c => c.matchValue && c.matchValue === lastMessage)
  if (matched) {
    return matched.color
  }

  return null
})

const isOff = computed(() => currentColor.value === 'off')
const hasData = computed(() => {
  const d = props.data
  if (!d) return false
  return Object.keys(d).length > 0
})
const showX = computed(() => isOff.value || !hasData.value)

const lastColor = ref<string | null>(null)
watch(currentColor, (val) => {
  if (val && val !== 'off') {
    lastColor.value = val
  }
})

const displayBg = computed(() => {
  if (showX.value) return '#d0d0d0'
  if (currentColor.value && currentColor.value !== 'off') return currentColor.value
  return lastColor.value || '#d0d0d0'
})
</script>

<template>
  <div class="light-widget">
    <div class="light-outer-circle">
      <div
        class="light-inner-circle"
        :style="{
          backgroundColor: displayBg
        }"
      >
        <svg
          v-if="showX"
          width="60%"
          height="60%"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#ffffff"
          stroke-width="2"
          stroke-linecap="round"
        >
          <path d="M18 6L6 18" />
          <path d="M6 6l12 12" />
        </svg>
      </div>
    </div>
    <div class="light-dashes">
      <span class="light-dash"></span>
      <span class="light-dash"></span>
      <span class="light-dash"></span>
    </div>
  </div>
</template>

<style scoped>
.light-widget {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.light-outer-circle {
  aspect-ratio: 1 / 1;
  width: 80%;
  height: auto;
  max-height: 80%;
  border-radius: 50%;
  background: #ffffff;
  border: 3px solid #e0e0e0;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.light-inner-circle {
  width: 82%;
  height: 82%;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.15s ease;
}

.light-dashes {
  display: flex;
  flex-direction: row;
  gap: 4px;
  align-items: center;
}

.light-dash {
  width: 3px;
  height: 12px;
  background: #d0d0d0;
}
</style>