/** Infer a nominal beat interval from repeated attacks. Nearby strong low-frequency
 * onsets have more influence than subdivisions; unmetered clips use a neutral tempo. */
export function estimateBpm(cues: Float32Array) {
  if (cues.length < 3*4) return 120
  const minBpm=55, maxBpm=210
  const votes = new Float64Array(maxBpm+1)
  const singleBeat = new Float64Array(maxBpm+1)
  const weight = (i:number)=>cues[i+1]*(.25+.75*cues[i+2])
  for (let i=0;i<cues.length;i+=4) {
    for (let j=i+4;j<cues.length;j+=4) {
      const interval=cues[j]-cues[i]
      if (interval>2.2) break
      if (interval<=0) continue
      for (let beats=1;beats<=4;beats++) {
        const bpm=60*beats/interval
        if (bpm<minBpm-2 || bpm>maxBpm+2) continue
        const strength=weight(i)*weight(j)/beats
        for (let b=Math.max(minBpm,Math.ceil(bpm-2));b<=Math.min(maxBpm,bpm+2);b++) {
          const support=strength*Math.max(0,1-Math.abs(bpm-b)/2)
          votes[b]+=support
          if (beats===1) singleBeat[b]+=support
        }
      }
    }
  }
  let best=120
  for (let bpm=minBpm;bpm<=maxBpm;bpm++) {
    if (votes[bpm]>votes[best]) best=bpm
  }
  // Alternating kick/snare accents can make every other beat win. Require actual
  // intermediate onsets before choosing the faster pulse over a slow groove.
  if (2*best<=maxBpm) {
    let faster=2*best
    for (let bpm=2*best-1;bpm<=Math.min(maxBpm,2*best+1);bpm++) {
      if (votes[bpm]>votes[faster]) faster=bpm
    }
    if (votes[faster]>.85*votes[best] && singleBeat[faster]>.42*singleBeat[best]) return faster
  }
  return best
}

/** Pick recorded attacks on the locally dominant pulse. The grid only selects
 * attacks: it never moves one or generates a flash during silence. */
export function selectPulseCues(cues: Float32Array, nominalBpm: number) {
  const selected: number[] = []
  let left = 0, right = 0, previousBpm = nominalBpm
  for (let start = 0; start <= cues[cues.length - 4]; start += 2) {
    while (left < cues.length && cues[left] < start - 3) left += 4
    while (right < cues.length && cues[right] < start + 5) right += 4
    let bestScore = 0, bestRate = 0, bestPhase = 0
    for (let bpm = Math.round(nominalBpm * .72); bpm <= nominalBpm * 1.42; bpm++) {
      const rate = bpm * 2 * Math.PI / 60
      let x = 0, y = 0, total = 0
      for (let i = left; i < right; i += 4) {
        const weight = cues[i+1] ** 2 * (.15 + .85 * cues[i+2])
        const angle = (cues[i] - start) * rate
        x += weight * Math.cos(angle)
        y += weight * Math.sin(angle)
        total += weight
      }
      const coherence = Math.hypot(x, y) / Math.max(1, total)
      const score = coherence / (1 + .3 * Math.abs(Math.log(bpm / previousBpm)))
      if (score > bestScore) {
        bestScore = score
        bestRate = rate
        bestPhase = Math.atan2(y, x)
      }
    }
    if (bestScore < .20) continue
    previousBpm = bestRate * 60 / (2 * Math.PI)
    for (let i = left; i < right; i += 4) {
      const time = cues[i]
      if (time < start || time >= start + 2) continue
      const cycles = ((time - start) * bestRate - bestPhase) / (2 * Math.PI)
      if (Math.abs(cycles - Math.round(cycles)) > .12 || cues[i+1] < .24) continue
      const last = selected.length - 4
      if (last >= 0 && time - selected[last] < .24) {
        if (selected[last+1] >= cues[i+1]) continue
        selected.length = last
      }
      selected.push(time, cues[i+1], cues[i+2], cues[i+3])
    }
  }
  return Float32Array.from(selected)
}
