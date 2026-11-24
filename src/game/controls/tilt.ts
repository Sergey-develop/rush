import { ref } from 'vue'
import { MAX_HEIGHT } from '../types'

export const tiltState = ref<'off'|'waiting'|'on'|'unavailable'>('off')
let neutral = 0
let orientation = NaN
let pitch = 0
let attempt = 0
let timeout = 0

function sample(event: DeviceOrientationEvent) {
  if (event.beta == null || event.gamma == null) return
  const rad = Math.PI / 180
  const beta = event.beta * rad, gamma = event.gamma * rad
  const angle = screen.orientation?.angle ?? (window as Window & {orientation?:number}).orientation ?? 0
  const along = Math.sin(beta)*Math.cos(angle*rad) - Math.cos(beta)*Math.sin(gamma)*Math.sin(angle*rad)
  pitch = Math.atan2(along, Math.cos(beta)*Math.cos(gamma)) / rad
  if (!Number.isFinite(pitch)) return
  if (orientation !== angle || tiltState.value === 'waiting') neutral = pitch
  orientation = angle
  clearTimeout(timeout)
  tiltState.value = 'on'
}

export function stopTilt() {
  attempt++
  clearTimeout(timeout)
  window.removeEventListener('deviceorientation',sample)
  tiltState.value = 'off'
  orientation = NaN
}

export function canStartTiltWithoutGesture() {
  const sensor = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & {requestPermission?: unknown}
  return !!sensor && !sensor.requestPermission
}

export async function enableTilt() {
  if (tiltState.value === 'on' || tiltState.value === 'waiting') return
  stopTilt()
  const token = attempt
  tiltState.value = 'waiting'
  try {
    const sensor = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & {requestPermission?:()=>Promise<string>}
    if (!sensor || (sensor.requestPermission && await sensor.requestPermission() !== 'granted')) throw new Error()
    if (token !== attempt) return
    window.addEventListener('deviceorientation',sample)
    // Some phones only deliver their first reading after they move or the tab regains focus.
    timeout = window.setTimeout(()=>{
      if (token === attempt && tiltState.value === 'waiting') tiltState.value='unavailable'
    },3500)
  } catch {
    if (token === attempt) tiltState.value='unavailable'
  }
}

export function calibrateTilt() {
  if (tiltState.value === 'on') neutral = pitch
}

export function tiltHeight(sensitivity:number,invert:boolean) {
  if (tiltState.value !== 'on') return undefined
  const degrees = ((pitch-neutral+540)%360)-180
  const delta = Math.sign(degrees)*Math.max(0, Math.abs(degrees)-1.5)
  return Math.max(-1,Math.min(1,delta*sensitivity/22))*MAX_HEIGHT*(invert?-1:1)
}
