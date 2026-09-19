import { test } from 'vitest'
import { projeterSegments } from '../src/renderer/import/projection'
import { corpusCharge } from '../src/shared/__corpusCharge'
test('bench', () => {
  const tailles: Array<[number, number]> = [[1000, 50], [2000, 100], [4000, 200], [8000, 400]]
  for (const [blocs, anns] of tailles) {
    const e = corpusCharge(blocs, anns)
    const t0 = performance.now()
    const segs = projeterSegments(e)
    const t1 = performance.now()
    const nbFrags = segs.reduce((n, s) => n + s.fragments.length, 0)
    console.log(`RESULT blocs=${blocs} anns=${anns} segments=${segs.length} fragments=${nbFrags} ms=${(t1 - t0).toFixed(0)}`)
  }
}, 120000)
