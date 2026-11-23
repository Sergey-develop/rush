<script setup lang="ts">
import { tiltState, toggleTilt } from '../game/controls/tilt'
</script>
<template>
  <div class="tilt-control">
    <button type="button" class="race-secondary" :aria-pressed="tiltState==='on'" @click="toggleTilt">
      {{ tiltState==='on'?'Выключить наклон':tiltState==='waiting'?'Отменить':'Включить наклон' }}
    </button>
    <p aria-live="polite">{{ tiltState==='unavailable'?'Датчик недоступен. Управляйте касанием.':tiltState==='waiting'?'Держите телефон в удобном положении…':tiltState==='on'?'Поднимите верхний край для набора высоты, опустите для снижения.':'Держите телефон удобно и включите управление наклоном.' }}</p>
  </div>
</template>
