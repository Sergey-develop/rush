import assert from 'node:assert/strict'
import test from 'node:test'
import { analyseRecording } from '../src/game/audio/BeatAccents'
import { TimbreLights } from '../src/game/audio/TimbreLights'

test('off-grid kick, snare, repeated hats and sustained notes have independent light envelopes',() => {
  const rate = 24000, pcm = new Float32Array(3*rate)
  function mix(at: number, length: number, sound: (t: number) => number) {
    for (let i=0; i<Math.round(length*rate); i++) pcm[Math.round(at*rate)+i] += sound(i/rate)
  }
  const sine = (hz: number,t: number) => Math.sin(2*Math.PI*hz*t)
  mix(.2,.18,t=>.50*sine(64,t)*Math.exp(-t/.043))
  // Band-limited, inharmonic noise burst with the broad body of a struck snare.
  let seed=13, history=0
  mix(.58,.11,t=>{
    seed=(Math.imul(seed,1664525)+1013904223) >>> 0
    const noise=(seed/0x80000000-1)
    history += .28*(noise-history)
    return .70*history*Math.exp(-t/.03)
  })
  // Quiet upper percussion over a sustained note, including two hits 73 ms apart.
  mix(1,.95,t=>.23*Math.min(1,t/.12,(.95-t)/.13)*(sine(610,t)+.3*sine(1220,t)))
  for (const at of [1.31,1.383,1.76]) mix(at,.04,t=>.055*sine(8700,t)*Math.exp(-t/.010))
  mix(2.08,.12,t=>(.32*sine(75,t)+.12*sine(9300,t))*Math.exp(-t/.030))
  const {voices,step} = analyseRecording(pcm,rate)
  const timeline = new TimbreLights(voices,step)
  const at = (time: number) => {
    const out={kick:0,snare:0,hat:0,tone:0}
    timeline.sample(time,out)
    return out
  }
  const kick=at(.222), snare=at(.600), note=at(1.25)
  assert.ok(kick.kick>.65 && kick.snare<.20 && kick.hat<.12,JSON.stringify(kick))
  assert.ok(snare.snare>.17 && snare.snare>5*snare.kick,JSON.stringify(snare))
  assert.ok(note.tone>.55 && note.kick<.08 && note.snare<.12 && note.hat<.10,JSON.stringify(note))
  for (const hit of [1.31,1.383,1.76]) {
    const before=at(hit-.020), strike=at(hit+.012)
    assert.ok(strike.hat > before.hat+.02 && strike.hat < strike.tone*.15,JSON.stringify({hit,before,strike}))
    assert.ok(strike.kick<.05 && strike.snare<.14 && strike.tone>.55)
  }
  const simultaneous=at(2.095)
  assert.ok(simultaneous.kick>.45 && simultaneous.hat>.12 && simultaneous.hat<.5*simultaneous.kick,JSON.stringify(simultaneous))
  assert.deepEqual(at(2.90),{kick:0,snare:0,hat:0,tone:0})
  assert.deepEqual(at(-.02),at(3.8))
})


test('attenuating a recording attenuates every fixture even when each voice leads its band', () => {
  const rate = 24000
  const pcm = new Float32Array(rate*2)
  let seed=71, noise=0
  for (let i=0; i<rate*.16; i++) {
    const t=i/rate, decay=Math.exp(-t/.045)
    pcm[rate*.20+i]=.46*Math.sin(2*Math.PI*67*t)*decay
    seed=(Math.imul(seed,1664525)+1013904223)>>>0
    noise+=.38*(seed/0x80000000-1-noise)
    pcm[rate*.60+i]=.87*noise*decay
    pcm[rate*1.00+i]=.50*Math.sin(2*Math.PI*8200*t)*decay
  }
  for (let i=0; i<rate*.45; i++)
    pcm[rate*1.4+i]=.32*Math.sin(2*Math.PI*520*i/rate)*Math.min(1,i/(rate*.08))
  const loud=analyseRecording(pcm,rate)
  const soft=analyseRecording(pcm.map(v=>v/8),rate)
  for (const [channel, peakTime] of [[0,.22],[1,.62],[2,1.02],[3,1.72]]) {
    const index=Math.round(peakTime/loud.step)*4+channel
    const foreground=loud.voices[index], background=soft.voices[index]
    assert.ok(foreground>.2 && background>.01 && background<foreground*.20,
      JSON.stringify({channel,foreground,background}))
  }
})
