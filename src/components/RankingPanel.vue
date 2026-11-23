<script setup lang="ts">
import { X } from 'lucide-vue-next'
import type { Run } from '../ui/profile'
import ResultDigits from './ResultDigits.vue'
import '../styles/ranking.scss'

defineProps<{ rows:Run[]; isDemo:boolean }>()
const period=defineModel<'week'|'all'>({required:true})
defineEmits<{back:[]}>()
</script>

<template>
  <section class="race-sheet race-ranking">
    <header class="race-head">
      <h2 id="dialog-title">Рейтинг</h2>
      <button type="button" class="race-close" aria-label="Закрыть" @click="$emit('back')"><X aria-hidden="true"/></button>
    </header>
    <div class="race-body">
      <div class="race-period" role="group" aria-label="Период рейтинга">
        <button :aria-pressed="period==='week'" @click="period='week'">Неделя</button>
        <button :aria-pressed="period==='all'" @click="period='all'">Всё время</button>
        <span v-if="isDemo" title="Демонстрационные результаты">Демо</span>
      </div>
      <ol v-if="rows.length" class="race-ranks">
        <li v-for="(run,i) in rows" :key="run.pilot" :class="{'race-rank--long':run.score>=1e7}"><span>{{ i+1 }}</span><strong>{{ run.pilot }}</strong><b><ResultDigits :value="run.score" align="end"/></b></li>
      </ol>
      <p v-else class="race-empty">На этой неделе пока нет результатов.</p>
    </div>
    <footer class="race-foot"><button type="button" class="race-primary" @click="$emit('back')">Назад</button></footer>
  </section>
</template>
