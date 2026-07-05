import { describe, it, expect } from 'vitest'
import { RateLimiter } from '../rate-limit.js'

describe('RateLimiter（固定ウィンドウ）', () => {
  it('上限までは許可し、超えたら拒否する', () => {
    let now = 0
    const limiter = new RateLimiter({ windowMs: 1000, max: 3, now: () => now })
    expect(limiter.consume('a')).toBe(true)
    expect(limiter.consume('a')).toBe(true)
    expect(limiter.consume('a')).toBe(true)
    expect(limiter.consume('a')).toBe(false)
  })

  it('ウィンドウが過ぎたらリセットされる', () => {
    let now = 0
    const limiter = new RateLimiter({ windowMs: 1000, max: 1, now: () => now })
    expect(limiter.consume('a')).toBe(true)
    expect(limiter.consume('a')).toBe(false)
    now = 1000
    expect(limiter.consume('a')).toBe(true)
  })

  it('キーごとに独立してカウントする', () => {
    const limiter = new RateLimiter({ windowMs: 1000, max: 1, now: () => 0 })
    expect(limiter.consume('a')).toBe(true)
    expect(limiter.consume('b')).toBe(true)
    expect(limiter.consume('a')).toBe(false)
  })

  it('reset でカウントが消える（ログイン成功時用）', () => {
    const limiter = new RateLimiter({ windowMs: 1000, max: 1, now: () => 0 })
    limiter.consume('a')
    expect(limiter.consume('a')).toBe(false)
    limiter.reset('a')
    expect(limiter.consume('a')).toBe(true)
  })
})
