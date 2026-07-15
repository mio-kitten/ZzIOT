/**
 * 涟漪特效组件
 * 在连接成功或失败时显示潮汐散射动画效果，增强视觉反馈
 */
<script setup lang="ts">
export interface RippleItem {
  id: number
  type: 'success' | 'error'
}

defineProps<{
  ripples: RippleItem[]
}>()
</script>

<template>
  <div class="ripple-overlay" aria-hidden="true">
    <div
      v-for="r in ripples"
      :key="r.id"
      class="ripple-unit"
    >
      <!-- 潮汐散射拖尾 - 贪吃蛇 tide 效果 -->
      <div class="tide" :class="r.type"></div>
      <!-- 光波前沿 - 锐利边框 -->
      <div class="ring" :class="r.type"></div>
    </div>
  </div>
</template>

<style scoped>
.ripple-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 48px;
  z-index: 99998;
  pointer-events: none;
  overflow: hidden;
}

.ripple-unit {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

/* 潮汐散射拖尾 - 贪吃蛇 tide 效果 */
.tide {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  transform-origin: center top;
  pointer-events: none;
  opacity: 0;
  animation: tideExpand 1.2s ease-out forwards,
             tideFade 1.5s ease-out 1.2s forwards;
}

.tide.success {
  background: radial-gradient(ellipse at center top, rgba(0, 200, 80, 0.85) 0%, rgba(0, 200, 80, 0.45) 25%, rgba(0, 200, 80, 0.18) 50%, transparent 72%);
}

.tide.error {
  background: radial-gradient(ellipse at center top, rgba(255, 50, 50, 0.8) 0%, rgba(255, 50, 50, 0.4) 25%, rgba(255, 50, 50, 0.15) 50%, transparent 72%);
}

@keyframes tideExpand {
  0%   { opacity: 1; transform: scale(0.5); }
  100% { opacity: 1; transform: scale(6); }
}

@keyframes tideFade {
  0%   { opacity: 1; }
  100% { opacity: 0; }
}

/* 光波前沿 - 锐利边框，从中心顶部扩到整个顶栏 */
.ring {
  position: absolute;
  left: 50%;
  top: 0;
  width: 20px;
  height: 20px;
  margin-left: -10px;
  margin-top: -10px;
  border-radius: 50%;
  transform-origin: center center;
  animation: ringExpand 1.2s ease-out forwards;
}

.ring.success {
  border: 2.5px solid rgba(0, 200, 80, 1);
  box-shadow: 0 0 16px 6px rgba(0, 200, 80, 0.65);
}

.ring.error {
  border: 2.5px solid rgba(255, 50, 50, 1);
  box-shadow: 0 0 16px 6px rgba(255, 50, 50, 0.6);
}

@keyframes ringExpand {
  0%   { transform: scale(0.05); opacity: 1; }
  50%  { transform: scale(50); opacity: 1; }
  100% { transform: scale(100); opacity: 0; }
}
</style>