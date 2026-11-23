import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { Track, MIN_REACTION_SECONDS, normalDistanceAt, normalTimeAtDistance } from '../src/game/core/Track'
import { DEFAULT_BPM, SPEED, START_SPEED, isTurn, type BeatEvent, type RenderSegment } from '../src/game/types'

type Piece = RenderSegment & { start: number }

function near(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-5, `${actual} differs from ${expected}`)
}

function generate(seed: number, distance: number, beatmap?: BeatEvent[]) {
  const track = new Track({ seed, beatmap })
  const events = new Map<number, typeof track.events[number]>()
  const pieces = new Map<number, Piece>()
  for (let step = 0; step <= distance; step += 32) {
    track.ensure(step)
    for (const event of track.events) events.set(event.id, event)
    for (const piece of track.segments) pieces.set(piece.id, piece)
  }
  return { pieces: [...pieces.values()], events: [...events.values()] }
}

test('equal seeds reproduce the track while alternate seeds change it', () => {
  const first = generate(123, 5000).events
  assert.deepEqual(first, generate(123, 5000).events)
  assert.notDeepEqual(first, generate(124, 5000).events)
  for (let index = 0; index < first.length; index++) {
    const event = first[index]!
    const previousDistance = first[index - 1]?.distance ?? 0
    assert.ok(normalTimeAtDistance(event.distance) - normalTimeAtDistance(previousDistance) >= MIN_REACTION_SECONDS - 1e-7)
    const beat = normalTimeAtDistance(event.distance) * DEFAULT_BPM / 60
    near(beat, Math.round(beat))
  }
})

test('the default route turns on beat 8 and alternates bounded series with a recovery after triples', () => {
  const file = new URL('../src/assets/music/phase-line.json', import.meta.url)
  const chart = JSON.parse(readFileSync(file, 'utf8')) as { bpm: number; events: BeatEvent[] }
  const metresPerBeat = SPEED * 60 / chart.bpm
  const { events } = generate(0x43525553, 40_000, chart.events)
  const corners = events.filter(event => isTurn(event.kind))
  near(corners[0]!.distance, normalDistanceAt(8*60/chart.bpm))
  assert.ok(corners[0]!.distance < 67)
  let previous = 0
  const groups:number[]=[]
  for (const corner of corners) {
    const leg = corner.distance - previous
    assert.ok(leg <= 22 * metresPerBeat + 1e-6)
    assert.ok(leg >= 4 * START_SPEED * 60/chart.bpm - 1e-6)
    const fields=events.filter(e=>e.distance>previous && e.distance<corner.distance)
    if(corner.id>=chart.events.length) groups.push(fields.length)
    if(fields.length===3) {
      const recovery=normalTimeAtDistance(corner.distance)-normalTimeAtDistance(fields[2]!.distance)
      assert.ok(recovery>=6*60/chart.bpm-1e-6)
    }
    previous = corner.distance
  }
  assert.deepEqual(groups.slice(0,6),[2,3,1,2,3,1])
})

test('every module meets the next at the same position, heading and path distance', () => {
  const { pieces, events } = generate(20997, 6000)
  for (let i = 0; i < pieces.length - 1; i++) {
    const current = pieces[i]!
    const next = pieces[i + 1]!
    const incoming = current.kind === 'straight' ? current.length : 5
    const yaw = current.yaw + (current.kind === 'straight' ? 0 : current.kind === 'left' ? Math.PI / 2 : -Math.PI / 2)
    const outgoing = current.length - incoming
    near(next.start, current.start + current.length)
    near(next.x, current.x - Math.sin(current.yaw) * incoming - Math.sin(yaw) * outgoing)
    near(next.z, current.z - Math.cos(current.yaw) * incoming - Math.cos(yaw) * outgoing)
    near(next.yaw, yaw)
    if (current.kind !== 'straight') {
      assert.ok(events.some(event => isTurn(event.kind) && Math.abs(event.distance - current.start - 5) < 1e-6))
      assert.ok(events.every(event => isTurn(event.kind) || Math.abs(event.distance - current.start - 5) > 5))
    }
  }
})

function footprint(piece: Piece) {
  const width = 10
  const dx = -Math.round(Math.sin(piece.yaw))
  const dz = -Math.round(Math.cos(piece.yaw))
  const x = piece.x + dx * piece.length / 2
  const z = piece.z + dz * piece.length / 2
  const radiusX = (Math.abs(dx) * piece.length + Math.abs(dz) * width) / 2
  const radiusZ = (Math.abs(dz) * piece.length + Math.abs(dx) * width) / 2
  return [x - radiusX, x + radiusX, z - radiusZ, z + radiusZ] as const
}

test('rectangular interiors including turn chambers do not overlap anywhere along the generated route', () => {
  for (const seed of [19, 108, 2026, 0xdeadbeef]) {
    const boxes = generate(seed, 8000).pieces.map(footprint)
    for (let i = 0; i < boxes.length; i++) {
      const a = boxes[i]!
      for (let j = i + 1; j < boxes.length; j++) {
        const b = boxes[j]!
        const overlapX = Math.min(a[1], b[1]) - Math.max(a[0], b[0])
        const overlapZ = Math.min(a[3], b[3]) - Math.max(a[2], b[2])
        assert.ok(overlapX < 1e-6 || overlapZ < 1e-6)
      }
    }
  }
})

test('authored beatmaps respect BPM, validate playability and continue procedurally', () => {
  const beatmap: BeatEvent[] = [
    { beat: 8, kind: 'center' }, { beat: 16, kind: 'top' }, { beat: 24, kind: 'bottom' },
    { beat: 32, kind: 'left' }, { beat: 42, kind: 'center' }, { beat: 50, kind: 'top' },
    { beat: 60, kind: 'right' },
  ]
  const track = new Track({ bpm: 144, beatmap })
  const found = new Map<number, typeof track.events[number]>()
  for (let distance = 0; distance < 1000; distance += 30) {
    track.ensure(distance)
    for (const event of track.events) found.set(event.id, event)
  }
  for (const [i, event] of beatmap.entries()) {
    near(found.get(i)!.distance, normalDistanceAt(event.beat * 60 / 144))
    assert.equal(found.get(i)!.kind, event.kind)
  }
  assert.ok(found.has(beatmap.length))
  assert.throws(() => new Track({ bpm: 0 }), /BPM/)
  assert.throws(() => new Track({ beatmap: [{ beat: 1, kind: 'center' }] }), /approach/)
  assert.throws(() => new Track({ beatmap: [{ beat: 8, kind: 'center' }, { beat: 9, kind: 'left' }] }), /approach/)
  assert.throws(() => new Track({ beatmap: [{ beat: 8, kind: 'left' }, { beat: 16, kind: 'left' }] }), /heading/)
  const rest = new Track({ beatmap: [{ beat: 1_000_000, kind: 'center' }] })
  assert.ok(rest.segments.length < 10)
  assert.equal(rest.events.length, 0)
})
