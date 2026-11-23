<script setup lang="ts">
import { computed } from 'vue'
import { ChevronRight, Headphones } from 'lucide-vue-next'
const props = defineProps<{progress: number; skipRequested: boolean}>()
defineEmits<{skip: []}>()
const percent = computed(() => Math.round(Math.min(1,Math.max(0,props.progress))*100))
</script>
<template>
  <section class="boot-screen" aria-label="Загрузка Corridor Rush">
    <div class="boot-ticket">
      <p class="boot-listening" lang="en"><Headphones aria-hidden="true"/>HEADPHONES RECOMMENDED</p>
      <div class="boot-readout"><span>Подготовка станции</span><b>{{ percent }}<small>%</small></b></div>
      <div class="boot-track" role="progressbar" aria-label="Подготовка станции" aria-valuemin="0"
           aria-valuemax="100" :aria-valuenow="percent"><i :style="{transform:'scaleX('+percent/100+')'}" /></div>
    </div>
    <button type="button" class="boot-skip" :disabled="skipRequested" @click="$emit('skip')">
      {{ skipRequested ? 'После загрузки' : 'Пропустить' }}<ChevronRight aria-hidden="true"/>
    </button>
  </section>
</template>
