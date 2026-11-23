<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { formatNumber } from '../ui/profile'

const props = withDefaults(defineProps<{ value: number; unit?: string; align?: 'start' | 'center' | 'end' }>(), {
  align: 'center',
})
const text = computed(() => formatNumber(props.value) + (props.unit ? '\u00a0' + props.unit : ''))
const area = ref<HTMLSpanElement>()
const ink = ref<HTMLSpanElement>()
let observer: ResizeObserver | undefined
let scale = 1

function fit() {
  const box = area.value
  const number = ink.value
  if (!box || !number) return
  const bounds = box.getBoundingClientRect()
  const line = number.getBoundingClientRect()
  if (!bounds.width || !bounds.height || !line.width || !line.height) return
  // Italic overhang and negative tracking can extend the last glyph past its line box.
  const range = document.createRange()
  range.selectNodeContents(number)
  const glyphs = range.getBoundingClientRect()
  const x = line.left + line.width / 2
  const y = line.top + line.height / 2
  const naturalWidth = 2 * Math.max(line.width / 2, x - glyphs.left, glyphs.right - x) / scale
  const naturalHeight = 2 * Math.max(line.height / 2, y - glyphs.top, glyphs.bottom - y) / scale
  scale = Math.min(1, (bounds.width - 2) / naturalWidth, bounds.height / naturalHeight)
  const half = naturalWidth * scale / 2 + 1
  const center = props.align === 'start' ? half : props.align === 'end' ? bounds.width - half : bounds.width / 2
  number.style.setProperty('--number-fit', String(scale))
  number.style.left = center + 'px'
}

// ResizeObserver runs before paint, including when a font swap changes the ink width.
onMounted(() => {
  fit()
  observer = new ResizeObserver(fit)
  observer.observe(area.value!)
  observer.observe(ink.value!)
})
watch(() => props.align, fit, { flush: 'post' })
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <span ref="area" class="result-digits"><span ref="ink" class="result-digits__ink">{{ text }}</span></span>
</template>

<style scoped>
.result-digits { position: relative; display: block; width: 100%; height: 100%; min-width: 0; }
.result-digits__ink {
  position: absolute; width: max-content; top: 50%; left: 50%; white-space: pre; line-height: 1;
  transform-origin: center; transform: translate(-50%, -50%) scale(var(--number-fit, 1)) skewX(var(--number-slant, 0deg)) scaleX(var(--number-stretch, 1));
}
</style>
