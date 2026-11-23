import {
  ACCELERATION_TIME, DEFAULT_BPM, MAX_BOOST_SPEED_GAIN, SPEED, START_SPEED, isTurn,
  type BeatEvent, type FlightOptions, type ObstacleKind,
  type RenderBarrier, type RenderSegment, type RouteEvent,
} from '../types'
import type { SongPace } from '../audio/SongPace'

export const MIN_REACTION_SECONDS = 1.3
const LOOK_AHEAD = 132
const RETAIN_BEHIND = 24
const HALF_CORNER = 5
const TURN_ANIMATION_DISTANCE = 5.4
const MIN_BOOSTED_APPROACH = .94
const OBSTACLES: readonly ObstacleKind[] = ['top', 'center', 'bottom', 'left', 'right']

export function normalSpeedAt(seconds: number) {
  return SPEED - (SPEED - START_SPEED) * Math.exp(-seconds / ACCELERATION_TIME)
}

/** Integral of the normal launch-speed curve. The authored chart stays on the recording's beats. */
export function normalDistanceAt(seconds: number) {
  return SPEED * seconds + (SPEED - START_SPEED) * ACCELERATION_TIME * Math.expm1(-seconds / ACCELERATION_TIME)
}

export function normalTimeAtDistance(metres: number) {
  if (metres <= 0) return 0
  let low = metres / SPEED
  let high = metres / START_SPEED
  for (let i = 0; i < 48; i++) {
    const middle = (low + high) / 2
    if (normalDistanceAt(middle) < metres) low = middle
    else high = middle
  }
  return (low + high) / 2
}

interface TrackSegment extends RenderSegment {
  start: number
}

function validateMap(map: readonly BeatEvent[], bpm: number) {
  const minBeats = MIN_REACTION_SECONDS * bpm / 60
  let beat = 0
  let heading = 0
  for (const event of map) {
    if (!OBSTACLES.includes(event.kind) || !Number.isFinite(event.beat)) {
      throw new Error('Beatmap event needs a finite beat and a supported obstacle kind.')
    }
    if (event.beat - beat < minBeats - 1e-8) {
      throw new Error(`Beatmap events need at least ${MIN_REACTION_SECONDS} seconds of approach, including the first event.`)
    }
    if (isTurn(event.kind)) heading += event.kind === 'left' ? 1 : -1
    if (Math.abs(heading) > 1) {
      throw new Error('A lateral corridor must turn back to the forward heading to keep the route clear.')
    }
    beat = event.beat
  }
}

// The cursor only progresses forward in world Z. Sideways legs occupy separate
// Z bands, each separated by a full approach, so even a very long route cannot loop.
export class Track {
  readonly segments: TrackSegment[] = []
  readonly events: RouteEvent[] = []
  readonly barriers: RenderBarrier[] = []
  readonly bpm: number
  private beatmap: readonly BeatEvent[]
  private seed: number
  private chartIndex = 0
  private pending: BeatEvent | null = null
  private segmentId = 0
  private eventId = 0
  private beat = 0
  private lastDistance = 0
  private barriersSinceTurn = 0
  private cursorDistance = -12
  private x = 0
  private z = 12
  private heading = 0

  constructor(options: FlightOptions = {}, private readonly pace?: SongPace) {
    this.bpm = options.bpm ?? DEFAULT_BPM
    if (!Number.isFinite(this.bpm) || this.bpm <= 0) throw new Error('BPM must be positive and finite.')
    this.seed = (options.seed ?? 0x71b93ad5) >>> 0
    this.beatmap = options.beatmap ?? []
    validateMap(this.beatmap, this.bpm)
    this.ensure(0)
  }

  private random() {
    this.seed = (Math.imul(1664525, this.seed) + 1013904223) >>> 0
    return this.seed / 0x100000000
  }

  private nextEvent(): BeatEvent {
    const authored = this.beatmap[this.chartIndex]
    if (authored) {
      this.chartIndex++
      return authored
    }
    const minBeats = Math.ceil(MIN_REACTION_SECONDS * this.bpm / 60)
    const targetSeconds = this.random() < 0.8 ? 1.42 : 1.70
    const spacing = Math.max(minBeats, Math.round(targetSeconds*this.bpm/60))
    let kind: ObstacleKind
    if (this.barriersSinceTurn > 0 || (this.eventId > 0 && this.random() < 0.16)) {
      if (this.heading !== 0) kind = this.heading > 0 ? 'right' : 'left'
      else kind = this.random() < 0.5 ? 'left' : 'right'
    } else {
      const pick = this.random()
      kind = pick < 0.34 ? 'bottom' : pick < 0.67 ? 'top' : 'center'
    }
    return { beat: this.beat + spacing, kind }
  }

