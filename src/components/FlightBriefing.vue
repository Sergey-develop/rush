<script setup lang="ts">
import { CornerUpRight, Gauge, Shield, Layers3, ScanLine } from 'lucide-vue-next'
import '../styles/briefing.scss'
import type { DesktopControl } from '../game/contracts'
import TiltControl from './TiltControl.vue'

const hidden = defineModel<boolean>('hidden', {required:true})
const tilt = defineModel<boolean>('tilt', {required:true})
defineProps<{ desktopControl: DesktopControl; touch: boolean; busy: boolean }>()
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
            <p v-if="touch">Наклоняйте телефон, чтобы попасть в проём. Для управления пальцем коснитесь экрана на нужной высоте.</p>
            <p v-else-if="desktopControl==='mouse'">Ведите мышь вверх или вниз, чтобы попасть в проём.</p>
            <p v-else>Удерживайте W или ↑ для подъёма, S или ↓ для снижения. Отпустите клавишу на нужной высоте.</p>
          </div>
        </li>
        <li v-if="touch">
          <Layers3 aria-hidden="true"/>
          <TiltControl v-model="tilt"/>
        </li>
        <li v-else>
          <Gauge aria-hidden="true"/>
          <div><h3>Включите форсаж</h3><p>Удерживайте Shift, чтобы ускориться и получать больше очков за каждый метр.</p></div>
        </li>
        <li>
          <Shield aria-hidden="true"/>
          <div>
            <h3>Подбирайте модули</h3>
            <p>Голубое поле защитит от одного удара. Двигатель с двумя огненными струями ускорит корабль на четыре секунды.<template v-if="!touch"> Удерживайте Shift, чтобы разогнаться ещё сильнее.</template></p>
          </div>
        </li>
        <li>
          <CornerUpRight aria-hidden="true"/>
          <div><h3>Следите за стрелками</h3><p>Стрелки показывают следующий поворот. Корабль повернёт сам.</p></div>
        </li>
      </ul>
    </div>
    <footer>
      <label class="briefing-choice"><input v-model="hidden" type="checkbox"/> Больше не показывать</label>
      <div class="race-foot">
        <button class="race-primary" type="button" :disabled="busy" :aria-busy="busy" @click="$emit('start')">
          <span aria-live="polite">{{ busy ? 'Загрузка трека' : 'Играть' }}</span>
        </button>
        <button class="race-secondary" type="button" @click="$emit('back')">Назад</button>
      </div>
    </footer>
  </section>
</template>
