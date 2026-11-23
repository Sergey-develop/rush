import { createApp } from 'vue'
import { Flight } from '../src/game/core/Flight'
import { World } from '../src/game/scene/World'
import { Music } from '../src/game/audio/Music'
import { normalTimeAtDistance } from '../src/game/core/Track'
import GameHud from '../src/components/GameHud.vue'
import '../src/styles/interface.scss'
import '../src/styles/flight-hud.scss'

// Offline, repeatable visual fixture using the production generator, camera, renderer and HUD.
const track = new Music()
const flight = new Flight({bpm:track.bpm,beatmap:track.events,seed:0x43525553})
const seconds = normalTimeAtDistance(Math.max(0,flight.state.next!.distance-9.8))
flight.advance(seconds,{vertical:0})
const beat=seconds*track.bpm/60
const pulse=Math.exp(-6.4*(beat%1))*(Math.floor(beat)%4===0?1:.69)
const canvas=document.querySelector('canvas')!
const world=new World(canvas)
const s=flight.state
createApp(GameHud,{frame:{
  phase:'playing',score:s.score,combo:s.combo,altitude:s.y,distance:s.distance,
  speed:s.speed,boostLevel:s.boostLevel,track:track.title,
  countdown:0,reason:null,hint:null,bpm:track.bpm,pulse,
}}).mount('#hud')
const draw=()=>{world.render(flight,seconds,pulse);document.body.dataset.rendered='true'}
new ResizeObserver(()=>requestAnimationFrame(draw)).observe(canvas)
requestAnimationFrame(draw)
