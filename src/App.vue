<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { BookOpen, ChevronRight, X } from 'lucide-vue-next'
import type { Engine } from './game/Engine'
import type { GameFrame } from './game/contracts'
import PosterArtwork from './components/PosterArtwork.vue'
import BootScreen from './components/BootScreen.vue'
import GameHud from './components/GameHud.vue'
import HudArtwork from './components/HudArtwork.vue'
import RunResult from './components/RunResult.vue'
import ResultDigits from './components/ResultDigits.vue'
import WeeklyLeaders from './components/WeeklyLeaders.vue'
import RankingPanel from './components/RankingPanel.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import FlightBriefing from './components/FlightBriefing.vue'
import { completeBriefing, demos, hasCompletedBriefing, loadRuns, loadSettings, rank, saveRun, storeSettings } from './ui/profile'
import './styles/interface.scss'
import './styles/flight-hud.scss'
import './styles/station-console.scss'
import './styles/poster.scss'

const stage = ref<HTMLCanvasElement>()
const posterArtwork = ref<InstanceType<typeof PosterArtwork>>()
const dialog = ref<HTMLDialogElement>()
const frame = shallowRef<GameFrame>({
  phase: 'menu', countdown: 3, score: 0, combo: 0, distance: 0, bpm: 172,
  pulse: 0, hint: null, reason: null, altitude: 0,
})
const options = ref(loadSettings())
const runs = shallowRef(loadRuns())
const page = ref<'settings' | 'rating' | 'briefing' | 'error' | null>(null)
const touchBriefing = ref(false)
const filter = ref<'week' | 'all'>('week')
const busy = ref(false)
const bootVisible = ref(true)
const bootProgress = ref(0)
const skipRequested = ref(false)
const hasPlayed = ref(false)
const playButton = ref<HTMLButtonElement>()
const failure = ref('')
const modal = computed(() => page.value ?? (frame.value.phase === 'paused' ? 'paused' : frame.value.phase === 'over' ? 'over' : null))
const demo = computed(() => runs.value.length === 0)
const weekly = computed(() => demo.value ? demos : rank(runs.value, true).slice(0,3))
const ranking = computed(() => demo.value ? demos : rank(runs.value, filter.value === 'week'))
let engine: Engine | undefined
let briefingSeen = hasCompletedBriefing()
let briefingOpener: HTMLElement | undefined
let launchAttempt = 0
let lastHud = 0
let ready = false
let disposed = false
let bootStarted = 0
let paintFrame = 0
let entryTimer = 0
let focusPlay = false
let releaseFirstLight: (() => void) | undefined

function receive(state: GameFrame) {
  const prior = frame.value.phase
  if (state.phase === 'countdown' && prior === 'menu') {
    hasPlayed.value = true
    if (page.value === 'briefing') {
      briefingSeen = true
      completeBriefing()
      page.value = null
    }
  }
  if (state.phase === 'over' && prior !== 'over') {
    const pilot = options.value.pilot.trim() || 'Пилот'
    runs.value = saveRun(runs.value, { pilot, score: state.score, distance: state.distance, time: Date.now() })
    page.value = null
  }
  if (state.phase === prior) {
    if (state.phase === 'menu' || state.phase === 'paused' || state.phase === 'over') return
    if (performance.now() - lastHud < 32 && state.countdown === frame.value.countdown) return
  }
  lastHud = performance.now()
  frame.value = { ...state }
}

async function connect() {
  const { Engine } = await import('./game/Engine')
  // Paint the opening poster before generating the station materials.
  const firstLight = 520 - (performance.now() - bootStarted)
  if (!disposed && bootVisible.value && !skipRequested.value && firstLight > 0 &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    await new Promise<void>(resolve => {
      const timer = window.setTimeout(finish, firstLight)
      function finish() { window.clearTimeout(timer); releaseFirstLight = undefined; resolve() }
      releaseFirstLight = finish
    })
  }
  if (disposed || !stage.value) return
  const current = new Engine(stage.value, receive)
  engine = current
  try {
    current.setSettings(options.value)
    await current.prepareMenu(ratio => {
      if (!disposed && engine === current) bootProgress.value = Math.max(bootProgress.value, Math.min(1, ratio))
    })
  } catch (error) {
    if (engine === current) { engine = undefined; current.dispose() }
    throw error
  }
}

function enterMenu() {
  if (!ready || disposed || !bootVisible.value) return
  window.clearTimeout(entryTimer)
  engine?.revealMenu()
  bootVisible.value = false
  if (focusPlay) void nextTick(() => playButton.value?.focus({ preventScroll: true }))
}

