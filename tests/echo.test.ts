import assert from 'node:assert/strict'
import test from 'node:test'
import { Flight } from '../src/game/core/Flight'
import { EchoGates } from '../src/game/core/EchoGates'

test('signal follows the approach lane and light returns on bass or times out in silence',()=>{
  for(const kind of ['top','center','bottom'] as const) {
    const state=new Flight().state
    state.passed=2
    state.speed=16
    state.next={kind,distance:18}
    const echo=new EchoGates()
    assert.equal(echo.update(4,.5,state,0),kind)
    echo.update(4.5,.5,state,1)
    assert.equal(echo.lane,kind)
    echo.update(kind==='top'?4.95:5.14,.5,state,kind==='top'?1:0)
    assert.equal(echo.lane,undefined)
    assert.equal(echo.update(5.2,.5,state,0),undefined)
  }
})
