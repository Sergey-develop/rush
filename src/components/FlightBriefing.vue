<script setup lang="ts">
import { CornerUpRight, Gauge, Layers3, ScanLine } from 'lucide-vue-next'
import '../styles/briefing.scss'
import TiltControl from './TiltControl.vue'

defineProps<{ touch: boolean; busy: boolean }>()
defineEmits<{ start: []; back: [] }>()
</script>

<template>
  <section class="race-sheet flight-briefing">
    <header class="race-head"><h2 id="dialog-title" tabindex="-1" autofocus>Как играть</h2></header>
    <div class="race-body briefing-body" role="region" aria-label="Управление полётом" tabindex="0">
      <ul class="briefing-list">
        <li>
          <ScanLine aria-hidden="true"/>
          <div>
            <h3>Попадите в проём</h3>
            <p v-if="touch">Коснитесь экрана на нужной высоте: сверху, в центре или снизу. Можно также вести пальцем.</p>
            <p v-else>Двигайте мышь вверх или вниз, чтобы пролететь через проём в поле.</p>
          </div>
        </li>
        <li v-if="touch">
          <Layers3 aria-hidden="true"/>
          <TiltControl/>
        </li>
        <li v-else>
          <Gauge aria-hidden="true"/>
          <div><h3>Включите форсаж</h3><p>Зажмите левую кнопку мыши, чтобы ускориться и получать больше очков за каждый метр.</p></div>
        </li>
        <li>
          <CornerUpRight aria-hidden="true"/>
          <div><h3>Следите за стрелками</h3><p>Стрелки показывают следующий поворот. Корабль повернёт сам.</p></div>
        </li>
      </ul>
    </div>
    <footer class="race-foot">
      <button class="race-primary" type="button" :disabled="busy" :aria-busy="busy" @click="$emit('start')">
        <span aria-live="polite">{{ busy ? 'Загрузка трека' : 'Начать полёт' }}</span>
      </button>
      <button class="race-secondary" type="button" @click="$emit('back')">Назад</button>
    </footer>
  </section>
</template>