function skipBoot(keyboard = false) {
  skipRequested.value = true
  releaseFirstLight?.()
  focusPlay ||= keyboard
  enterMenu()
}

async function prepareEntry() {
  try {
    await Promise.all([connect(), posterArtwork.value?.ready()])
    if (disposed) return
    ready = true
    bootProgress.value = 1
    const remaining = 1800 - (performance.now() - bootStarted)
    if (skipRequested.value || window.matchMedia('(prefers-reduced-motion: reduce)').matches || remaining <= 0) enterMenu()
    else entryTimer = window.setTimeout(enterMenu, remaining)
  } catch (error) {
    if (disposed) return
    bootVisible.value = false
    showError(error)
  }
}

function showError(error: unknown) {
  failure.value = error instanceof Error ? error.message : String(error)
  page.value = 'error'
}

function openBriefing(event?: MouseEvent) {
  if (busy.value || bootVisible.value) return
  briefingOpener = event?.currentTarget instanceof HTMLElement ? event.currentTarget : playButton.value
  const pointer = event && 'pointerType' in event ? event.pointerType : ''
  touchBriefing.value = pointer ? pointer !== 'mouse' : window.matchMedia('(pointer: coarse)').matches
  page.value = 'briefing'
}

function requestFlight(event?: MouseEvent) {
  if (!briefingSeen) openBriefing(event)
  else void launch()
}

async function launch() {
  if (busy.value || bootVisible.value) return
  const attempt = ++launchAttempt
  busy.value = true
  try {
    if (!engine) await connect()
    if (!disposed && launchAttempt === attempt) await engine?.start()
  } catch (err) {
    if (launchAttempt === attempt) showError(err)
  } finally {
    if (launchAttempt === attempt) busy.value = false
  }
}

async function resume() {
  page.value = null
  try { await engine?.resume() } catch (err) { showError(err) }
}

function menu() { page.value = null; engine?.menu() }
function openRating() { filter.value = 'week'; page.value = 'rating' }
function dismiss() {
  if (page.value === 'briefing' && busy.value) {
    launchAttempt++
    busy.value = false
    engine?.menu()
  }
  if (page.value) { page.value = null; return }
  if (modal.value === 'paused') void resume()
  else if (modal.value === 'over') menu()
}

function keyboard(event: KeyboardEvent) {
  if (bootVisible.value && ['Enter','Space','Escape'].includes(event.code)) {
    event.preventDefault(); event.stopImmediatePropagation()
    if (!event.repeat) skipBoot(true)
    return
  }
  if (event.code === 'Escape' && modal.value) {
    event.preventDefault(); event.stopImmediatePropagation()
    if (!event.repeat) dismiss()
    return
  }
  if (event.code === 'Enter' && frame.value.phase === 'menu' && !modal.value &&
      !(event.target instanceof HTMLElement && event.target.closest('button, input, select'))) {
    event.preventDefault()
    if (!event.repeat) requestFlight()
  }
}

watch(options, value => { storeSettings(value); engine?.setSettings(value) }, { deep: true })
watch(modal, async (value, previous) => {
  await nextTick()
  if (value && dialog.value && !dialog.value.open) dialog.value.showModal()
  else if (!value && dialog.value?.open) dialog.value.close()
  if (previous === 'briefing') {
    if (!value && frame.value.phase === 'menu') briefingOpener?.focus({ preventScroll:true })
    briefingOpener = undefined
  }
})

onMounted(() => {
  window.addEventListener('keydown', keyboard, true)
  // Give the loading screen a paint before the renderer allocates the station.
  paintFrame = requestAnimationFrame(() => {
    bootStarted = performance.now()
    paintFrame = requestAnimationFrame(() => void prepareEntry())
  })
})
onBeforeUnmount(() => {
  disposed = true
  releaseFirstLight?.()
  cancelAnimationFrame(paintFrame)
  window.clearTimeout(entryTimer)
  window.removeEventListener('keydown', keyboard, true)
  engine?.dispose()
  engine = undefined
})
</script>

