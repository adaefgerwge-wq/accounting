// 依存なしのメモリ内レートリミッタ（固定ウィンドウ方式）。
// 単一プロセス前提。プロセス再起動でリセットされるが、
// ブルートフォース対策としては十分な粒度。

export interface RateLimiterOptions {
  /** ウィンドウ長（ミリ秒） */
  windowMs: number
  /** ウィンドウあたりの許容回数 */
  max: number
  /** テスト用の時刻注入 */
  now?: () => number
}

export class RateLimiter {
  private hits = new Map<string, { count: number; windowStart: number }>()
  private readonly windowMs: number
  private readonly max: number
  private readonly now: () => number

  constructor(opts: RateLimiterOptions) {
    this.windowMs = opts.windowMs
    this.max = opts.max
    this.now = opts.now ?? Date.now
  }

  /** 1回分を記録し、許容内なら true を返す */
  consume(key: string): boolean {
    const t = this.now()
    const entry = this.hits.get(key)
    if (!entry || t - entry.windowStart >= this.windowMs) {
      this.hits.set(key, { count: 1, windowStart: t })
      this.sweep(t)
      return true
    }
    entry.count++
    return entry.count <= this.max
  }

  /** 成功時などにカウントを消す（ログイン成功でリセットする用途） */
  reset(key: string): void {
    this.hits.delete(key)
  }

  /** 期限切れエントリの掃除（呼び出しついでに間引く） */
  private sweep(t: number): void {
    if (this.hits.size < 1000) return
    for (const [k, v] of this.hits) {
      if (t - v.windowStart >= this.windowMs) this.hits.delete(k)
    }
  }
}
