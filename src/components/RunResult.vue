<script setup lang="ts">
import ResultDigits from './ResultDigits.vue'

defineProps<{ score: number; distance: number; busy: boolean; finished: boolean; track?: string }>()
const emit = defineEmits<{ retry: []; menu: [] }>()
</script>

<template>
  <section class="race-sheet run-result" :data-result="finished ? 'finished' : 'barrier'">
    <header class="race-head">
      <h2 id="dialog-title">{{ finished ? 'Трек пройден' : 'Результат' }}</h2>
    </header>
    <div class="race-body run-result__body">
      <div class="run-result__metrics">
        <div class="run-result__score"><span class="result-label">Счёт</span><strong><ResultDigits :value="score"/></strong></div>
        <div class="run-result__distance"><span class="result-label">Дистанция</span><strong><ResultDigits :value="distance" unit="м"/></strong></div>
        <p class="run-result__reason">{{ finished ? (track ? '«' + track + '»' : 'Все поля пройдены') : 'Столкновение с силовым полем' }}</p>
      </div>
    </div>
    <footer class="race-foot">
      <button type="button" class="race-primary" :disabled="busy" @click="emit('retry')" autofocus>Ещё раз</button>
      <button type="button" class="race-secondary" :disabled="busy" @click="emit('menu')">Главное меню</button>
    </footer>
  </section>
</template>

<style scoped>
.run-result__body { display: grid; align-items: center; min-width: 0; min-height: 0; }
.run-result__metrics {
  position: relative; min-width: 0; min-height: 0; width: 100%; height: 100%; max-height: 56cqw; container-type: size;
  display: grid; grid-template-rows: minmax(0,1fr) minmax(19px,.29fr) minmax(16px,.20fr);
  color: #fff5e9;
}
.run-result__score,.run-result__distance { min-width: 0; min-height: 0; position: relative; }
.run-result__metrics strong { display: block; width: 100%; height: 100%; font-family: 'Russo One','Exo 2',sans-serif;
  font-weight: 400; font-variant-numeric: tabular-nums; line-height: 1; }
.run-result__score strong { font-size: min(33cqw,106cqh); letter-spacing: .004em; --number-stretch: 1.065;
  -webkit-text-stroke: .005em currentColor; }
.run-result__distance strong { font-size: min(7.6cqw,26cqh); --number-stretch: 1.035; }
.run-result__reason { align-self: center; margin: 0; min-width: 0; text-align: center; color: #d7c5ce;
  font: 580 clamp(10px,2.9cqw,16px)/1.1 'Exo 2',sans-serif; overflow-wrap: anywhere; }
.result-label { position: absolute; width: 1px; height: 1px; margin: -1px; white-space: nowrap; clip-path: inset(50%); overflow: hidden; }
.run-result__metrics { animation: stat-appear .42s cubic-bezier(.18,.7,.2,1) both; }
@keyframes stat-appear { from { opacity: .65; translate: 0 5px; } to { opacity: 1; translate: 0 0; } }
@media (prefers-reduced-motion: reduce) { .run-result__metrics { animation: none; } }
</style>
