<script setup lang="ts">
import { enableTilt, stopTilt, tiltState } from '../game/controls/tilt'
const enabled = defineModel<boolean>({required:true})
function toggle() {
  const next = !enabled.value
  enabled.value = next
  if (next) void enableTilt()
  else stopTilt()
}
</script>
<template>
  <div class="tilt-control">
    <button type="button" class="race-secondary" :aria-pressed="enabled" @click="toggle">
      Наклон · {{ enabled ? 'вкл.' : 'выкл.' }}
    </button>
    <p aria-live="polite">{{ !enabled ? 'Меняйте высоту касанием.' : tiltState==='unavailable' ? 'Нет данных датчика. Можно управлять касанием.' : tiltState==='on' ? 'Поднимите верхний край для набора высоты, опустите для снижения.' : 'Держите телефон в удобном положении для калибровки.' }}</p>
    <button v-if="enabled && tiltState==='unavailable'" type="button" class="race-secondary" @click="enableTilt">Повторить подключение</button>
  </div>
</template>
