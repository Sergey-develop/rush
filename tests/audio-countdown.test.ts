import assert from 'node:assert/strict'
import test from 'node:test'
import { createStartRelay, renderContact } from '../src/game/audio/startRelay'

test('each run schedules three dry contacts, then the heavier latch exactly on the music downbeat', () => {
  const context = {
    sampleRate: 48000,
    createBuffer(_channels: number, length: number) {
      const data = new Float32Array(length)
      return { length, getChannelData: () => data }
    },
  } as unknown as BaseAudioContext
  const schedule = createStartRelay(context)
  for (const downbeat of [8.25, 25.75]) {
    const times: number[] = []
    const samples: AudioBuffer[] = []
    schedule(downbeat, 3, (buffer, at) => { times.push(at); samples.push(buffer) })
    assert.deepEqual(times.map(at => at - downbeat), [-3, -2, -1, 0])
    assert.equal(new Set(samples.slice(0, 3)).size, 3)
    assert.ok(samples[3].length > samples[0].length)
  }
})

test('contact and latch decay to silence cleanly at common device sample rates', () => {
  for (const rate of [44100, 48000, 96000]) {
    for (const launch of [false, true]) {
      const data = renderContact(rate, 0, launch)
      const peak = data.reduce((p, x) => Math.max(p, Math.abs(x)), 0)
      let earlyEnergy = 0, total = 0
      for (let i = 0; i < data.length; i++) {
        const power = data[i] ** 2
        total += power
        if (i < rate * (launch ? .100 : .035)) earlyEnergy += power
      }
      assert.equal(Math.abs(data[0]), 0)
      assert.equal(Math.abs(data[data.length - 1]), 0)
      assert.ok(peak > (launch ? .3 : .14) && peak < .4)
      assert.ok(data.length / rate < (launch ? .17 : .09))
      assert.ok(earlyEnergy / total > .99)
    }
  }
})
