// Original 16-bar breakbeat score. Render once, then play as a sample-accurate Web Audio loop.
export async function synthesizeLoop(bpm: number): Promise<AudioBuffer> {
  const beat = 60 / bpm
  const rate = 32000
  const ctx = new OfflineAudioContext(2, Math.round(64 * beat * rate), rate)
  const compressor = ctx.createDynamicsCompressor()
  compressor.threshold.value = -16
  compressor.ratio.value = 4
  compressor.connect(ctx.destination)
  const noise = ctx.createBuffer(1, rate, rate)
  let seed = 271828
  const samples = noise.getChannelData(0)
  for (let i = 0; i < samples.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    samples[i] = seed / 2147483648 - 1
  }
  const pitch = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

  function envelope(t: number, length: number, amp: number, attack = 0.004, pan = 0) {
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.00001, t)
    gain.gain.exponentialRampToValueAtTime(amp, t + attack)
    gain.gain.exponentialRampToValueAtTime(0.00001, t + length)
    if (pan) {
      const stereo = ctx.createStereoPanner()
      stereo.pan.value = pan
      gain.connect(stereo).connect(compressor)
    } else gain.connect(compressor)
    return gain
  }

  function tone(t: number, f: number, length: number, amp: number, type: OscillatorType, cutoff = 0, pan = 0, attack = 0.004) {
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.value = f
    const output = envelope(t, length, amp, attack, pan)
    if (cutoff) {
      const filter = ctx.createBiquadFilter()
      filter.frequency.setValueAtTime(cutoff, t)
      filter.frequency.exponentialRampToValueAtTime(Math.max(100, cutoff * 0.19), t + length)
      filter.Q.value = 0.8
      osc.connect(filter).connect(output)
    } else osc.connect(output)
    osc.start(t)
    osc.stop(t + length)
    return osc
  }
  function hiss(t: number, length: number, amp: number, cutoff: number, pan = 0) {
    const src = ctx.createBufferSource()
    src.buffer = noise
    const filter = ctx.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = cutoff
    src.connect(filter).connect(envelope(t, length, amp, 0.002, pan))
    src.start(t, t % 0.53, length)
  }
  const roots = [38, 34, 41, 36]
  const arp = [0, 7, 12, 3, 7, 15, 12, 7]
  for (let bar = 0; bar < 16; bar++) {
    const base = bar * 4 * beat
    const root = roots[Math.floor(bar / 2) % roots.length]!
    for (const tick of (bar % 2 ? [0, 1.75, 2.5] : [0, 1.5, 2.75])) {
      const t = base + tick * beat
      const kick = tone(t, 150, 0.21, 0.85, 'sine')
      kick.frequency.exponentialRampToValueAtTime(46, t + 0.07)
      hiss(t, 0.023, 0.15, 2000)
    }
    for (const tick of [1, 3]) {
      const t = base + tick * beat
      hiss(t, 0.145, 0.46, 1200)
      tone(t, 179, 0.115, 0.30, 'triangle')
      hiss(t + 0.011, 0.052, 0.14, 3000, 0.25)
    }
    for (let step = 0; step < 8; step++) {
      const t = base + (step / 2) * beat
      hiss(t, step % 2 ? 0.092 : 0.045, step % 2 ? 0.13 : 0.077, 6600, step % 2 ? 0.32 : -0.22)
      if (step !== 2 && step !== 6) {
        const bassFreq = pitch(root - (step === 7 ? 0 : 12))
        tone(t, bassFreq, beat * 0.52, 0.45, 'sine')
        tone(t, bassFreq * 2, beat * 0.42, 0.15, 'sawtooth', 790)
      }
      if (bar % 4 !== 3 || step < 6) {
        const note = pitch(root + 24 + arp[(step + (bar % 2) * 2) % 8]!)
        tone(t, note, 0.19, 0.070, 'sawtooth', 2000, Math.sin(step * 2) * 0.38)
        tone(t + beat * 0.75, note, 0.14, 0.023, 'triangle', 0, -0.45)
      }
    }
    for (const [i, interval] of [0, 3, 7].entries()) {
      tone(base, pitch(root + 12 + interval), beat * 3.97, 0.075, 'sawtooth', 1250 + i * 120, (i - 1) * 0.6, beat * 0.45)
    }
    if (bar % 4 === 3) for (const tick of [3.25, 3.5, 3.75]) hiss(base + tick * beat, 0.06, 0.12, 2700)
  }
  return ctx.startRendering()
}
