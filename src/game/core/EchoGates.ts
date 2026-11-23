import { isTurn, type BarrierKind, type FlightState } from '../types'

export class EchoGates {
  lane?: BarrierKind
  private started = 0
  private lastGate = -1

  update(time:number, beat:number, flight:FlightState, bass:number): BarrierKind|undefined {
    if (this.lane) {
      const beats=(time-this.started)/beat
      if (beats>=2.25 || (beats>=1.75 && bass>.16)) this.lane=undefined
      return
    }
    const {next,passed}=flight
    if (!next || passed<2 || passed>7 || passed===this.lastGate || isTurn(next.kind)) return
    const until=next.distance/flight.speed
    if (until>2.35*beat || until<1.65*beat) return
    this.started=time
    this.lastGate=passed
    this.lane=next.kind
    return this.lane
  }
}
