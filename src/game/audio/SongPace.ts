import { SPEED, START_SPEED } from '../types'
import { ACCENT_WIDTH } from './BeatAccents'

const clamp = (value: number, low = 0, high = 1) => Math.min(high, Math.max(low, value))
function ease(value: number) { const u = clamp(value); return u * u * (3 - 2 * u) }

/** Section energy is measured before playback, independently of the device volume or frame rate. */
export function analyseSongPace(pcm: Float32Array, rate: number, cues: Float32Array, offsetSeconds = 0) {
  const first = Math.min(pcm.length, Math.max(0, Math.round(offsetSeconds * rate)))
  const duration = (pcm.length - first) / rate
  const count = Math.max(1, Math.ceil(duration))
  const width = duration / count
  const loud = new Float64Array(count)
  const attacks = new Float64Array(count)
  for (let i = 0; i < count; i++) {
    const start = first + Math.round(i * width * rate)
    const end = first + Math.round((i + 1) * width * rate)
    let power = 0
    for (let j = start; j < end; j++) power += pcm[j]! * pcm[j]!
    loud[i] = Math.sqrt(power / Math.max(1, end - start))
  }
  for (let i = 0; i < cues.length; i += ACCENT_WIDTH) {
    const time = cues[i]! - offsetSeconds
    if (time < 0 || time >= duration) continue
    const bin = Math.min(count - 1, Math.floor(time / width))
    attacks[bin] += cues[i+1]! ** 2 * (.62 + .38 * cues[i+2]!) / width
  }
  function relative(values: Float64Array, floor: number, range: number) {
    const sorted = values.slice().sort()
    const low = .88 * sorted[Math.floor((count - 1) * .12)]!
    const high = Math.max(floor, low + range, sorted[Math.floor((count - 1) * .88)]!)
    return values.map(value => clamp((value - low) / (high - low)))
  }
  const energy = relative(loud, .042, .032)
  const density = relative(attacks, .40, .30)
  const speeds = new Float32Array(count + 1)
  const entry = Math.max(.001, Math.min(16, duration * .26))
  const outro = Math.max(.001, Math.min(18, duration * .24))
  for (let i = 0; i <= count; i++) {
    let total = 0, weights = 0
    // Average a phrase, not individual kicks. Centre the triangular window on the knot.
    for (let j = Math.max(0, i-5); j < Math.min(count, i+5); j++) {
      const weight = 5 - Math.abs(j + .5 - i)
      total += weight * (.78 * energy[j]! + .22 * density[j]!)
      weights += weight
    }
    const seconds = i * width
    const section = 13.5 + (SPEED - 13.5) * ease(total / weights)
    const launched = START_SPEED + (section - START_SPEED) * ease(seconds / entry)
    speeds[i] = launched + (10 - launched) * ease((seconds - duration + outro) / outro)
  }
  return speeds
}

/** A piecewise-linear velocity profile. Its primitive places gates on the same transport clock. */
export class SongPace {
  private readonly step: number
  private readonly metres: Float64Array

  constructor(private readonly speeds: Float32Array, readonly duration: number) {
    if (!Number.isFinite(duration) || duration <= 0 || speeds.length < 2 || !speeds.every(v => v > 0 && Number.isFinite(v))) {
      throw new Error('A pace map needs a finite duration and positive speed samples.')
    }
    this.step = duration / (speeds.length - 1)
    this.metres = new Float64Array(speeds.length)
    for (let i = 1; i < speeds.length; i++) {
      this.metres[i] = this.metres[i-1]! + .5 * (speeds[i-1]! + speeds[i]!) * this.step
    }
  }

  private slice(seconds: number) {
    return Math.min(this.speeds.length - 1, Math.floor(Math.max(0, seconds) / this.step))
  }

  speedAt(seconds: number) {
    const i = this.slice(seconds), a = this.speeds[i]!
    if (i === this.speeds.length - 1) return a
    return a + (this.speeds[i+1]! - a) * (Math.max(0, seconds) / this.step - i)
  }

  distanceAt(seconds: number) {
    const t = Math.max(0, seconds), i = this.slice(t)
    return this.metres[i]! + (t - i * this.step) * .5 * (this.speeds[i]! + this.speedAt(t))
  }

  timeAtDistance(metres: number) {
    if (metres <= 0) return 0
    const last = this.speeds.length - 1
    if (metres >= this.metres[last]!) return this.duration + (metres - this.metres[last]!) / this.speeds[last]!
    let lo = 0, hi = last
    while (lo + 1 < hi) {
      const mid = (lo + hi) >>> 1
      if (this.metres[mid]! <= metres) lo = mid
      else hi = mid
    }
    const v0 = this.speeds[lo]!, slope = (this.speeds[lo+1]! - v0) / this.step
    const d = metres - this.metres[lo]!
    return lo*this.step + 2*d / (v0 + Math.sqrt(v0*v0 + 2*slope*d))
  }

  /** Maximum average pace over a possible approach is bounded by these two endpoints and knots. */
  fastestBetween(from: number, to: number) {
    let best = Math.max(this.speedAt(from), this.speedAt(to))
    for (let i = this.slice(from) + 1; i <= this.slice(to); i++) best = Math.max(best, this.speeds[i]!)
    return best
  }

  /** Integral of speed(t) * exp(-(t-from)/tau), including any crossed section boundaries. */
  coastingDistance(from: number, dt: number, tau: number) {
    const to = from + dt
    let weighted = 0
    let cursor = from
    for (let i = this.slice(from); cursor < to; i++) {
      const last = this.speeds.length - 1
      const stop = i >= last ? to : Math.min(to, (i+1) * this.step)
      const span = stop - cursor
      const slope = i >= last ? 0 : (this.speeds[i+1]! - this.speeds[i]!) / this.step
      const area = -tau * Math.expm1(-span / tau)
      const moment = tau * (area - span * Math.exp(-span / tau))
      weighted += Math.exp(-(cursor-from)/tau) * (this.speedAt(cursor) * area + slope * moment)
      cursor = stop
    }
    return weighted
  }
}
