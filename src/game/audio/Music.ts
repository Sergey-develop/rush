import type { BeatEvent } from '../types'
import { synthesizeLoop } from './synth'
import { Spectrum } from './response'
import { BeatAccents } from './BeatAccents'
import { SongPace } from './SongPace'
import { playBackspin } from './backspin'
import { createStartRelay } from './startRelay'

interface ScoreFile { title?: string; bpm?: number; file?: string; offsetSeconds?: number; events?: BeatEvent[] }
const charts = import.meta.glob<ScoreFile>('../../assets/music/*.json', { eager: true, import: 'default' })
const recordings = import.meta.glob<string>('../../assets/music/*.{mp3,ogg,wav,m4a,flac}', { eager: true, query: '?url', import: 'default' })
const entries = Object.entries(charts)
const selected = entries.find(([, sheet]) => sheet.file) ?? entries[0]
const chart = selected?.[1]
const recording = chart?.file
  ? recordings['../../assets/music/' + chart.file]
  : Object.values(recordings)[0]

export class Music {
  readonly bpm = Math.min(240, Math.max(50, Number(chart?.bpm) || 172))
  readonly title = chart?.title ?? 'Phase Line'
  readonly events = chart?.events ?? []
  private context?: AudioContext
  private output?: GainNode
  private songGain?: GainNode
  private spectrum?: Spectrum
  private source?: AudioBufferSourceNode
  private stopBackspin?: () => void
  private notes = new Set<AudioScheduledSourceNode>()
  private scheduleRelay?: ReturnType<typeof createStartRelay>
  private buffer?: AudioBuffer
  private accents?: BeatAccents
  private sectionPace?: SongPace
  private loading?: Promise<void>
  private cancelAnalysis?: () => void
  private disposed=false
  private previousLightFrame = 0
  private displayInterval = 1/60
  private startedAt = 0
  private stoppedAt: number | undefined = 0
  private offset = 0
  private volume = 0.65
  private muted = false

