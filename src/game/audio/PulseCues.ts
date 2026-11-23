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