<template>
  <main class="app-shell" :class="'phase--'+frame.phase">
    <canvas ref="stage" class="flight-canvas" aria-label="Трёхмерный коридор станции" />
    <PosterArtwork v-if="frame.phase==='menu' || modal==='settings' || modal==='rating'"
                   ref="posterArtwork" :returning="hasPlayed || (skipRequested && !bootVisible)" :covered="Boolean(modal)"/>
    <Transition name="boot-dismiss" @before-leave="element => element.setAttribute('inert', '')">
      <BootScreen v-if="bootVisible" :progress="bootProgress" :skip-requested="skipRequested" @skip="skipBoot()"/>
    </Transition>
    <template v-if="frame.phase === 'menu'">
      <div v-if="!bootVisible" class="main-menu poster-menu" :class="{ 'menu-return': hasPlayed }" :inert="Boolean(modal)">
        <h1 class="poster-sr">Corridor Rush</h1>
        <nav class="poster-nav" aria-label="Главное меню">
          <button ref="playButton" class="poster-action poster-start" :disabled="busy" :aria-busy="busy" @click="requestFlight">
            <span>{{ busy ? 'Загрузка трека' : 'Играть' }}</span><ChevronRight aria-hidden="true"/>
          </button>
          <button class="poster-action poster-nav-link" :disabled="busy" @click="openRating">Рейтинг</button>
          <button class="poster-action poster-nav-link" :disabled="busy" @click="page='settings'">Настройки</button>
        </nav>
        <button class="poster-guide poster-records-link" type="button" :disabled="busy" @click="openBriefing">
          <BookOpen aria-hidden="true"/>Как играть
        </button>
        <WeeklyLeaders :rows="weekly" :is-demo="demo" @open="!busy && openRating()"/>
      </div>
    </template>
    <template v-else-if="frame.phase!=='over'">
      <div class="flight-vignette" aria-hidden="true"/>
      <GameHud :inert="frame.phase==='impact'" :frame="frame" @pause="engine?.pause()"/>
      <div v-if="frame.phase==='countdown'" class="countdown">
        <div class="countdown-ring" role="timer" aria-live="polite">
          <HudArtwork design="countdown" :numeral="frame.countdown"/>
          <strong>{{ frame.countdown }}</strong>
        </div>
      </div>
    </template>
    <dialog ref="dialog" class="overlay-dialog race-modal" :data-view="modal" aria-labelledby="dialog-title" @cancel.prevent="dismiss()"
            @click="($event.target===dialog && (modal==='rating'||modal==='settings'||modal==='briefing')) && dismiss()">
      <FlightBriefing v-if="modal==='briefing'" :touch="touchBriefing" :busy="busy" @start="launch" @back="dismiss"/>
      <section v-else-if="modal==='settings'" class="race-sheet">
        <header class="race-head">
          <h2 id="dialog-title">Настройки</h2>
          <button class="race-close" type="button" aria-label="Закрыть"
                  @vue:mounted="({ el }: { el: HTMLButtonElement }) => dialog?.open && el.focus({ preventScroll: true })" @click="dismiss()"><X aria-hidden="true"/></button>
        </header>
        <div class="race-body"><SettingsPanel v-model="options"/></div>
        <footer class="race-foot"><button class="race-primary" type="button" @click="dismiss()">Назад</button></footer>
      </section>
      <RankingPanel v-else-if="modal==='rating'" v-model="filter" :rows="ranking" :is-demo="demo" @back="dismiss()"/>
      <section v-else-if="modal==='paused'" class="race-sheet">
        <header class="race-head"><h2 id="dialog-title">Пауза</h2></header>
        <div class="race-body race-pause-body">
          <dl class="race-readings" :class="{'race-readings--long':frame.score>=1e7 || frame.distance>=1e7}">
            <div><dt>Счёт</dt><dd><ResultDigits :value="frame.score" align="start"/></dd></div>
            <div><dt>Дистанция</dt><dd><ResultDigits :value="frame.distance" unit="м" align="start"/></dd></div>
          </dl>
          <div class="race-pause-links">
            <button class="race-secondary" type="button"
                    @vue:mounted="({ el }: { el: HTMLButtonElement }) => dialog?.open && el.focus({ preventScroll: true })" @click="page='settings'">Настройки</button>
            <button class="race-secondary" type="button" @click="menu()">Главное меню</button>
          </div>
        </div>
        <footer class="race-foot"><button class="race-primary" type="button" autofocus @click="resume()">Продолжить</button></footer>
      </section>
      <RunResult v-else-if="modal==='over'" :finished="frame.reason==='finished'" :track="frame.track" :score="frame.score" :distance="frame.distance" :busy="busy" @retry="launch" @menu="menu"/>
      <section v-else-if="modal==='error'" class="race-sheet">
        <header class="race-head"><h2 id="dialog-title">Ошибка запуска</h2></header>
        <div class="race-body race-failure"><p>Не удалось запустить игру в этом браузере.</p><p>{{ failure }}</p></div>
        <footer class="race-foot"><button class="race-primary" type="button" @click="menu()">В меню</button></footer>
      </section>
    </dialog>
  </main>
</template>
