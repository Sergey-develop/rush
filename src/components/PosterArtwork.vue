<script setup lang="ts">
import { onMounted, ref } from 'vue'
import PosterWordmark from './PosterWordmark.vue'
import wide from '../assets/interface/rush-night.webp'
import portrait from '../assets/interface/rush-night-portrait.webp'
import wideType from '../assets/interface/rush-print.webp'
import portraitType from '../assets/interface/rush-print-portrait.webp'
import stripe from '../assets/interface/rush-ink.webp'
import ship from '../assets/interface/rush-craft.webp'

defineProps<{ returning: boolean; covered: boolean }>()
const background = ref<HTMLImageElement>()
const vehicle = ref<HTMLImageElement>()
const ink = ref<HTMLImageElement>()
const prepared = ref(false)
let preparing: Promise<void> | undefined

function ready() {
  if (!preparing) {
    const type = new Image()
    type.src = window.matchMedia('(orientation: portrait)').matches ? portraitType : wideType
    const layers = [background.value, ink.value, vehicle.value, type]
    preparing = Promise.all(layers.map(layer => layer?.decode().catch(() => {}))).then(() => {
      prepared.value = true
    })
  }
  return preparing
}
onMounted(ready)
defineExpose({ ready })
</script>
<template>
  <div class="poster-art" :class="{
      'poster-art--ready': prepared,
      'poster-art--return': returning,
      'poster-art--covered': covered,
    }" aria-hidden="true">
    <picture class="poster-stock">
      <source media="(orientation: portrait)" :srcset="portrait"/>
      <img ref="background" :src="wide" alt="" fetchpriority="high" draggable="false"/>
    </picture>
    <div class="poster-press">
      <img ref="ink" :src="stripe" class="poster-ink" alt="" draggable="false"/>
      <img :src="stripe" class="poster-ink poster-ink--far" alt="" draggable="false"/>
    </div>
    <PosterWordmark :immediate="returning"/>
    <div class="poster-craft-position"><div class="poster-craft-entry">
      <img ref="vehicle" :src="ship" class="poster-craft" alt="" fetchpriority="high" draggable="false"/>
    </div></div>
  </div>
</template>
