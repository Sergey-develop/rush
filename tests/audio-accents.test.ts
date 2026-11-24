import assert from 'node:assert/strict'
import test from 'node:test'
import { ACCENT_WIDTH, BeatAccents, detectAccents } from '../src/game/audio/BeatAccents'
import { estimateBpm } from '../src/game/audio/PulseCues'

test('a custom song supplies its own tempo even with softer offbeat hats',()=>{
  for (const bpm of [78,112,148,185]) {
    const hits:number[]=[]
    for (let beat=0;beat<20;beat++) {
      const start=.37+beat*60/bpm
      hits.push(start,.85,1,.2, start+30/bpm,.32,.04,1)
    }
    assert.ok(Math.abs(estimateBpm(Float32Array.from(hits))-bpm)<=1)
  }
  assert.equal(estimateBpm(new Float32Array()),120)
})

test('alternating foreground drums support double tempo, soft subdivisions alone do not',()=>{
  const paired=(offbeat:number)=>{
    const hits:number[]=[]
    for (let i=0;i<40;i++) hits.push(i*60/122, i%2 ? offbeat : .92, i%2 ? .45 : 1,.3)
    return estimateBpm(Float32Array.from(hits))
  }
  assert.equal(paired(.37),122)
  assert.equal(paired(.09),61)
})

test('light follows off-grid attacks, a tempo change and a fill, including a silent breakdown',()=>{
  const rate=12000
  const pcm=new Float32Array(rate*5)
  const hits=[.14,.64,1.14,1.39,1.64,1.89,3.43,3.61,3.80,4.21]
  for(const [index,at] of hits.entries()) {
    const start=Math.round(at*rate)
    const pitch=index<6?70:830
    for(let i=0;i<rate*.14;i++) {
      const t=i/rate
      pcm[start+i]+=.8*Math.sin(2*Math.PI*pitch*t)*Math.exp(-t/.037)
    }
  }
  const cues=detectAccents(pcm,rate), accents=new BeatAccents(cues)
  assert.equal(cues.length/ACCENT_WIDTH,hits.length)
  for(const [i,at] of hits.entries()) {
    assert.ok(Math.abs(cues[i*ACCENT_WIDTH]-at)<.025)
    const hit=accents.at(at+.030)
    assert.ok(hit.flash>.50)
    assert.ok(i<6?hit.warm>1.3*hit.cool:hit.cool>1.3*hit.warm)
    assert.equal(accents.at(at+.030).index,i)
  }
  assert.equal(accents.at(-.1).flash,0)
  assert.equal(accents.at(2.90).flash,0)
  assert.equal(accents.at(8.25).flash,0)
})

test('silence produces no pulses on an imaginary BPM grid',()=>{
  assert.equal(detectAccents(new Float32Array(12000*3),12000).length,0)
})

test('a trimmed start, quiet rest and isolated high hit leave the bass circuit dark',()=>{
  const timeline=new BeatAccents(Float32Array.of(.35,.95,1,.04,.60,.32,0,1,.84,.94,1,.15))
  assert.deepEqual(timeline.at(.375,.37),{index:0,flash:0,warm:0,cool:0})
  const treble=timeline.at(.61)
  assert.ok(treble.cool>.29)
  assert.equal(treble.warm,0)
  assert.ok(timeline.at(.70).cool<.02)
  const downstroke=timeline.at(.85)
  assert.ok(downstroke.warm>.90)
  assert.ok(downstroke.cool<.16)
  assert.equal(timeline.at(1.04).flash,0)
})

test('release noise at the end of a fading kick is not treated as a new strike',()=>{
  const rate=12000, pcm=new Float32Array(rate)
  for(let i=0;i<rate*.14;i++) {
    const t=i/rate
    pcm[rate*.25+i]=.8*Math.sin(2*Math.PI*70*t)*Math.exp(-t/.037)
  }
  const cues=detectAccents(pcm,rate)
  assert.equal(cues.length,ACCENT_WIDTH)
  assert.ok(Math.abs(cues[0]-.25)<.025)
})
