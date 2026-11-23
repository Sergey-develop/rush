<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { ChevronLeft, ChevronRight, Volume2, VolumeX } from 'lucide-vue-next'
import type { PlayerOptions } from '../ui/profile'
import TiltControl from './TiltControl.vue'

const settings=defineModel<PlayerOptions>({ required:true })
const pointer=window.matchMedia('(pointer:coarse)')
const touch=ref(pointer.matches)
const sensitivity=ref<HTMLInputElement>()
const pilot=ref<HTMLInputElement>()
const formatSensitivity=new Intl.NumberFormat('ru-RU',{minimumFractionDigits:1,maximumFractionDigits:1})
function updatePointer() { touch.value=pointer.matches }
function show(input?:HTMLInputElement) {
  input?.focus({preventScroll:true})
  input?.scrollIntoView({block:'center'})
}
onMounted(()=>pointer.addEventListener('change',updatePointer))
onBeforeUnmount(()=>pointer.removeEventListener('change',updatePointer))
</script>

<template>
  <div class="race-settings-main">
    <div class="race-setting-line">
      <label for="volume">Громкость</label>
      <div class="race-sound">
        <button class="race-symbol" :aria-label="settings.muted?'Включить звук':'Выключить звук'" :aria-pressed="settings.muted" @click="settings.muted=!settings.muted">
          <VolumeX v-if="settings.muted" aria-hidden="true"/><Volume2 v-else aria-hidden="true"/>
        </button>
        <input id="volume" v-model.number="settings.volume" class="race-range" type="range" min="0" max="1" step=".01"
           :aria-valuetext="Math.round(settings.volume*100)+' %'" :style="{'--fill':settings.volume*100+'%'}"/>
      </div>
    </div>
    <div class="race-setting-line">
      <span>Управление</span>
      <button class="race-stepper race-control-link" type="button" :aria-label="'Настроить управление '+(touch?'касанием':'мышью')" @click="show(sensitivity)">
        <span aria-hidden="true"></span><strong>{{ touch?'Касание':'Мышь' }}</strong><ChevronRight aria-hidden="true"/>
      </button>
    </div>
    <div class="race-setting-line">
      <span id="quality-label">Графика</span>
      <div class="race-stepper" role="group" aria-labelledby="quality-label" @keydown.left.prevent="settings.quality='low'" @keydown.right.prevent="settings.quality='high'">
        <button type="button" aria-label="Низкая" :aria-pressed="settings.quality==='low'" title="Низкая" @click="settings.quality='low'"><ChevronLeft aria-hidden="true"/></button>
        <strong aria-live="polite">{{ settings.quality==='high'?'Высокая':'Низкая' }}</strong>
        <button type="button" aria-label="Высокая" :aria-pressed="settings.quality==='high'" title="Высокая" @click="settings.quality='high'"><ChevronRight aria-hidden="true"/></button>
      </div>
    </div>
    <button class="race-settings-more" type="button" @click="show(pilot)">Пилот и параметры полёта <ChevronRight aria-hidden="true"/></button>
  </div>
  <div class="race-settings-extra">
    <TiltControl v-if="touch"/>
    <div class="race-setting-line">
      <label for="sensitivity">Чувствительность</label>
      <div class="race-sensitive">
        <output for="sensitivity">{{ formatSensitivity.format(settings.sensitivity) }}×</output>
        <input id="sensitivity" ref="sensitivity" v-model.number="settings.sensitivity" class="race-range" type="range" min=".5" max="1.5" step=".1"
               :aria-valuetext="formatSensitivity.format(settings.sensitivity)+' ×'" :style="{'--fill':(settings.sensitivity-.5)*100+'%'}"/>
      </div>
    </div>
    <label class="race-setting-line race-invert"><span>Инверсия высоты</span>
      <span class="race-check"><input v-model="settings.invert" type="checkbox"/><span aria-hidden="true">{{ settings.invert?'Вкл.':'Выкл.' }}</span></span>
    </label>
    <div class="race-setting-line">
      <label for="pilot-call">Имя пилота</label>
      <input id="pilot-call" ref="pilot" v-model="settings.pilot" class="race-pilot-field" maxlength="18" placeholder="Пилот" spellcheck="false" autocomplete="off"
             @blur="settings.pilot=settings.pilot.trim() || 'Пилот'"/>
    </div>
    <details class="race-help"><summary>Как управлять</summary>
      <p>Ведите мышь или палец вверх и вниз, чтобы менять высоту. На поворотах направление меняется автоматически.</p>
      <p>Удерживайте левую кнопку мыши для форсажа. На полном форсаже каждый метр приносит вдвое больше очков.</p>
    </details>
  </div>
</template>
