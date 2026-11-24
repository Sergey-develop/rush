<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { Disc3 } from 'lucide-vue-next'
import type { Engine } from '../game/Engine'

const props = defineProps<{ engine: Engine }>()
defineEmits<{ back: [] }>()
const fileInput = ref<HTMLInputElement>()
const title = ref(props.engine.trackTitle)
const custom = ref(props.engine.customSong)
const pending = ref(false)
const error = ref('')

async function choose(file: File | null) {
  if (pending.value) return
  pending.value = true
  error.value = ''
  try {
    await props.engine.selectSong(file)
    title.value = props.engine.trackTitle
    custom.value = props.engine.customSong
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Не удалось подготовить песню. Попробуйте другой файл.'
  } finally {
    pending.value = false
  }
}

function selectFile(event: Event) {
  const input = event.currentTarget as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) void choose(file)
}

onBeforeUnmount(() => { if (pending.value) props.engine.cancelSongSelection() })
</script>

<template>
  <section class="race-sheet song-panel">
    <header class="race-head"><h2 id="dialog-title">Своя песня</h2></header>
    <div class="race-body song-body">
      <div class="song-current">
        <Disc3 aria-hidden="true"/>
        <div>
          <p class="song-label">Для полёта</p>
          <p class="song-title" aria-live="polite">{{ title }}</p>
        </div>
      </div>
      <button v-if="custom" class="race-secondary song-restore" type="button" :disabled="pending" @click="choose(null)">
        Вернуть встроенную песню
      </button>
      <p v-if="error" class="song-error" role="alert">{{ error }}</p>
      <p v-if="pending" class="song-status" role="status">Подготовка музыки…</p>
    </div>
    <footer class="race-foot">
      <input ref="fileInput" type="file" hidden accept="audio/*,.mp3,.m4a,.wav,.ogg,.opus,.aac,.flac,.webm"
             aria-label="Аудиофайл для полёта" @change="selectFile"/>
      <button type="button" class="race-primary" :disabled="pending" @click="fileInput?.click()">Выбрать файл</button>
      <button type="button" class="race-secondary" @click="$emit('back')">{{ pending ? 'Отменить' : 'Назад' }}</button>
    </footer>
  </section>
</template>

<style scoped>
:global(dialog.race-modal[data-view=music]) {
  width: min(87vw,720px);
  height: min(68dvh,440px);
}
.song-panel .race-head h2 { font-size: clamp(22px,6.4cqw,50px); }
.song-body { display: flex; flex-direction: column; justify-content: safe center; }
.song-current {
  display: grid; grid-template-columns: auto minmax(0,1fr); align-items: center;
  gap: clamp(14px,3cqw,26px); padding-block: clamp(12px,3cqw,24px);
  border-block: 1px solid var(--race-line);
}
.song-current svg { width: clamp(32px,7cqw,52px); height: auto; stroke-width: 1.3; color: var(--race-pink); }
.song-label { margin: 0 0 .4em; color: var(--race-muted); font-size: clamp(13px,2cqw,18px); }
.song-title { margin: 0; overflow-wrap: anywhere; font: 400 clamp(20px,4.2cqw,34px)/1.12 'Russo One','Exo 2',sans-serif; }
.song-restore { align-self: flex-start; margin-top: .35em; padding-inline: 0; }
.song-error,.song-status { margin: .6em 0 0; overflow-wrap: anywhere; font-size: clamp(13px,2.3cqw,18px); }
.song-error { color: #ff9fbf; }
.song-panel .race-primary { font-size: clamp(16px,3.8cqw,30px); }
.song-panel button:disabled { opacity: .6; cursor: progress; }
@media (orientation: portrait) {
  :global(dialog.race-modal[data-view=music]) { width: calc(100vw - 24px); height: min(62dvh,400px); }
}
</style>
