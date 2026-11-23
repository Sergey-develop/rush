import assert from 'node:assert/strict'
import { test } from 'node:test'
import { analyseSongPace, SongPace } from '../src/game/audio/SongPace'
import { Flight } from '../src/game/core/Flight'
import { Track, MIN_REACTION_SECONDS } from '../src/game/core/Track'
import { DEFAULT_BPM, isTurn, MAX_HEIGHT, type BeatEvent } from '../src/game/types'

const near = (actual:number, expected:number, error=1e-7) =>
  assert.ok(Math.abs(actual-expected)<error, `${actual} vs ${expected}`)

test('whole-phrase energy and real accent density shape a slow entrance, two peaks, a break and the coda', () => {
  const rate=800, duration=84
  const pcm=new Float32Array(rate*duration), events:number[]=[]
  for(let i=0;i<pcm.length;i++) {
    const t=i/rate, dense=t>=12 && t<34 || t>=51 && t<74
    pcm[i]=(dense ? .54 : .04)*Math.sin(2*Math.PI*47*t)
    if (i%(dense?160:800)===0) events.push(t,dense?.92:.34,.86,.54)
  }
  const cues=Float32Array.from(events)
  const knots=analyseSongPace(pcm,rate,cues)
  const curve=new SongPace(knots,duration)
  near(curve.speedAt(0),12)
  assert.ok(curve.speedAt(24)>21 && curve.speedAt(42)<15 && curve.speedAt(64)>21)
  assert.ok(curve.speedAt(77)>curve.speedAt(81))
  near(curve.speedAt(duration),10)
  for(let i=1;i<knots.length;i++) assert.ok(Math.abs(knots[i]!-knots[i-1]!)<2.8)
  const padded=new Float32Array((duration+3)*rate)
  padded.set(pcm,3*rate)
  for(let i=0;i<cues.length;i+=4) cues[i]+=3
  assert.deepEqual(analyseSongPace(padded,rate,cues,3),knots)
  const distance=curve.distanceAt(duration)
  for(const d of [0,45,distance*.3,distance-.01,distance,distance+300]) near(curve.distanceAt(curve.timeAtDistance(d)),d)
  const silent=new SongPace(analyseSongPace(new Float32Array(pcm.length),rate,new Float32Array()),duration)
  assert.ok(silent.speedAt(40)<14)
})

test('music-timed travel, changing throttle, scoring and pauses converge on exactly the same flight', () => {
  const pace=new SongPace(Float32Array.of(12,15,22,19,14,13,20,22,16,10),59.6)
  const beats:BeatEvent[]=Array.from({length:36},(_,i)=>({
    beat:8*(i+1),kind: (['center','left','center','right'] as const)[i%4]!,
  }))
  const options={beatmap:beats,seed:742}
  const fast=new Flight(options), slow=new Flight(options)
  fast.reset(pace);slow.reset(pace)
  let start=0
  for(const [end,boost] of [[5.21,false],[15.657,true],[25.09,false],[39.72,true],[48.86,false]] as const) {
    const input={vertical:0,boost}
    for(let i=1;i<=271;i++) fast.advance(start+(end-start)*i/271,input)
    slow.advance(end,input)
    const a=fast.state,b=slow.state
    near(a.distance,b.distance,1e-6);near(a.speed,b.speed);near(a.yaw,b.yaw);near(a.boostLevel,b.boostLevel)
    assert.ok(!a.dead && !b.dead);assert.equal(a.score,b.score);assert.equal(a.passed,b.passed)
    const frozen={...b};slow.advance(end,{vertical:1,boost:!boost});assert.deepEqual(slow.state,frozen)
    start=end
  }
  slow.reset(pace);slow.advance(9,{vertical:0})
  near(slow.state.distance,pace.distanceAt(9));near(slow.state.speed,pace.speedAt(9))
})

test('a boosted pilot entering quiet-section geometry still has time for alternating opposite openings', () => {
  const pace=new SongPace(Float32Array.of(12,20,22,22,22,14,10,10,10),48)
  const beat=MIN_REACTION_SECONDS*DEFAULT_BPM/60
  const chart:BeatEvent[]=Array.from({length:35},(_,i)=>({beat:(i+1)*beat,kind:i%2?'bottom':'top'}))
  const route=new Track({beatmap:chart},pace)
  let prev=0, from=0
  for(let d=0;d<pace.distanceAt(60);d+=25) {
    route.ensure(d)
    for(const e of route.events) {
      if(e.id<from)continue
      const t=pace.timeAtDistance(e.distance)
      assert.ok(t-prev>=MIN_REACTION_SECONDS-1e-7);prev=t;from=e.id+1
    }
  }
  const flight=new Flight({beatmap:chart});flight.reset(pace)
  let target=0, last=0, passed=0
  for(let frame=0;frame<=60*240 && passed<chart.length;frame++) {
    const t=frame/240,n=flight.state.next
    if(t-last>=.28 && n && !isTurn(n.kind)) target=n.kind==='top'?MAX_HEIGHT:-MAX_HEIGHT
    flight.advance(t,{vertical:0,targetY:target,boost:true})
    assert.ok(!flight.state.dead)
    if(flight.state.passed>passed){assert.ok(t-last>=.935);passed=flight.state.passed;last=t}
  }
  assert.equal(passed,chart.length)
})
