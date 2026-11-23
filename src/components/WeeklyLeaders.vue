<script setup lang="ts">
import { ArrowUpRight } from 'lucide-vue-next'
import { formatNumber, type Run } from '../ui/profile'
defineProps<{ rows: Run[]; isDemo: boolean }>()
defineEmits<{ open: [] }>()
</script>
<template>
  <aside class="poster-records" aria-label="Лидеры недели">
    <button class="poster-records-link" aria-label="Весь рейтинг" @click="$emit('open')">
      Лидеры недели<ArrowUpRight aria-hidden="true"/>
    </button>
    <div class="poster-records-list">
      <div v-if="isDemo" class="poster-records-demo">Демо</div>
      <ol v-if="rows.length">
        <li v-for="(row,i) in rows" :key="row.pilot"><span>{{ i+1 }}</span><span>{{ row.pilot }}</span><b>{{ formatNumber(row.score) }}</b></li>
      </ol>
      <p v-else>За неделю пока нет результатов.</p>
    </div>
  </aside>
</template>
