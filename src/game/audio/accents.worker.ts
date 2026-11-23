import { detectAccents } from './BeatAccents'
import { selectPulseCues } from './PulseCues'
import { analyseSongPace } from './SongPace'

self.onmessage=({data}:MessageEvent<{pcm:Float32Array; rate:number; offset:number; bpm:number}>)=>{
  const attacks=detectAccents(data.pcm,data.rate)
  const pace=analyseSongPace(data.pcm,data.rate,attacks,data.offset)
  const cues=selectPulseCues(attacks,data.bpm)
  self.postMessage({cues,pace},{transfer:[cues.buffer,pace.buffer]})
}
