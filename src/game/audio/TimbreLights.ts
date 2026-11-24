import type { MusicLight } from './response'

const clamp = (n: number) => Math.max(0, Math.min(1, n))
// The FFT amplitudes share a full-scale reference across the recording and all four
// voices. Preserve their ratios until a foreground hit reaches the soft highlight knee.
function lightLevel(amplitude: number) {
  const linear = amplitude / .22
  return linear <= .75 ? linear : 1 - .25*Math.exp(-4*(linear-.75))
}

const channels = ['kick','snare','hat','tone'] as const

/** Centred FFT frames share the recording's clock. Analyse each drum range
 * independently so a hat between two kicks survives even in a dense passage. */
export class TimbreAnalysis {
  private readonly levels: Float32Array[]
  private readonly bassStart: number
  private readonly bassEnd: number
  private readonly bodyEnd: number
  private readonly metalStart: number

  constructor(frames: number, rate: number, private readonly size: number, private readonly step: number) {
    this.levels = channels.map(() => new Float32Array(frames))
    const bin = (hz: number) => Math.ceil(hz * size / rate)
    this.bassStart = Math.max(1, bin(30))
    this.bassEnd = bin(160)
    this.bodyEnd = Math.min(size/2-5,bin(3100))
    this.metalStart = bin(4200)
  }

  measure(frame: number, power: Float32Array) {
    let bass = 0, body = 0, tonal = 0, metal = 0
    for (let i=this.bassStart; i<this.bassEnd && i<power.length; i++) bass += power[i]
    for (let i=Math.max(5,this.bassEnd); i<this.bodyEnd; i++) {
      // A harmonic concentrates energy in a few FFT bins. A snare's noise also
      // fills the gaps on either side. Split those components before tracking attacks.
      const neighbours = .25*(power[i-5]+power[i-4]+power[i+4]+power[i+5])
      body += Math.min(power[i], neighbours)
      tonal += Math.max(0, power[i]-7*neighbours)
    }
    for (let i=this.metalStart; i<power.length; i++) metal += power[i]
    const scale = 2 / this.size
    const low = Math.sqrt(bass)*scale
    const mid = Math.sqrt(body)*scale
    const high = Math.sqrt(metal)*scale
    const note = Math.sqrt(tonal)*scale
    this.levels[0][frame] = low
    this.levels[1][frame] = mid
    this.levels[2][frame] = high
    this.levels[3][frame] = note * clamp(note/(.001+3.8*mid))
  }

  finish() {
    const frames = this.levels[0].length
    const result = new Float32Array(frames*4)
    const bandAttack = (channel: number, frame: number) => {
      const levels = this.levels[channel]
      const before = levels[Math.max(0, frame-6)]
      let peak = 0
      for (let i=Math.max(0,frame-1); i<Math.min(frames,frame+7); i++) peak=Math.max(peak,levels[i])
      return Math.max(0,peak-before)
    }
    const release = [.095,.068,.041]
    const holdoff = [.082,.060,.035]
    for (let channel=0; channel<3; channel++) {
      const values = this.levels[channel]
      const lag = Math.max(1,Math.round(.015/this.step))
      const rises = new Float32Array(frames)
      let floor = 0
      const adapt = 1-Math.exp(-this.step/.23)
      for (let i=0; i<frames; i++) {
        const delta = Math.max(0,values[i]-(values[i-lag] ?? 0))
        rises[i] = Math.max(0,delta - 1.55*floor)
        floor += (delta-floor)*adapt
      }
      const sorted = rises.slice().sort()
      const reference = Math.max(.008,sorted[Math.floor((frames-1)*.985)])
      const threshold = Math.max(.0012,reference*.042)
      const decay = Math.exp(-this.step/release[channel])
      let level=0, last=-Infinity
      for (let i=0; i<frames; i++) {
        // The centred window captures the attack while the 15 ms difference is still rising.
        const peak = i
        level *= decay
        if (peak<frames && rises[peak] > threshold && rises[peak] >= (rises[peak-1] ?? 0)
            && rises[peak] > (rises[peak+1] ?? 0) && (i-last)*this.step >= holdoff[channel]) {
          const bass = bandAttack(0,i), body = bandAttack(1,i), high = bandAttack(2,i)
          const share = channel === 0 ? bass/(.001+1.8*body+.32*high)
            : channel === 1 ? body/(.001+.40*bass+.42*high)
            : high/(.001+1.8*body)
          const amplitude = channel === 0 ? bass : channel === 1 ? body : high
          const strength = lightLevel(amplitude) * clamp(share)**1.4
          level = Math.max(level,strength)
          if (strength > .13) last = i
        }
        result[i*4+channel] = level < .012 ? 0 : level
      }
    }
    const tones = this.levels[3]
    let envelope=0
    const attack=1-Math.exp(-this.step/.033), releaseTone=1-Math.exp(-this.step/.086)
    for (let i=0; i<frames; i++) {
      // Only partials that persist across several frames produce a sustained glow.
      const radius = Math.max(1,Math.round(.020/this.step))
      const stable = Math.min(tones[i],tones[Math.max(0,i-radius)],tones[Math.min(frames-1,i+radius)])
      const target = lightLevel(Math.max(0,stable-.0018))
      envelope += (target-envelope)*(target>envelope ? attack : releaseTone)
      result[i*4+3] = envelope < .012 ? 0 : envelope
    }
    return result
  }
}

export class TimbreLights {
  constructor(private readonly frames: Float32Array, private readonly step: number) {}

  sample(seconds: number, light: Pick<MusicLight,typeof channels[number]>) {
    const position = seconds / this.step
    const frame = Math.floor(position)
    const fraction = position-frame
    for (let i=0; i<channels.length; i++) {
      const current = this.frames[frame*4+i] ?? 0
      const next = this.frames[(frame+1)*4+i] ?? 0
      light[channels[i]] = seconds < 0 ? 0 : current+(next-current)*fraction
    }
  }
}
