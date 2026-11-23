export const START_SPEED = 12
export const SPEED = 22
export const MAX_BOOST_SPEED_GAIN = 8
export const ACCELERATION_TIME = 12
export const GAP_WIDTH = 4.6
export const FLOOR_Y = -3
export const CEILING_Y = 3
export const PLAYER_RADIUS = 0.22
// The lowest suspended ceiling lamp reaches y=2.59 along the flight path.
export const MAX_HEIGHT = 2.59 - PLAYER_RADIUS - 0.05
export const DEFAULT_BPM = 172
export const TURN_WARNING_DISTANCE = 1.55 * SPEED

export type BarrierKind = 'top' | 'center' | 'bottom'
export type TurnKind = 'left' | 'right'
export type ObstacleKind = BarrierKind | TurnKind

export function isTurn(kind: ObstacleKind): kind is TurnKind {
  return kind === 'left' || kind === 'right'
}

export function gapBounds(kind: BarrierKind): { bottom: number; top: number } {
  switch (kind) {
    case 'top': return { bottom: 0.95, top: CEILING_Y }
    case 'bottom': return { bottom: FLOOR_Y, top: -0.95 }
    case 'center': return { bottom: -1.275, top: 0.675 }
  }
}

export interface RenderSegment {
  id: number
  kind: 'straight' | TurnKind
  x: number
  z: number
  yaw: number
  length: number
}

export interface RouteEvent {
  id: number
  kind: ObstacleKind
  distance: number
  x: number
  z: number
  yaw: number
}

export interface RenderBarrier extends RouteEvent {
  kind: BarrierKind
}

// The opening stretch introduces a second line after the first few obstacles.
export function bonusGap(event: RouteEvent) {
  if (event.id < 5 || event.distance > 610 || isTurn(event.kind)) return null
  return bonusBounds(event.kind)
}
export function bonusBounds(kind:BarrierKind) {
  const center = kind === 'top' ? -1.85 : 1.85
  return {bottom:center-.51, top:center+.51}
}

export interface BeatEvent {
  beat: number
  kind: ObstacleKind
}

export interface FlightOptions {
  bpm?: number
  seed?: number
  beatmap?: readonly BeatEvent[]
}

export interface FlightInput {
  vertical: number
  targetY?: number
  boost?: boolean
}

export interface FlightState {
  charge: number
  armed: boolean
  grazes: number
  breaks: number
  x: number
  y: number
  z: number
  yaw: number
  roll: number
  distance: number
  speed: number
  boosting: boolean
  boostLevel: number
  score: number
  combo: number
  passed: number
  dead: boolean
  reason: 'barrier' | null
  next: { kind: ObstacleKind; distance: number } | null
}
