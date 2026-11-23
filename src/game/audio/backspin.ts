// A hand flick rapidly reverses the platter. It loses speed fastest immediately
// after the push, then coasts through the last fraction of a revolution.
const RATE_CURVE = [
  [0, 1.0], [.024, 4.5], [.105, 3.65], [.24, 2.38],
  [.49, 1.10], [.69, .43], [.85, .12], [.92, .035],
] as const
export const BACKSPIN_SECONDS = RATE_CURVE[RATE_CURVE.length - 1]![0]

let historySeconds = 0
for (let i = 1; i < RATE_CURVE.length; i++) {
  const [t0, r0] = RATE_CURVE[i - 1]!
  const [t1, r1] = RATE_CURVE[i]!
  historySeconds += (t1 - t0) * (r0 + r1) / 2
}

// Never wrap into the end of the recording, the trimmed intro, or future samples.
export function copyReverseHistory(pcm: Float32Array, target: Float32Array, first: number, end: number) {
  const last = Math.min(pcm.length, Math.max(0, end)) - 1
  const count = Math.max(0, Math.min(target.length, last - Math.max(0, first) + 1))
  for (let i = 0; i < count; i++) target[i] = pcm[last - i]!
  target.fill(0, count)
}

function addQuietGroove(buffer: AudioBuffer, level: number) {
  if (level <= 0) return
  const rate = buffer.sampleRate
  const length = buffer.length
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i))
  let seed = 0x494d5043
  let low = 0
  let high = 0
  const lower = 1 - Math.exp(-2 * Math.PI * 290 / rate)
  const upper = 1 - Math.exp(-2 * Math.PI * 2350 / rate)
  for (let i = 0; i < length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const white = seed / 0x80000000 - 1
    low += lower * (white - low)
    high += upper * (white - high)
    const t = i / rate
    // Two short stylus contacts, coloured by the same reverse speed as the disc.
    const secondContact = (t - .225) / .037
    const contact = Math.exp(-t / .090) + .47 * Math.exp(-secondContact * secondContact) + .17 * Math.exp(-t / .80)
    const friction = (high - low) * level * .55 * contact
    for (const channel of channels) channel[i] = channel[i]! + friction
  }
}

function reverseBuffer(ctx: BaseAudioContext, track: AudioBuffer, offset: number, head: number) {
  const rate = track.sampleRate
  const length = Math.ceil(historySeconds * rate) + 4
  const reverse = ctx.createBuffer(track.numberOfChannels, length, rate)
  const first = Math.ceil(offset * rate)
  const end = Math.floor(head * rate)
  const measure = Math.min(length, Math.ceil(.35 * rate))
  let energy = 0
  for (let channel = 0; channel < reverse.numberOfChannels; channel++) {
    const pcm = reverse.getChannelData(channel)
    copyReverseHistory(track.getChannelData(channel), pcm, first, end)
    for (let i = 0; i < measure; i++) energy += pcm[i]! * pcm[i]!
  }
  const rms = Math.sqrt(energy / (measure * reverse.numberOfChannels))
  addQuietGroove(reverse, Math.min(1, Math.max(0, (.040 - rms) / .034)))
  return reverse
}

/** Play only the audio history at the cut, in reverse, through the caller's master gain. */
export function playBackspin(
  ctx: BaseAudioContext, output: AudioNode, track: AudioBuffer, offset: number, head: number,
  when: number, onEnd?: () => void,
) {
  const source = ctx.createBufferSource()
  source.buffer = reverseBuffer(ctx, track, offset, head)
  source.playbackRate.setValueAtTime(RATE_CURVE[0][1], when)
  for (const [at, rate] of RATE_CURVE.slice(1)) {
    source.playbackRate.linearRampToValueAtTime(rate, when + at)
  }

  const highpass = ctx.createBiquadFilter()
  highpass.type = 'highpass'
  highpass.frequency.value = 34
  highpass.Q.value = .62
  const lowpass = ctx.createBiquadFilter()
  lowpass.type = 'lowpass'
  lowpass.Q.value = .57
  lowpass.frequency.setValueAtTime(Math.min(14000, ctx.sampleRate * .45), when)
  lowpass.frequency.exponentialRampToValueAtTime(3400, when + .63)
  lowpass.frequency.exponentialRampToValueAtTime(510, when + BACKSPIN_SECONDS)

  const envelope = ctx.createGain()
  envelope.gain.setValueAtTime(0, when)
  envelope.gain.linearRampToValueAtTime(.92, when + .006)
  envelope.gain.setValueAtTime(.92, when + .19)
  envelope.gain.linearRampToValueAtTime(.70, when + .56)
  envelope.gain.linearRampToValueAtTime(.27, when + .79)
  envelope.gain.linearRampToValueAtTime(0, when + BACKSPIN_SECONDS)
  source.connect(highpass).connect(lowpass).connect(envelope).connect(output)

  let ended = false
  const clean = () => {
    if (ended) return
    ended = true
    source.disconnect()
    highpass.disconnect()
    lowpass.disconnect()
    envelope.disconnect()
    onEnd?.()
  }
  source.onended = clean
  source.start(when)
  source.stop(when + BACKSPIN_SECONDS)
  return () => {
    if (!ended) { source.stop(); clean() }
  }
}
