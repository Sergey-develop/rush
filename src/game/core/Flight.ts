import {
  ACCELERATION_TIME, MAX_BOOST_SPEED_GAIN, MAX_HEIGHT, PLAYER_RADIUS, SPEED, START_SPEED, GAP_WIDTH, gapBounds, isTurn,
  bonusGap, type BarrierKind, type FlightInput, type FlightOptions, type FlightState,
  type RouteEvent,
} from '../types'
import { normalDistanceAt, normalSpeedAt, Track } from './Track'
import type { SongPace } from '../audio/SongPace'

const VERTICAL_SPEED = 5.9
const VERTICAL_RESPONSE = 0.055
const BOOST_RATIO = MAX_BOOST_SPEED_GAIN / SPEED
const BOOST_ATTACK = 0.30
const BOOST_RELEASE = 0.42
const DISTANCE_POINTS = 2

const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value))
const decayArea = (dt: number, tau: number) => -tau * Math.expm1(-dt / tau)

interface MotionStep {
  travel: number
  boostLevel: number
  bonus: number
}

/** The membrane occupies the whole plane outside the visible, rectangular opening. */
export function clearsBarrier(kind: BarrierKind, x: number, y: number) {
  const gap = gapBounds(kind)
  return Math.abs(x) + PLAYER_RADIUS <= GAP_WIDTH / 2
    && y - PLAYER_RADIUS >= gap.bottom
    && y + PLAYER_RADIUS <= gap.top
}

function initialState(): FlightState {
  return {
    charge:0, armed:false, grazes:0, breaks:0,
    x: 0, y: 0, z: 0, yaw: 0, roll: 0, distance: 0, score: 0, combo: 0, passed: 0,
    speed: START_SPEED, boosting: false, boostLevel: 0,
    next: null, dead: false, reason: null,
  }
}

export class Flight {
  readonly state = initialState()
  private track: Track
  private pace?: SongPace
  private readonly options: FlightOptions
  private lastEvent = -1
  private verticalVelocity = 0
  private obstaclePoints = 0
  private boostPoints = 0
  private elapsed = 0
  private raceStart = 0
  private raceEnd = 0
  private raceOrigin = 0
  private raceResult: 'won'|'lost'|undefined
  private resultAt = 0

  private raceDistance(t:number) { return this.pace?.distanceAt(t) ?? normalDistanceAt(t) }
  private rivalAt(t:number) {
    return this.raceOrigin+9+1.12*(this.raceDistance(t)-this.raceDistance(this.raceStart))
  }
  get pursuit() {
    if (!this.raceEnd || this.elapsed<this.raceStart || (this.raceResult && this.elapsed-this.resultAt>3)) return
    const rival=this.rivalAt(Math.min(this.elapsed,this.raceEnd))
    return {result:this.raceResult,lead:this.state.distance-rival,remaining:Math.max(0,this.rivalAt(this.raceEnd)-this.state.distance)}
  }
  rivalPose(out:{x:number;y:number;z:number;yaw:number;roll:number}) {
    const race=this.pursuit
    if (!race || race.result || race.lead>3 || race.lead < -70) return false
    const d=this.state.distance-race.lead
    this.track.sample(d,out)
    const lane=(kind:BarrierKind)=>kind==='top'?1.82:kind==='bottom'?-1.82:-.3
    const next=this.track.barriers.find(b=>b.distance>=d)
    const prev=this.track.barriers.filter(b=>b.distance<d).at(-1)
    const t=next ? clamp(1-(next.distance-d)/Math.min(11,next.distance-(prev?.distance??0)),0,1) : 0
    const y=prev?lane(prev.kind):0
    out.y=y+((next?lane(next.kind):y)-y)*t*t*(3-2*t)
    const side=1.10+2.4*Math.max(0,1-(this.elapsed-this.raceStart)/.65)**2
    out.x+=Math.cos(out.yaw)*side
    out.z-=Math.sin(out.yaw)*side
    return true
  }

  constructor(options: FlightOptions = {}) {
    this.options = options
    this.track = new Track(options)
    this.updatePose()
  }

  get segments() { return this.track.segments }
  get barriers() { return this.track.barriers }

  reset(pace?: SongPace) {
    this.pace = pace
    const beat=60/(this.options.bpm??172)
    this.raceStart=4*beat
    this.raceEnd=Math.min(52*beat,(pace?.duration??Infinity)-1)
    if(this.raceEnd-this.raceStart<8) this.raceEnd=0
    this.raceResult=undefined
    this.raceOrigin=0
    this.track = new Track(this.options, pace)
    Object.assign(this.state, initialState())
    if (pace) this.state.speed = pace.speedAt(0)
    this.lastEvent = -1
    this.verticalVelocity = 0
    this.obstaclePoints = 0
    this.boostPoints = 0
    this.elapsed = 0
    this.updatePose()
  }

  private nextEvent() {
    return this.track.events.find(event => event.id > this.lastEvent)
  }

  private moveVertical(dt: number, input: FlightInput) {
    const current = this.state.y
    let axis = Number.isFinite(input.vertical) ? clamp(input.vertical, -1, 1) : 0
    const target = input.targetY !== undefined && Number.isFinite(input.targetY)
      ? clamp(input.targetY, -MAX_HEIGHT, MAX_HEIGHT) : null
    if (axis === 0 && target !== null) axis = Math.sign(target - current)
    if (axis === 0) {
      this.verticalVelocity = 0
      return
    }
    const speed = axis * VERTICAL_SPEED
    const decay = Math.exp(-dt / VERTICAL_RESPONSE)
    const delta = speed * dt + (this.verticalVelocity - speed) * VERTICAL_RESPONSE * (1 - decay)
    this.verticalVelocity = speed + (this.verticalVelocity - speed) * decay
    let height = clamp(current + delta, -MAX_HEIGHT, MAX_HEIGHT)
    if (target !== null && !input.vertical && (target - current) * (target - height) <= 0) height = target
    if (Math.abs(height) === MAX_HEIGHT || height === target) this.verticalVelocity = 0
    this.state.y = height
  }

