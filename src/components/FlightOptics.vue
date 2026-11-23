<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

const lens = ref<HTMLCanvasElement>()
let observer: ResizeObserver | undefined

function drawLens() {
  const canvas = lens.value
  if (!canvas) return
  const { width, height } = canvas.getBoundingClientRect()
  if (!width || !height) return
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.round(width * pixelRatio)
  canvas.height = Math.round(height * pixelRatio)
  const context = canvas.getContext('2d')
  if (!context) return

  // Preserve the original 560 × 96 cockpit etching at both aspect ratios.
  context.scale(canvas.width / 560, canvas.height / 96)
  const edge = context.createLinearGradient(0, 0, 560, 0)
  for (const [stop, color] of [
    [0, '#6e7cff00'], [.07, '#a4c3ff'], [.26, '#b3a8ff'], [.44, '#8099ff55'],
    [.5, '#8faaff11'], [.56, '#8099ff55'], [.74, '#b3a8ff'], [.93, '#a4c3ff'], [1, '#6e7cff00'],
  ] as const) edge.addColorStop(stop, color)
  const minimumStroke = .50 / Math.min(width / 560, height / 96)
  context.strokeStyle = edge
  context.shadowColor = '#626bff'
  context.shadowBlur = 5
  context.lineWidth = Math.max(1.4, minimumStroke)
  context.stroke(new Path2D('M0 95L36 58Q42 51 56 48L84 43 M78 42Q158 12 258 15 M302 15Q402 12 482 42 M476 43L504 48Q518 51 524 58L560 95'))
  context.lineWidth = Math.max(.85, minimumStroke)
  context.stroke(new Path2D('M24 95L62 61L74 58L69 65 M536 95L498 61L486 58L491 65 M171 91Q280 59 389 91'))

  context.shadowBlur = 0
  context.strokeStyle = 'rgba(153,173,255,.63)'
  context.lineWidth = Math.max(.8, minimumStroke * .8)
  context.beginPath()
  for (let tick = -30; tick <= 30; tick++) {
    const x = 280 + tick * 3.3
    const y = 27 + (tick / 30) ** 2 * 8
    context.moveTo(x, y)
    context.lineTo(x, y + (tick % 5 === 0 ? 6 : 3))
  }
  context.stroke()
}

onMounted(() => {
  if (!lens.value) return
  drawLens()
  observer = new ResizeObserver(drawLens)
  observer.observe(lens.value)
})
onUnmounted(() => observer?.disconnect())
</script>

<template>
  <canvas ref="lens" class="cockpit-arc" aria-hidden="true"/>
  <div class="flight-optics" aria-hidden="true"><i/><i/></div>
</template>
