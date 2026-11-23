<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

const artwork = ref<HTMLCanvasElement>()
let observer: ResizeObserver | undefined

// Purpose-drawn letterforms preserve the slashed, italic silhouettes at every scale.
const letters: Record<string, { w: number; d: string }> = {
  C: { w: 54, d: 'M54 0H16Q3 0 3 13V31Q3 44 16 44H52V33H19Q15 33 15 29V16Q15 11 20 11H54Z' },
  O: { w: 60, d: 'M15 0H47Q58 0 58 12V31Q58 44 45 44H14Q2 44 2 32V13Q2 0 15 0Z M19 11Q15 11 15 16V29Q15 33 20 33H41Q45 33 45 28V15Q45 11 41 11Z' },
  R: { w: 60, d: 'M2 0H45Q57 0 57 12V17Q57 27 44 29L58 44H41L27 29H15V44H2V19H40Q45 19 45 15V14Q45 11 40 11H14Z' },
  I: { w: 16, d: 'M2 0H15V44H2Z' },
  D: { w: 59, d: 'M2 0H41Q57 0 57 15V28Q57 44 41 44H2V16H15V33H39Q44 33 44 27V17Q44 11 38 11H14Z' },
  U: { w: 60, d: 'M2 0H15V28Q15 33 20 33H39Q45 33 45 28V0H58V30Q58 44 44 44H16Q2 44 2 31Z' },
  S: { w: 56, d: 'M55 0H17Q2 0 2 13V16Q2 26 15 26H38Q42 26 42 29V30Q42 33 38 33H1V44H40Q55 44 55 31V28Q55 17 41 17H19Q15 17 15 14Q15 11 19 11H55Z' },
  H: { w: 58, d: 'M2 0H15V16H43V0H56V44H43V27H15V44H2Z' },
}

function draw() {
  const canvas = artwork.value
  if (!canvas) return
  const bounds = canvas.getBoundingClientRect()
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.max(1, Math.round(bounds.width * dpr))
  canvas.height = Math.max(1, Math.round(bounds.height * dpr))
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.scale(canvas.width / 548, canvas.height / 193)
  function trail(d: string, stops: [number, string][], glow = false) {
    const gradient = ctx!.createLinearGradient(10, 0, 540, 0)
    stops.forEach(([point, color]) => gradient.addColorStop(point, color))
    ctx!.fillStyle = gradient
    ctx!.shadowColor = '#cf33ff'
    ctx!.shadowBlur = glow ? 7 : 0
    ctx!.fill(new Path2D(d))
    ctx!.shadowBlur = 0
  }
  trail('M75 185C179 191 453 144 513 91C552 58 508 41 427 35C512 37 560 56 517 94C453 147 175 193 75 185Z', [[0,'#54106e00'],[0.4,'#8f19ba99'],[0.84,'#a53ce0'],[1,'#f47aff']], true)
  trail('M251 164C412 136 506 94 506 68Q506 49 456 41Q511 47 508 69C506 96 411 138 251 164Z', [[0,'#54106e00'],[0.7,'#8624bf'],[1,'#d75bf9']])
  trail('M0 104Q49 76 145 77Q49 77 0 104Z M3 128Q59 109 204 115Q78 111 3 128Z', [[0,'#b935e300'],[0.3,'#a438c47a'],[1,'#a438c400']])
  function word(text: string, x: number, y: number, sx: number, sy: number) {
    ctx!.save()
    ctx!.transform(sx, 0, -0.5 * sy, sy, x, y)
    const gradient = ctx!.createLinearGradient(0, 0, 0, 44)
    gradient.addColorStop(0, '#ffffff')
    gradient.addColorStop(0.36, '#f7eaff')
    gradient.addColorStop(0.51, '#ead6ff')
    gradient.addColorStop(0.54, '#c899ef')
    gradient.addColorStop(0.82, '#c88df9')
    gradient.addColorStop(1, '#e4bcff')
    ctx!.fillStyle = gradient
    ctx!.lineWidth = 0.75
    ctx!.strokeStyle = '#edd1ff'
    ctx!.shadowColor = '#af4fff'
    ctx!.shadowBlur = 4
    for (const letter of text) {
      const glyph = letters[letter]!
      const path = new Path2D(glyph.d)
      ctx!.fill(path, 'evenodd')
      ctx!.stroke(path)
      ctx!.translate(glyph.w + 2, 0)
    }
    ctx!.restore()
  }
  word('CORRIDOR', 42, 11, .98, 1.02)
  word('RUSH', 103, 72, 1.30, 1.35)
  trail('M39 92L178 87L179 89Z M149 111L403 106L414 107Z', [[0,'#ef8cff00'],[0.4,'#f8c2ffb0'],[1,'#e79aff00']])
}
onMounted(() => { draw(); if (artwork.value) { observer = new ResizeObserver(draw); observer.observe(artwork.value) } })
onUnmounted(() => observer?.disconnect())
</script>

<template>
  <h1 class="game-logo" aria-label="Corridor Rush — Arcade Runner">
    <span class="game-logo__genre" aria-hidden="true">ARCADE RUNNER</span>
    <canvas ref="artwork" aria-hidden="true" />
  </h1>
</template>