  // Integrate base speed and the exponential throttle ramp analytically. Fast and
  // slow frames cover the same metres, receive the same bonus, and hit the same plane.
  private motion(dt: number, held: boolean): MotionStep {
    const target = held ? 1 : 0
    const tau = held ? BOOST_ATTACK : BOOST_RELEASE
    const boostDecay = Math.exp(-dt / tau)
    let base: number
    let decayingBase: number
    if (this.pace) {
      base = this.pace.distanceAt(this.elapsed + dt) - this.pace.distanceAt(this.elapsed)
      decayingBase = this.state.boostLevel === target ? 0 : this.pace.coastingDistance(this.elapsed, dt, tau)
    } else {
      const speedDeficit = SPEED - normalSpeedAt(this.elapsed)
      const combinedTime = tau * ACCELERATION_TIME / (tau + ACCELERATION_TIME)
      base = SPEED * dt - speedDeficit * decayArea(dt, ACCELERATION_TIME)
      decayingBase = SPEED * decayArea(dt, tau) - speedDeficit * decayArea(dt, combinedTime)
    }
    const weighted = target * base + (this.state.boostLevel - target) * decayingBase
    return {
      travel: base + BOOST_RATIO * weighted,
      boostLevel: target + (this.state.boostLevel - target) * boostDecay,
      bonus: DISTANCE_POINTS * (1 + BOOST_RATIO) * weighted,
    }
  }

  private travelTime(metres: number, span: number, held: boolean) {
    let low = 0
    let high = span
    for (let i = 0; i < 36; i++) {
      const middle = (low + high) / 2
      if (this.motion(middle, held).travel < metres) low = middle
      else high = middle
    }
    return (low + high) / 2
  }

  private move(dt: number, motion: MotionStep, input: FlightInput) {
    this.moveVertical(dt, input)
    this.elapsed += dt
    this.state.distance += motion.travel
    this.state.boostLevel = motion.boostLevel
    const normal = this.pace?.speedAt(this.elapsed) ?? normalSpeedAt(this.elapsed)
    this.state.speed = normal * (1 + BOOST_RATIO * motion.boostLevel)
    this.boostPoints += motion.bonus
    if(this.elapsed<=this.raceStart) this.raceOrigin=this.state.distance
    if(this.raceEnd && this.elapsed>this.raceStart && !this.raceResult) {
      if(this.state.distance>=this.rivalAt(this.raceEnd)) this.raceResult='won'
      else if(this.elapsed>=this.raceEnd) this.raceResult='lost'
      if(this.raceResult) this.resultAt=this.elapsed
    }
  }

  armImpulse() {
    if (this.state.charge===3 && !this.state.dead) this.state.armed=true
  }

  private pass(event: RouteEvent, multiplier=1) {
    this.lastEvent = event.id
    this.state.passed++
    this.state.combo++
    this.obstaclePoints += multiplier * 100 * Math.min(8, this.state.combo) + (isTurn(event.kind) ? 100 : 0)
  }

  /** seconds is absolute transport time since the start of this run, excluding pauses. */
  advance(seconds: number, input: FlightInput) {
    if (this.state.dead || !Number.isFinite(seconds) || seconds <= this.elapsed) return
    const held = input.boost === true
    this.state.boosting = held
    while (this.elapsed < seconds && !this.state.dead) {
      this.track.ensure(this.state.distance)
      const event = this.nextEvent()
      // A single step always stays inside the track's generated lookahead, even at full boost.
      const boundary=this.elapsed<this.raceStart?this.raceStart:this.elapsed<this.raceEnd?this.raceEnd:Infinity
      const span = Math.min(seconds - this.elapsed, 3,boundary-this.elapsed)
      const motion = this.motion(span, held)
      const remaining = event ? event.distance - this.state.distance : Infinity
      if (!event || motion.travel + 1e-9 < remaining) {
        this.move(span, motion, input)
        continue
      }
      const hitTime = this.travelTime(remaining, span, held)
      this.move(hitTime, this.motion(hitTime, held), input)
      this.state.distance = event.distance
      if (isTurn(event.kind)) {
        this.pass(event)
      } else {
        const extra=bonusGap(event), y=this.state.y
        const risky=extra && y-PLAYER_RADIUS>=extra.bottom && y+PLAYER_RADIUS<=extra.top
        if (risky || clearsBarrier(event.kind,0,y)) {
          const gap=risky ? extra! : gapBounds(event.kind)
          if (Math.min(y-gap.bottom,gap.top-y)-PLAYER_RADIUS <= .24) {
            this.state.grazes++
            this.state.charge=Math.min(3,this.state.charge+1)
          }
          this.pass(event,risky && this.state.boostLevel>.5 ? 2 : 1)
        } else if (this.state.armed) {
          this.state.armed=false
          this.state.charge=0
          this.state.breaks++
          this.pass(event)
        } else {
          this.state.dead = true
          this.state.reason = 'barrier'
        }
      }
    }
    this.track.ensure(this.state.distance)
    this.updatePose()
  }

  private updatePose() {
    const state = this.state
    this.track.sample(state.distance, state)
    state.score = this.obstaclePoints + Math.floor(state.distance * DISTANCE_POINTS + this.boostPoints + 1e-8)
    const next = this.nextEvent()
    state.next = next && !state.dead ? {
      kind: next.kind, distance: Math.max(0, next.distance - state.distance),
    } : null
  }
}
