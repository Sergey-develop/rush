// Each contact excites a short band of noise and the damped modes of its housing.
// The start latch has a larger body and a softer, lower mechanical stop.
const contactModes = [
  [510, .009, .29], [1085, .008, .15], [2180, .012, .16], [3540, .006, .09],
] as const
const latchModes = [
  [109, .030, .74], [212, .016, .27], [485, .019, .28], [1190, .011, .13], [2460, .009, .09],
] as const

export function renderContact(sampleRate: number, index: number, launch = false) {
  const pcm = new Float32Array(Math.ceil(sampleRate * (launch ? .162 : .086)))
  const modes = launch ? latchModes : contactModes
  const drift = [1, .977, 1.012][index % 3]
  const returnAt = launch ? .019 : .010 + index % 3 * .0008
  const noiseCutoff = 1 - Math.exp(-2 * Math.PI * (launch ? 3400 : 5400) / sampleRate)
  const bodyCutoff = 1 - Math.exp(-2 * Math.PI * (launch ? 370 : 800) / sampleRate)
  let seed = 0x71517 + index * 137
  let filtered = 0, body = 0, peak = 0
  for (let i = 0; i < pcm.length; i++) {
    const t = i / sampleRate
    const after = t - returnAt
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    filtered += ((seed / 2147483648 - 1) - filtered) * noiseCutoff
    body += (filtered - body) * bodyCutoff
    const impact = Math.exp(-t / .0032)
    const contact = after < 0 ? 0 : Math.exp(-after / .0019)
    let sample = (filtered - body) * (impact + .62 * contact) * (launch ? .89 : 1.65)
    for (const [hz, decay, gain] of modes) {
      const omega = 2 * Math.PI * hz * drift
      sample += gain * Math.exp(-t / decay) * Math.sin(omega * t)
      if (after >= 0) sample += .28 * gain * Math.exp(-after / decay) * Math.sin(omega * after)
    }
    const edge = Math.min(1, t / .00045, (pcm.length - 1 - i) / (sampleRate * .004))
    pcm[i] = sample * edge
    peak = Math.max(peak, Math.abs(pcm[i]))
  }
  const level = (launch ? .37 : .225) / peak
  for (let i = 0; i < pcm.length; i++) pcm[i] *= level
  return pcm
}

export function createStartRelay(context: BaseAudioContext) {
  const makeBuffer = (index: number, launch = false) => {
    const pcm = renderContact(context.sampleRate, index, launch)
    const buffer = context.createBuffer(1, pcm.length, context.sampleRate)
    buffer.getChannelData(0).set(pcm)
    return buffer
  }
  const contacts = [makeBuffer(0), makeBuffer(1), makeBuffer(2)]
  const latch = makeBuffer(0, true)
  return (downbeat: number, countdown: number, play: (buffer: AudioBuffer, at: number) => void) => {
    for (let i = 0; i < countdown; i++) play(contacts[i % contacts.length], downbeat - countdown + i)
    play(latch, downbeat)
  }
}
