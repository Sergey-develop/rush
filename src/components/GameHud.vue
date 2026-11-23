<script setup lang="ts">
import { CornerUpLeft, CornerUpRight } from 'lucide-vue-next'
import { onBeforeUnmount, ref, watch } from 'vue'
import type { GameFrame } from '../game/contracts'
import FlightOptics from './FlightOptics.vue'
import ResultDigits from './ResultDigits.vue'
const props = defineProps<{ frame: GameFrame }>()
defineEmits<{ pause: []; impulse: [] }>()
const hudScore = ref(props.frame.score)
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
let animation = 0
let lastTick = 0
let position = hudScore.value

function settle() {
  cancelAnimationFrame(animation)
  animation = 0
  position = props.frame.score
  hudScore.value = position
}

function countBonus(now: number) {
  const target = props.frame.score
  const elapsed = Math.max(0, now - lastTick)
  lastTick = now
  const previous = position
  position += (target - position) * (1 - Math.exp(-elapsed / 70))
  // At very large scores a sub-point easing step can round back to the same number.
  if (target - position <= 1.5 || (elapsed > 0 && position === previous) || reducedMotion.matches) { settle(); return }
  hudScore.value = Math.floor(position)
  animation = requestAnimationFrame(countBonus)
}

// Distance points already arrive at reading speed. Ease only the larger gate awards.
watch(() => [props.frame.score, props.frame.phase] as const, ([target, phase], [previous]) => {
  if (phase !== 'playing' || target < previous || reducedMotion.matches) { settle(); return }
  if (animation) return
  if (target - previous < 10) { settle(); return }
  lastTick = performance.now()
  animation = requestAnimationFrame(countBonus)
})
onBeforeUnmount(() => cancelAnimationFrame(animation))
</script>
<template>
  <div class="hud">
    <FlightOptics v-if="frame.phase==='playing'"/>
    <template v-if="frame.phase==='playing'">
      <Transition name="echo-light"><div v-if="frame.echo" class="echo-dark" :class="{'echo-dim':frame.visualEcho}" aria-hidden="true"/></Transition>
      <small v-if="frame.echo && frame.visualEcho" class="echo-caption">{{ {top:'Проём сверху',center:'Проём по центру',bottom:'Проём снизу'}[frame.echo] }}</small>
      <div v-if="frame.grazes || frame.breaks" :key="(frame.grazes??0)+'-'+(frame.breaks??0)" class="field-wake" aria-hidden="true"/>
      <button class="impulse-control" :disabled="frame.charge!==3 || frame.armed" @click="$emit('impulse')" aria-label="Активировать импульс">
        <span v-for="i in 3" :key="i" :class="{charged:(frame.charge??0)>=i}"></span>
        <b v-if="frame.charge===3">{{ frame.armed?'Пробой готов':'Импульс' }}</b>
      </button>
    </template>
    <div class="hud-score">
      <span class="hud-label">Счёт</span>
      <i class="hud-strike" aria-hidden="true"/>
      <strong><ResultDigits :value="hudScore" align="start"/></strong>
      <div v-if="frame.phase==='playing'" class="hud-secondary">
        <span v-if="frame.combo>1" class="hud-combo">Комбо × {{ frame.combo }}</span>
        <span v-if="frame.boostLevel && frame.boostLevel>.03 && frame.speed" class="hud-boost">
          Форсаж · {{ Math.round(frame.speed*3.6) }} км/ч
        </span>
      </div>
    </div>
    <div class="hud-actions">
      <span class="hud-bpm">{{ frame.bpm }} BPM</span>
      <button class="pause-button" aria-label="Пауза" @click="$emit('pause')"><i/><i/></button>
    </div>
    <Transition name="turn-cue">
      <div v-if="frame.phase==='playing' && (frame.hint==='left'||frame.hint==='right')" :key="frame.hint" class="turn-hint" role="img" :aria-label="frame.hint==='left' ? 'Левый поворот' : 'Правый поворот'">
        <CornerUpLeft v-if="frame.hint==='left'"/><CornerUpRight v-else/>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.turn-cue-enter-active { transition: opacity .3s ease-out; }
.turn-cue-leave-active { transition: opacity .16s ease-in; }
.turn-cue-enter-from, .turn-cue-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .turn-cue-enter-active, .turn-cue-leave-active { transition: none; }
}
</style>
