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
  boostLevel?: number
  track?: string
}
export interface GameSettings {
  volume: number
  muted: boolean
  quality: 'high' | 'low'
  sensitivity: number
  invert: boolean
}
