import assert from 'node:assert/strict'
import test from 'node:test'
import { copyReverseHistory } from '../src/game/audio/backspin'

test('the collision sample starts at the last played frame and reads backwards without mutating the track', () => {
  const original = Float32Array.from([11, 12, 13, 14, 15, 16, 17])
  const reversed = new Float32Array(4)
  copyReverseHistory(original, reversed, 0, 6)
  assert.deepEqual([...reversed], [16, 15, 14, 13])
  assert.deepEqual([...original], [11, 12, 13, 14, 15, 16, 17])
})

test('an early collision never wraps into future frames or into the trimmed intro', () => {
  const original = Float32Array.from([9, 8, 7, 6, 5])
  const reversed = new Float32Array(5).fill(4)
  copyReverseHistory(original, reversed, 2, 4)
  assert.deepEqual([...reversed], [6, 7, 0, 0, 0])
  copyReverseHistory(original, reversed, 2, 2)
  assert.deepEqual([...reversed], [0, 0, 0, 0, 0])
  copyReverseHistory(original, reversed, 2, 20)
  assert.deepEqual([...reversed], [5, 6, 7, 0, 0])
})
