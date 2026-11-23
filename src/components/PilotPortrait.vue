<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'

const props = defineProps<{ variant: number }>()
const portrait = ref<HTMLCanvasElement>()

function draw() {
  const ctx = portrait.value?.getContext('2d')
  if (!ctx) return
  const palettes = [
    ['#ffc475', '#dc4289', '#71265d', '#132b56'],
    ['#94baff', '#2b63ac', '#56326a', '#db537d'],
    ['#ffd1a6', '#e75753', '#573248', '#365887'],
  ]
  const [light, color, shade, rim] = palettes[(props.variant - 1) % 3]!
  function gradient(x: number, y: number, xx: number, yy: number, colors: string[]) {
    const gradient = ctx!.createLinearGradient(x, y, xx, yy)
    colors.forEach((c, i) => gradient.addColorStop(i / (colors.length - 1), c))
    return gradient
  }
  function shape(d: string, fill: string | CanvasGradient) {
    ctx!.fillStyle = fill; ctx!.fill(new Path2D(d))
  }
  ctx.clearRect(0, 0, 78, 84)
  ctx.fillStyle = gradient(0, 0, 65, 70, [light!, shade!, '#0c1429', rim!])
  ctx.fillRect(0, 0, 78, 84)
  shape('M0 84V75Q8 63 23 60L30 49H49L52 61Q68 61 78 75V84Z', gradient(1,52,75,75,[color!, '#101529', '#252a43', rim!]))
  shape('M14 84L24 63L33 59L41 69L52 58L65 66L67 84Z', gradient(20,63,64,75,['#454455','#141626','#10121b','#4d4357']))
  shape('M22 28Q23 5 43 4Q65 3 66 25L61 47L47 63L35 61L22 47Z', gradient(16,13,65,41,[light!, color!, shade!, '#151a2e', rim!]))
  shape('M25 28Q28 7 43 6Q54 4 61 14Q45 6 33 21L29 32Z',gradient(25,9,44,29,['#fff5d1', color!, shade!]))
  shape('M21 28L31 33Q44 36 63 26L62 39Q49 50 36 45L24 39Z', gradient(23,25,59,47,[light!, '#69345d','#171122','#040812','#593f65']))
  shape('M24 29Q43 38 63 26Q48 40 30 34Z', '#ffe6da')
  shape('M27 39L34 43L39 51L33 48Z M57 44L61 40L56 51L43 58L49 51Z', gradient(24,41,61,56,[color!, '#17192b', rim!]))
  shape('M18 29L23 25L25 47L20 45Z M61 26L66 23L65 40L61 44Z','#2e3046')
  shape('M20 30L22 28L24 41L21 39Z',light!)
  shape('M9 78L20 66L28 67L19 74Z M53 67L59 65L71 79L62 75Z', gradient(11,64,68,81,[rim!, '#343044', color!]))
  ctx.fillStyle = 'rgba(255,255,255,0.07)'
  for (let y=0; y<84; y+=3) ctx.fillRect(0,y,78,.55)
}
onMounted(draw)
watch(() => props.variant, draw)
</script>

<template><canvas class="pilot-portrait" width="78" height="84" ref="portrait" aria-hidden="true"/></template>
