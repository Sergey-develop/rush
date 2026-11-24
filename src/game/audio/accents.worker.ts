import { analyseRecording } from './BeatAccents'
import { estimateBpm, selectPulseCues } from './PulseCues'
import { analyseSongPace } from './SongPace'

self.onmessage=({data}:MessageEvent<{pcm:Float32Array; rate:number; offset:number; bpm?:number}>)=>{
  const {attacks,voices,step}=analyseRecording(data.pcm,data.rate,data.offset)
  const pace=analyseSongPace(data.pcm,data.rate,attacks,data.offset)
  const bpm=data.bpm ?? estimateBpm(attacks)
  const cues=selectPulseCues(attacks,bpm)
  self.postMessage({bpm,cues,pace,voices,step},{transfer:[cues.buffer,pace.buffer,voices.buffer]})
}
