import assert from 'node:assert/strict'
import test from 'node:test'
import { Flight, clearsBarrier } from '../src/game/core/Flight'
import { MIN_REACTION_SECONDS, normalDistanceAt, normalSpeedAt, normalTimeAtDistance } from '../src/game/core/Track'
import { DEFAULT_BPM, GAP_WIDTH, MAX_HEIGHT, PLAYER_RADIUS, SPEED, START_SPEED, MAX_BOOST_SPEED_GAIN, gapBounds, isTurn, type BarrierKind, type BeatEvent } from '../src/game/types'

const neutral = { vertical: 0 }
const beatTime = (beat: number) => beat * 60 / DEFAULT_BPM
function near(actual: number, expected: number, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`)
}
function targetFor(kind: BarrierKind) {
  const gap = gapBounds(kind)
  return (gap.top + gap.bottom) / 2
}

for (const kind of ['top', 'center', 'bottom'] as const) {
  test(`${kind} opening is clear only within its visible edges`, () => {
    const y = targetFor(kind)
    assert.equal(clearsBarrier(kind, 0, y), true)
    assert.equal(clearsBarrier(kind, GAP_WIDTH / 2 - PLAYER_RADIUS - 0.001, y), true)
    assert.equal(clearsBarrier(kind, GAP_WIDTH / 2 - PLAYER_RADIUS + 0.001, y), false)
    const gap = gapBounds(kind)
    assert.equal(clearsBarrier(kind, 0, gap.bottom + PLAYER_RADIUS - 0.001), false)
    assert.equal(clearsBarrier(kind, 0, gap.top - PLAYER_RADIUS + 0.001), false)
  })
  test(`${kind} barrier passes on its beat and crashes on a missed opening`, () => {
    const flight = new Flight({ beatmap: [{ beat: 8, kind }] })
    flight.advance(beatTime(8) - 0.001, { vertical: 0, targetY: targetFor(kind) })
    assert.equal(flight.state.combo, 0)
    flight.advance(beatTime(8) + 0.001, neutral)
    assert.equal(flight.state.dead, false)
    assert.equal(flight.state.combo, 1)
    const scored = flight.state.score
    flight.reset()
    flight.advance(beatTime(8) + 9, { vertical: 0, targetY: kind === 'top' ? -2 : 2 })
    assert.equal(flight.state.reason, 'barrier')
    assert.equal(flight.state.dead, true)
    near(flight.state.distance, normalDistanceAt(beatTime(8)))
    assert.ok(flight.state.score < scored)
    const atImpact = { ...flight.state }
    flight.advance(1_000_000, neutral)
    assert.deepEqual(flight.state, atImpact)
    flight.reset()
    assert.equal(flight.state.dead, false)
    assert.equal(flight.state.score, 0)
    assert.equal(flight.state.next?.kind, kind)
  })
}

for (const direction of ['left', 'right'] as const) {
  test(`${direction} turn is automatic, joined continuously and eased`, () => {
    const sign = direction === 'left' ? 1 : -1
    const flight = new Flight({ beatmap: [{ beat: 8, kind: direction }] })
    const pivot = beatTime(8)
    flight.advance(pivot - 1.5, neutral)
    assert.equal(flight.state.next?.kind, direction)
    near(flight.state.next!.distance, normalDistanceAt(pivot) - normalDistanceAt(pivot - 1.5))
    flight.advance(pivot - 0.001, neutral)
    const before = { ...flight.state }
    flight.advance(pivot + 0.001, neutral)
    assert.ok(Math.hypot(before.x - flight.state.x, before.z - flight.state.z) <= 0.002 * SPEED)
    assert.ok(Math.abs(before.yaw - flight.state.yaw) < 0.04)
    assert.ok(Math.abs(flight.state.yaw) < Math.PI / 2)
    flight.advance(pivot + 0.5, neutral)
    near(flight.state.yaw, sign * Math.PI / 2)
    near(flight.state.x, -sign * (normalDistanceAt(pivot + 0.5) - normalDistanceAt(pivot)))
    near(flight.state.z, -normalDistanceAt(pivot))
    assert.equal(flight.state.combo, 1)
  })
}

test('four consecutive automatic turns retain heading and score once each across one long frame', () => {
  const beatmap: BeatEvent[] = [
    { beat: 4, kind: 'left' }, { beat: 8, kind: 'right' },
    { beat: 12, kind: 'right' }, { beat: 16, kind: 'left' }, { beat: 24, kind: 'center' },
  ]
  const coarse = new Flight({ beatmap })
  const fine = new Flight({ beatmap })
  const end = beatTime(16) + 0.5
  coarse.advance(end, neutral)
  for (let i = 1; i <= 400; i++) fine.advance(end * i / 400, neutral)
  near(coarse.state.x, fine.state.x)
  near(coarse.state.z, fine.state.z)
  near(coarse.state.yaw, 0)
  near(coarse.state.roll, 0)
  assert.equal(coarse.state.dead, false)
  assert.equal(coarse.state.combo, 4)
  assert.equal(coarse.state.passed, 4)
  assert.equal(coarse.state.score, 1400 + Math.floor(normalDistanceAt(end) * 2))
  assert.equal(fine.state.score, coarse.state.score)
  coarse.advance(end, neutral)
  assert.equal(coarse.state.passed, 4)
})

test('absolute transport measures forward travel and preserves altitude when controls release', () => {
  const flight = new Flight({ beatmap: [{ beat: 40, kind: 'center' }] })
  const other = new Flight({ beatmap: [{ beat: 40, kind: 'center' }] })
  flight.advance(0.28, { vertical: 1 })
  for (let frame = 1; frame <= 28; frame++) other.advance(frame / 100, { vertical: 1 })
  assert.ok(flight.state.y > 1)
  near(flight.state.y, other.state.y)
  near(flight.state.z, -normalDistanceAt(0.28))
  const altitude = flight.state.y
  flight.advance(1, neutral)
  near(flight.state.y, altitude)
  const paused = { ...flight.state }
  flight.advance(1, { vertical: -1 })
  flight.advance(0.9, { vertical: -1 })
  assert.deepEqual(flight.state, paused)
  flight.advance(3, { vertical: -1 })
  near(flight.state.y, -MAX_HEIGHT)
  flight.advance(5, { vertical: 1 })
  near(flight.state.y, MAX_HEIGHT)
})

test('opposite extremes remain reachable at the minimum custom-chart spacing', () => {
  const intervalBeats = MIN_REACTION_SECONDS * DEFAULT_BPM / 60
  const flight = new Flight({ beatmap: [
    { beat: intervalBeats, kind: 'top' },
    { beat: 2 * intervalBeats, kind: 'bottom' },
    { beat: 3 * intervalBeats, kind: 'top' },
  ] })
  for (let step = 1; step <= 3; step++) {
    const now = step * MIN_REACTION_SECONDS
    // Leave a human response interval after the previous, opposite-height membrane.
    flight.advance(now - MIN_REACTION_SECONDS + 0.4, neutral)
    flight.advance(now + 0.001, { vertical: step === 2 ? -1 : 1 })
    assert.equal(flight.state.passed, step)
    assert.equal(flight.state.dead, false)
  }
})

test('two-hour seeded run crosses all obstacle types with bounded live data', () => {
  const flight = new Flight({ seed: 10073 })
  const seen = new Set<string>()
  let highestSegments = 0
  for (let tick = 1; tick <= 7_200 * 15; tick++) {
    const next = flight.state.next
    let targetY = 0
    if (next) {
      seen.add(next.kind)
      if (!isTurn(next.kind)) targetY = targetFor(next.kind)
    }
    flight.advance(tick / 15, { vertical: 0, targetY })
    highestSegments = Math.max(highestSegments, flight.segments.length)
    assert.equal(flight.state.dead, false)
  }
  assert.deepEqual([...seen].sort(), ['bottom', 'center', 'left', 'right', 'top'])
  assert.ok(flight.state.passed > 4700)
  assert.ok(highestSegments <= 22)
  assert.ok(flight.barriers.length <= 6)
  near(flight.state.distance, normalDistanceAt(7200))
})

test('normal flight accelerates gently and the visual fixture stays exactly 9.8 m from the first gate', () => {
  const flight = new Flight({ beatmap: [{ beat: 3, kind: 'center' }], bpm: 122 })
  const approach = flight.state.next!.distance
  near(flight.state.speed, START_SPEED)
  near(approach, normalDistanceAt(3*60/122))
  flight.advance(normalTimeAtDistance(approach - 9.8), neutral)
  near(flight.state.next!.distance, 9.8)
  assert.ok(flight.state.speed > START_SPEED && flight.state.speed < 13)
  const straight = new Flight({ beatmap: [{ beat: 300, kind: 'center' }] })
  for (const seconds of [4, 12, 24, 40, 60]) {
    const previous = straight.state.speed
    straight.advance(seconds, neutral)
    assert.ok(straight.state.speed > previous && straight.state.speed <= SPEED)
    near(straight.state.speed, normalSpeedAt(seconds))
    near(straight.state.distance, normalDistanceAt(seconds))
  }
  assert.ok(normalSpeedAt(40)>21.5)
})

test('held boost ramps in and out independently of frame rate and earns additional points per metre', () => {
  const chart: BeatEvent[] = [{ beat: 120, kind: 'center' }]
  const coarse = new Flight({ beatmap: chart }), fine = new Flight({ beatmap: chart })
  let t = 0
  for (const [duration, held] of [[8, false],[.30,true],[2.70,true],[.42,false],[2,false],[5,true]] as const) {
    const from = t
    t += duration
    coarse.advance(t,{...neutral,boost:held})
    for(let i=1;i<=120;i++) fine.advance(from + duration*i/120,{...neutral,boost:held})
    near(fine.state.distance,coarse.state.distance)
    near(fine.state.boostLevel,coarse.state.boostLevel)
    near(fine.state.speed,coarse.state.speed)
    assert.equal(fine.state.score,coarse.state.score)
    assert.equal(coarse.state.boosting,held)
    if(duration===.30) near(coarse.state.boostLevel,1-Math.exp(-1))
    if(duration===.42) assert.ok(coarse.state.boostLevel>.35 && coarse.state.boostLevel<.38)
  }
  assert.ok(coarse.state.speed < SPEED+MAX_BOOST_SPEED_GAIN)
  assert.ok(coarse.state.distance > normalDistanceAt(t))
  assert.ok(coarse.state.score > coarse.state.distance * 2 + 40)
  const still = { ...coarse.state }
  coarse.advance(t, neutral)
  assert.deepEqual(coarse.state,still)
  coarse.reset()
  near(coarse.state.speed,START_SPEED)
  assert.equal(coarse.state.boostLevel,0)
  assert.equal(coarse.state.boosting,false)
  assert.equal(coarse.state.score,0)
})

test('distance bonus stops exactly at impact and a last-instant tap does not receive the held bonus', () => {
  const options={ beatmap: [{beat:12,kind:'top'}] as BeatEvent[] }
  const neutralRun=new Flight(options), boosted=new Flight(options), tap=new Flight(options)
  neutralRun.advance(20,neutral)
  boosted.advance(20,{...neutral,boost:true})
  tap.advance(beatTime(12)-.0001,neutral)
  tap.advance(20,{...neutral,boost:true})
  for(const flight of [neutralRun,boosted,tap]) {
    assert.equal(flight.state.reason,'barrier')
    near(flight.state.distance,normalDistanceAt(beatTime(12)))
  }
  assert.ok(boosted.state.score > neutralRun.state.score * 1.65)
  assert.ok(tap.state.score <= neutralRun.state.score+1)
  const score=boosted.state.score
  boosted.advance(50,{...neutral,boost:true})
  assert.equal(boosted.state.score,score)
})

test('full boost allows time to reach consecutive opposite apertures in the shortest legal chart', () => {
  const beats=MIN_REACTION_SECONDS*DEFAULT_BPM/60
  const beatmap:BeatEvent[] = Array.from({length:12},(_,i)=>({beat:(i+1)*beats,kind:i%2?'bottom':'top'}))
  const flight=new Flight({beatmap})
  let previousTime=0, previousPass=0, targetY=0
  for(let frame=1;frame<2000 && previousPass<beatmap.length;frame++) {
    const time=frame/120
    const next=flight.state.next!
    if(time-previousTime>=.28 && !isTurn(next.kind)) targetY=next.kind==='top'?MAX_HEIGHT:-MAX_HEIGHT
    flight.advance(time,{...neutral,boost:true,targetY})
    assert.equal(flight.state.dead,false)
    if(flight.state.passed>previousPass){
      assert.ok(time-previousTime>=.94)
      previousTime=time;previousPass=flight.state.passed
    }
  }
  assert.equal(previousPass,beatmap.length)
})

test('a shield is optional, absorbs one missed gate and resets with the run', () => {
  const flight = new Flight({bpm: 120, beatmap: [
    {beat: 40, kind: 'left'}, {beat: 44, kind: 'bottom'}, {beat: 48, kind: 'bottom'},
  ]})
  flight.advance(20.1, {vertical: 0, targetY: 1.25})
  assert.equal(flight.state.shield, true)
  assert.ok(flight.effectTimes.shieldArmed > 0 && flight.effectTimes.shieldArmed < 20.1)
  assert.equal(flight.effectTimes.shieldHit,-Infinity)
  flight.advance(22.1, neutral)
  near(flight.effectTimes.shieldHit,22)
  assert.equal(flight.state.shield, false)
  assert.equal(flight.state.dead, false)
  assert.equal(flight.state.combo, 0)
  flight.advance(24.1, neutral)
  assert.equal(flight.state.dead, true)
  flight.reset()
  assert.equal(flight.effectTimes.shieldArmed,-Infinity)
  assert.equal(flight.effectTimes.shieldHit,-Infinity)
  flight.advance(22.1, neutral)
  assert.equal(flight.effectTimes.shieldArmed,-Infinity)
  assert.equal(flight.state.dead, true)
})

test('sprint and collected thrust stack, expire separately and integrate across skipped frames', () => {
  const beatmap: BeatEvent[] = [
    {beat: 40, kind: 'left'}, {beat: 84, kind: 'right'}, {beat: 124, kind: 'left'},
  ]
  const coarse = new Flight({bpm: 120, beatmap})
  const fine = new Flight({bpm: 120, beatmap})
  let previous = 0
  for (const [time, sprinting] of [[42,false],[43,true],[44,false],[48,true]] as const) {
    const input = {vertical: 0, targetY: -1.25, boost: sprinting}
    coarse.advance(time,input)
    for (let i=1;i<=200;i++) fine.advance(previous+(time-previous)*i/200,input)
    near(coarse.state.distance,fine.state.distance)
    near(coarse.state.speed,fine.state.speed)
    near(coarse.state.boostSeconds,fine.state.boostSeconds)
    near(coarse.effectTimes.boostIgnited,fine.effectTimes.boostIgnited)
    assert.equal(coarse.state.score,fine.state.score)
    assert.equal(coarse.state.sprinting,sprinting)
    assert.equal(coarse.state.boostSeconds > 0,time < 48)
    if (time === 43) {
      assert.ok(coarse.state.boostLevel > 1.9)
      assert.ok(coarse.state.speed > normalSpeedAt(time) * 1.65)
    } else {
      assert.ok(coarse.state.boostLevel > .5 && coarse.state.boostLevel < 1.1)
    }
    previous=time
  }
  coarse.reset()
  assert.equal(coarse.state.boostSeconds,0)
  assert.equal(coarse.state.boostLevel,0)
})
