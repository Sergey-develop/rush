export type Phase = 'menu' | 'countdown' | 'playing' | 'paused' | 'impact' | 'over'
export interface GameFrame {
  phase: Phase
  countdown: number
  score: number
  combo: number
  distance: number
  bpm: number
  pulse: number
  hint: 'top' | 'center' | 'bottom' | 'left' | 'right' | null
  reason: 'barrier' | 'finished' | null
  altitude: number
  speed?: number
  shield?: boolean
  boostSeconds?: number
  sprinting?: boolean
  boostLevel?: number
  track?: string
}
export type DesktopControl = 'keyboard' | 'mouse'
export interface GameSettings {
  desktopControl?: DesktopControl
  volume: number
  muted: boolean
  quality: 'high' | 'low'
  sensitivity: number
  invert: boolean
}
