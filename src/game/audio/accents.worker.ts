import { detectAccents } from './BeatAccents'
import { analyseSongPace } from './SongPace'

self.onmessage=({data}:MessageEvent<{pcm:Float32Array; rate:number; offset:number}>)=>{
  const cues=detectAccents(data.pcm,data.rate)
  const pace=analyseSongPace(data.pcm,data.rate,cues,data.offset)
  self.postMessage({cues,pace},{transfer:[cues.buffer,pace.buffer]})
}