  private get yaw() { return this.heading * Math.PI / 2 }

  private forward(distance: number) {
    this.x -= Math.round(Math.sin(this.yaw)) * distance
    this.z -= Math.round(Math.cos(this.yaw)) * distance
    this.cursorDistance += distance
  }

  private addSegment(kind: RenderSegment['kind'], length: number) {
    this.segments.push({
      id: this.segmentId++, start: this.cursorDistance, kind,
      x: this.x, z: this.z, yaw: this.yaw, length,
    })
  }

  private generate() {
    this.pending ??= this.nextEvent()
    const { beat, kind } = this.pending
    const seconds = beat * 60 / this.bpm
    let distance = this.pace?.distanceAt(seconds) ?? normalDistanceAt(seconds)
    if (this.pace) {
      // A boosted pilot can encounter geometry intended for a quiet passage while
      // the music is still fast. Leave room for an opposite-height reaction after a corner.
      const boostFactor = 1 + MAX_BOOST_SPEED_GAIN / SPEED
      const earliest = this.pace.timeAtDistance(this.lastDistance / boostFactor)
      const neutralArrival = this.pace.timeAtDistance(this.lastDistance)
      distance = Math.max(distance, this.pace.distanceAt(neutralArrival + MIN_REACTION_SECONDS))
      const upper = Math.max(distance, this.lastDistance + MIN_REACTION_SECONDS*SPEED)
      const maximum = this.pace.fastestBetween(earliest, this.pace.timeAtDistance(upper))
      distance = Math.max(distance, this.lastDistance + maximum * boostFactor * MIN_BOOSTED_APPROACH)
    }
    if (!Number.isFinite(distance)) throw new Error('Beatmap event exceeds the transport time range.')
    const approach = distance - HALF_CORNER - this.cursorDistance
    if (approach > 1e-7) {
      // Stream long authored rests without constructing their entire geometry.
      const length = approach / Math.ceil(approach / 24)
      this.addSegment('straight', length)
      this.forward(length)
      return
    }
    this.beat = beat
    this.lastDistance = distance
    this.pending = null
    const yaw = this.yaw
    this.addSegment(isTurn(kind) ? kind : 'straight', 2 * HALF_CORNER)
    this.forward(HALF_CORNER)
    const event: RouteEvent = { id: this.eventId++, kind, distance, x: this.x, z: this.z, yaw }
    this.events.push(event)
    if (isTurn(kind)) {
      this.heading += kind === 'left' ? 1 : -1
      this.barriersSinceTurn = 0
    } else {
      this.barriers.push({ ...event, kind })
      this.barriersSinceTurn++
    }
    this.forward(HALF_CORNER)
  }

  ensure(distance: number) {
    while (this.cursorDistance < distance + LOOK_AHEAD) this.generate()
    const oldest = distance - RETAIN_BEHIND
    while (this.segments.length && this.segments[0]!.start + this.segments[0]!.length < oldest) this.segments.shift()
    while (this.events.length && this.events[0]!.distance < oldest) this.events.shift()
    while (this.barriers.length && this.barriers[0]!.distance < oldest) this.barriers.shift()
  }

  sample(distance: number, out: { x: number; z: number; yaw: number; roll: number }) {
    const segment = this.segments.find(piece => distance <= piece.start + piece.length + 1e-8)
      ?? this.segments[this.segments.length - 1]!
    const offset = Math.max(0, Math.min(segment.length, distance - segment.start))
    const incoming = segment.kind === 'straight' ? offset : Math.min(offset, HALF_CORNER)
    out.yaw = segment.yaw
    out.roll = 0
    out.x = segment.x - Math.sin(out.yaw) * incoming
    out.z = segment.z - Math.cos(out.yaw) * incoming
    if (offset > incoming) {
      const exitYaw = segment.yaw + (segment.kind === 'left' ? Math.PI / 2 : -Math.PI / 2)
      out.x -= Math.sin(exitYaw) * (offset - incoming)
      out.z -= Math.cos(exitYaw) * (offset - incoming)
    }
    if (segment.kind !== 'straight') {
      // Orientation follows position on the turn even if a late frame skips its midpoint.
      const t = Math.min(1, Math.max(0, (offset - HALF_CORNER) / TURN_ANIMATION_DISTANCE + 0.5))
      const sign = segment.kind === 'left' ? 1 : -1
      out.yaw = segment.yaw + sign * t * t * (3 - 2 * t) * Math.PI / 2
      out.roll = -sign * Math.sin(t * Math.PI) * 0.065
    }
  }
}
