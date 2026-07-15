/**
 * 命令窗口警告弹窗
 * 提醒用户不要关闭后台运行的服务命令窗口，避免面板功能异常
 */
<template>
  <div class="cmd-warning-overlay" @click.self="$emit('close')">
    <div class="cmd-warning-modal">
      <div class="warning-icon">⚠️</div>
      <div class="warning-title">请勿关闭系统命令窗口</div>
      <div class="warning-body">
        <p>后台运行的命令窗口（有黄绿色字符的）是可视化面板的<strong>核心服务</strong>，请勿关闭。</p>
        <p>关闭命令窗口将会导致面板<strong>无法正常使用</strong>，包括数据刷新、图表更新等功能。</p>
        <p>如果关闭了，请使用一键启动里面的<strong>只启用服务不自动打开（手动模式）</strong>，然后<strong>刷新页面</strong>即可。</p>
        <p>如果是内网的系统命令窗口，只需用手动打开（同上）即可，但是<strong>不用刷新页面</strong>。</p>
      </div>
      <div class="warning-footer">
        <button class="warning-btn" @click="$emit('close')">我知道了</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineEmits<{
  close: []
}>()
</script>

<style scoped>
.cmd-warning-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 99999;
}

.cmd-warning-modal {
  background: #fffbe6;
  border: 2px solid #ffe58f;
  border-radius: 12px;
  padding: 32px 36px;
  max-width: 420px;
  width: 90%;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  text-align: center;
}

.warning-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.warning-title {
  font-size: 18px;
  font-weight: 700;
  color: #ad6800;
  margin-bottom: 16px;
}

.warning-body {
  font-size: 14px;
  color: #5a4000;
  line-height: 1.7;
  text-align: left;
}

.warning-body p {
  margin: 6px 0;
}

.warning-body strong {
  color: #d4380d;
}

.warning-footer {
  margin-top: 20px;
}

.warning-btn {
  background: #ffa940;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 8px 28px;
  font-size: 14px;
  cursor: pointer;
  font-weight: 600;
  transition: background 0.2s;
}

.warning-btn:hover {
  background: #fa8c16;
}
</style>