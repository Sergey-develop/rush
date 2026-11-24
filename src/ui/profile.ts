import type { DesktopControl, GameSettings } from '../game/contracts'

const settingsKey = 'corridor-rush/settings/1'
const rankingKey = 'corridor-rush/runs/1'

export interface PlayerOptions extends GameSettings { desktopControl: DesktopControl; pilot: string; tiltEnabled: boolean; hideBriefing: boolean }
export interface Run {
  pilot: string
  score: number
  distance: number
  time: number
}

const defaults: PlayerOptions = {
  desktopControl: 'keyboard', tiltEnabled: true, hideBriefing: false,
  pilot: 'Пилот', volume: 0.65, muted: false, sensitivity: 1, invert: false, quality: 'high',
}

function read(key: string): unknown {
  try { return JSON.parse(localStorage.getItem(key) || 'null') } catch { return null }
}

function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* In private mode the session still works. */ }
}

export function loadSettings(): PlayerOptions {
  const options = read(settingsKey) as Partial<PlayerOptions> | null
  if (!options || typeof options !== 'object') return { ...defaults }
  const number = (value: unknown, min: number, max: number, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback
  return {
    pilot: typeof options.pilot === 'string' ? options.pilot.trim().slice(0, 18) || defaults.pilot : defaults.pilot,
    volume: number(options.volume, 0, 1, defaults.volume),
    sensitivity: number(options.sensitivity, 0.5, 1.5, defaults.sensitivity),
    quality: options.quality === 'low' ? 'low' : 'high',
    invert: options.invert === true,
    muted: options.muted === true,
    desktopControl: options.desktopControl === 'mouse' ? 'mouse' : 'keyboard',
    tiltEnabled: options.tiltEnabled !== false,
    hideBriefing: options.hideBriefing === true,
  }
}

export function storeSettings(options: PlayerOptions) { write(settingsKey, options) }

export function loadRuns(): Run[] {
  const stored = read(rankingKey)
  return Array.isArray(stored) ? stored.filter((run): run is Run => Boolean(run) &&
    typeof run.pilot === 'string' && Number.isFinite(run.score) && Number.isFinite(run.distance) &&
    Number.isFinite(run.time)) : []
}

export function saveRun(runs: Run[], run: Run): Run[] {
  const candidates = [run, ...runs]
  const retained = [...new Set([...rank(candidates, false), ...rank(candidates, true)])]
  write(rankingKey, retained)
  return retained
}

export function rank(runs: Run[], week: boolean): Run[] {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - (start.getDay() + 6) % 7)
  const best = new Map<string, Run>()
  for (const run of runs) {
    if (week && run.time < start.getTime()) continue
    const key = run.pilot.toLocaleLowerCase('ru')
    const previous = best.get(key)
    if (!previous || run.score > previous.score || (run.score === previous.score && run.time < previous.time)) {
      best.set(key, run)
    }
  }
  return [...best.values()].sort((a,b) => b.score - a.score || a.time - b.time)
}

export const demos: Run[] = [
  { pilot: 'Пилот', score: 124560, distance: 0, time: 0 },
  { pilot: 'Неон', score: 118430, distance: 0, time: 0 },
  { pilot: 'Каспер', score: 112900, distance: 0, time: 0 },
]
const format = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })
export const formatNumber = (value: number) => format.format(Math.round(value))