  async prepare() {
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: 'interactive' })
      this.output = this.context.createGain()
      this.output.gain.value = this.muted ? 0 : this.volume
      this.output.connect(this.context.destination)
      this.scheduleRelay = createStartRelay(this.context)
      this.spectrum = new Spectrum(this.context)
      this.songGain = this.context.createGain()
      this.songGain.connect(this.spectrum.analyser)
      this.spectrum.analyser.connect(this.output)
    }
    await this.context.resume()
    if (!this.buffer) {
      this.loading ??= this.load().finally(() => { this.loading = undefined })
      await this.loading
    }
  }

  private async load() {
    if (chart?.file && !recording) throw new Error('Аудиофайл из карты ритма не найден.')
    let buffer:AudioBuffer
    if (recording) {
      const response = await fetch(recording)
      if (!response.ok) throw new Error('Не удалось загрузить звуковую дорожку.')
      buffer = await this.context!.decodeAudioData(await response.arrayBuffer())
    } else {
      buffer = await synthesizeLoop(this.bpm)
    }
    if(this.disposed) return
    this.offset=recording ? Number(chart?.offsetSeconds??0) : 0
    if(!Number.isFinite(this.offset) || this.offset<0 || this.offset>=buffer.duration)
      throw new Error('Некорректное время начала записи в карте ритма.')
    // Web Audio band-limits the downsample. The worker measures the complete song
    // before count-in so quiet breaks and off-grid accents work on the first play.
    const rate=12000
    const offline=new OfflineAudioContext(1,Math.ceil(buffer.duration*rate),rate)
    const analysisSource=offline.createBufferSource()
    analysisSource.buffer=buffer
    analysisSource.connect(offline.destination)
    analysisSource.start()
    const mono=await offline.startRendering()
    if(this.disposed) return
    const pcm=mono.getChannelData(0).slice()
    const worker=new Worker(new URL('./accents.worker.ts',import.meta.url),{type:'module'})
    try {
      const {cues,pace}=await new Promise<{cues:Float32Array;pace:Float32Array}>((resolve,reject)=>{
        this.cancelAnalysis=()=>reject(new Error('Анализ записи остановлен.'))
        worker.onmessage=({data})=>resolve(data)
        worker.onerror=event=>reject(new Error(event.message || 'Не удалось проанализировать запись.'))
        worker.postMessage({pcm,rate,offset:this.offset},[pcm.buffer])
      })
      this.accents=new BeatAccents(cues)
      this.sectionPace=new SongPace(pace,buffer.duration-this.offset)
      this.buffer=buffer
    } finally {
      this.cancelAnalysis=undefined
      worker.terminate()
    }
  }

  start(countdown: number) {
    this.stop()
    this.spectrum!.reset()
    this.previousLightFrame=0
    this.displayInterval=1/60
    const ctx = this.context!
    const source = ctx.createBufferSource()
    source.buffer = this.buffer!
    this.songGain!.gain.cancelScheduledValues(ctx.currentTime)
    this.songGain!.gain.setValueAtTime(1,ctx.currentTime)
    source.connect(this.songGain!)
    // Give the driver one short lead-in. Every contact and the song share this clock.
    const firstContact = ctx.currentTime + .012
    this.startedAt = firstContact + countdown
    source.start(this.startedAt,this.offset)
    this.source = source
    this.stoppedAt=undefined
    this.scheduleRelay!(this.startedAt, countdown, (buffer, time) => this.playContact(buffer, time))
  }

  get duration() { return this.buffer ? this.buffer.duration-this.offset : 0 }
  get pace() { return this.sectionPace }

  get elapsed() {
    if(this.stoppedAt!==undefined) return this.stoppedAt
    const ctx=this.context
    if(!ctx) return 0
    // Audio rendering runs ahead of the speakers. Align the lamp attack with the
    // device's output clock when the browser exposes a fresh presentation timestamp.
    const stamp=ctx.getOutputTimestamp?.()
    const presented=stamp?.contextTime, at=stamp?.performanceTime
    const age=at ? (performance.now()-at)/1000 : Infinity
    const deviceLatency=(ctx.outputLatency || 0)+(ctx.baseLatency || 0)
    // Some drivers timestamp the next device callback a few milliseconds in the future.
    // Extrapolate either side of a fresh callback; do not jump to the queued write head.
    const outputTime=typeof presented==='number' && age>=-.12 && age<.35
      ? Math.max(0,Math.min(ctx.currentTime,presented+age))
      : Math.max(0,ctx.currentTime-deviceLatency)
    return outputTime-this.startedAt
  }
  sampleLight(seconds=this.elapsed) {
    const light=this.spectrum!.sample(this.context!.currentTime)
    // The RAF samples just before the next image is drawn and scanned out. Look up
    // the cue for that presentation frame; the transport itself stays on speaker time.
    const now=performance.now(), interval=(now-this.previousLightFrame)/1000
    if(this.previousLightFrame && interval>.005 && interval<.045)
      this.displayInterval+=(interval-this.displayInterval)*.14
    this.previousLightFrame=now
    const lead=this.stoppedAt===undefined && this.context!.state==='running'
      ? Math.min(.024,this.displayInterval*.83) : 0
    const accent=seconds<0 || seconds>=this.duration ? {index:0,flash:0,warm:0,cool:0}
      : this.accents!.at(this.offset+seconds+lead,this.offset)
    light.beatIndex=accent.index
    light.beatFlash=accent.flash
    light.warmFlash=accent.warm
    light.coolFlash=accent.cool
    return light
  }
  get suspended() { return !!this.context && this.context.state !== 'running' }
  async suspend() { if (this.context?.state === 'running') await this.context.suspend() }
  async resume() { await this.context?.resume() }
  levels(volume: number, muted: boolean) {
    this.volume = volume
    this.muted = muted
    if (this.context && this.output) this.output.gain.setTargetAtTime(muted ? 0 : volume, this.context.currentTime, 0.025)
  }

  private blip(time: number, frequency: number, duration: number, amplitude: number, endFrequency = frequency) {
    const ctx = this.context!
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.setValueAtTime(frequency, time)
    osc.frequency.exponentialRampToValueAtTime(endFrequency, time + duration)
    gain.gain.setValueAtTime(0.0001, time)
    gain.gain.exponentialRampToValueAtTime(amplitude, time + 0.004)
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration)
    osc.connect(gain).connect(this.output!)
    this.notes.add(osc)
    osc.start(time)
    osc.stop(time + duration + 0.008)
    osc.onended = () => { this.notes.delete(osc); osc.disconnect(); gain.disconnect() }
  }
  private playContact(buffer: AudioBuffer, time: number) {
    const source = this.context!.createBufferSource()
    source.buffer = buffer
    source.connect(this.output!)
    this.notes.add(source)
    source.onended = () => { this.notes.delete(source); source.disconnect() }
    source.start(time)
  }
  hit() {
    const ctx=this.context, source=this.source
    if (!ctx || !source || !this.buffer || !this.output || !this.songGain || this.stoppedAt!==undefined) return
    this.stoppedAt=Math.min(this.duration,this.elapsed)
    this.stopNotes()
    // Anchor at the forward source's actual audio read head. Its already-queued
    // speaker samples remain contiguous with the start of the reverse gesture.
    const cut=ctx.currentTime+.006
    const head=this.offset+Math.min(this.duration,Math.max(0,cut-this.startedAt))
    this.stopBackspin=playBackspin(ctx,this.output,this.buffer,this.offset,head,cut,()=>{
      this.stopBackspin=undefined
    })
    const gain=this.songGain.gain
    gain.setValueAtTime(1,cut)
    gain.linearRampToValueAtTime(0,cut+.006)
    source.onended=()=>{
      source.disconnect()
      if(this.source===source) this.source=undefined
    }
    source.stop(cut+.006)
  }
  pass(combo: number) {
    if (this.context) this.blip(this.context.currentTime, 710 + Math.min(combo, 12) * 28, 0.105, 0.036, 1220)
  }
  private stopNotes() {
    for (const note of this.notes) { note.stop(); note.disconnect() }
    this.notes.clear()
  }
  stop() {
    this.stopBackspin?.()
    this.stopNotes()
    if (this.source) {
      if(this.stoppedAt===undefined) this.stoppedAt=Math.min(this.duration,this.elapsed)
      this.source.onended=null
      this.source.stop()
      this.source.disconnect()
      this.source = undefined
    }
  }
  dispose() {
    this.disposed=true
    this.cancelAnalysis?.()
    this.stop()
    this.songGain?.disconnect()
    this.spectrum?.analyser.disconnect()
    if (this.context) void this.context.close()
  }
}
