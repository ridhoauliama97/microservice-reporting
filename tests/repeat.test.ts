import { describe, expect, test } from 'bun:test'
import { repeatEvery } from '../src/lib/repeat'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('repeatEvery', () => {
  test('runs the task on every interval, not just once', async () => {
    let runs = 0
    const stop = repeatEvery(20, () => {
      runs += 1
    })
    await sleep(95)
    stop()
    // 95ms at a 20ms interval: three or four runs. The point is that it repeats.
    expect(runs).toBeGreaterThanOrEqual(3)
  })

  test('stop actually stops it', async () => {
    let runs = 0
    const stop = repeatEvery(15, () => {
      runs += 1
    })
    await sleep(50)
    stop()
    const afterStop = runs
    await sleep(60)
    expect(runs).toBe(afterStop)
  })

  test('an async task that rejects does not stop the schedule', async () => {
    let runs = 0
    const stop = repeatEvery(15, async () => {
      runs += 1
      throw new Error('boom')
    })
    await sleep(60)
    stop()
    expect(runs).toBeGreaterThanOrEqual(2)
  })
})
