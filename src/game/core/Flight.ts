import {
  ACCELERATION_TIME, MAX_BOOST_SPEED_GAIN, MAX_HEIGHT, PICKUP_BOOST_SECONDS, PLAYER_RADIUS, SPEED, START_SPEED, GAP_WIDTH, gapBounds, isTurn,
  type BarrierKind, type FlightInput, type FlightOptions, type FlightState,
  type RouteEvent,
} from '../types'
import { normalSpeedAt, Track } from './Track'
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
    x: 0, y: 0, z: 0, yaw: 0, roll: 0, distance: 0, score: 0, combo: 0, passed: 0,
    shield: false, boostSeconds: 0, speed: START_SPEED, sprinting: false, boosting: false, boostLevel: 0,
    next: null, dead: false, reason: null,
  }
}

export class Flight {
  readonly state = initialState()
  private track: Track
  private pace?: SongPace
  private readonly options: FlightOptions
  // Transport timestamps preserve short-lived contact effects across slow frames and pause.
  readonly effectTimes = { shieldArmed: -Infinity, shieldHit: -Infinity, boostIgnited: -Infinity }
  private boostUntil = 0
  private lastPickup = -1
  private lastEvent = -1
  private verticalVelocity = 0
  private obstaclePoints = 0
  private boostPoints = 0
  private elapsed = 0

  constructor(options: FlightOptions = {}) {
    this.options = options
    this.track = new Track(options)
    this.updatePose()
  }

  get segments() { return this.track.segments }
  get pickups() { return this.track.pickups }
  get barriers() { return this.track.barriers }

  reset(pace?: SongPace) {
    this.pace = pace
    this.track = new Track(this.options, pace)
    Object.assign(this.state, initialState())
    if (pace) this.state.speed = pace.speedAt(0)
    this.effectTimes.shieldArmed = -Infinity
    this.effectTimes.shieldHit = -Infinity
    this.effectTimes.boostIgnited = -Infinity
    this.lastPickup = -1
    this.boostUntil = 0
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
    const sensitivity = input.verticalSensitivity ?? 1
    const speed = axis * VERTICAL_SPEED * (Number.isFinite(sensitivity) ? clamp(sensitivity, .5, 1.5) : 1)
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
  private motion(dt: number, target: number): MotionStep {
    const tau = target > this.state.boostLevel ? BOOST_ATTACK : BOOST_RELEASE
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

  private travelTime(metres: number, span: number, target: number) {
    let low = 0
    let high = span
    for (let i = 0; i < 36; i++) {
      const middle = (low + high) / 2
      if (this.motion(middle, target).travel < metres) low = middle
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
  }

  private pass(event: RouteEvent) {
    this.lastEvent = event.id
    this.state.passed++
    this.state.combo++
    this.obstaclePoints += 100 * Math.min(8, this.state.combo) + (isTurn(event.kind) ? 100 : 0)
  }

  /** seconds is absolute transport time since the start of this run, excluding pauses. */
  advance(seconds: number, input: FlightInput) {
    if (this.state.dead || !Number.isFinite(seconds) || seconds <= this.elapsed) return
    while (this.elapsed < seconds && !this.state.dead) {
      this.track.ensure(this.state.distance)
      const event = this.nextEvent()
      // A single step always stays inside the track's generated lookahead, even at full boost.
      const boostRemaining = Math.max(0, this.boostUntil - this.elapsed)
      const target = Number(input.boost === true) + Number(boostRemaining > 0)
      const span = Math.min(seconds - this.elapsed, boostRemaining || Infinity, 3)
      const motion = this.motion(span, target)
      const pickup = this.track.pickups.find(item => item.id > this.lastPickup)
      const nextDistance = Math.min(event?.distance ?? Infinity, pickup?.distance ?? Infinity)
      const remaining = nextDistance - this.state.distance
      if (motion.travel + 1e-9 < remaining) {
        this.move(span, motion, input)
        continue
      }
      const hitTime = this.travelTime(remaining, span, target)
      this.move(hitTime, this.motion(hitTime, target), input)
      this.state.distance = nextDistance
      if (pickup && pickup.distance === nextDistance) {
        this.lastPickup = pickup.id
        if (Math.abs(this.state.y - pickup.y) <= .65) {
          if (pickup.kind === 'shield') {
            this.state.shield = true
            this.effectTimes.shieldArmed = this.elapsed
          } else {
            this.boostUntil = this.elapsed + PICKUP_BOOST_SECONDS
            this.effectTimes.boostIgnited = this.elapsed
          }
        }
        continue
      }
      if (!event) continue
      if (isTurn(event.kind) || clearsBarrier(event.kind, 0, this.state.y)) {
        this.pass(event)
      } else if (this.state.shield) {
        this.effectTimes.shieldHit = this.elapsed
        this.state.shield = false
        this.state.combo = 0
        this.lastEvent = event.id
      } else {
        this.state.dead = true
        this.state.reason = 'barrier'
      }
    }
    this.state.boostSeconds = Math.max(0, this.boostUntil - this.elapsed)
    this.state.sprinting = input.boost === true
    this.state.boosting = this.state.sprinting || this.state.boostSeconds > 0
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
