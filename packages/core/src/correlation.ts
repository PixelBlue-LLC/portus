/**
 * 相关性：用日收益率算两只标的走势有多同步。
 * 1 = 完全同涨同跌，0 = 没关系，-1 = 一个涨另一个跌。
 * 只描述过去一段时间的统计关系，不代表以后。
 */

export interface DailyBar {
  /** YYYY-MM-DD */
  date: string;
  close: number;
}

/** 按日期对齐两只标的，算对数收益率，只保留两边都有数据的日子 */
export function alignedReturns(a: DailyBar[], b: DailyBar[]): [number[], number[]] {
  const mb = new Map(b.map((x) => [x.date, x.close]));
  const days = a.filter((x) => mb.has(x.date) && x.close > 0 && mb.get(x.date)! > 0).sort((x, y) => x.date.localeCompare(y.date));
  const ra: number[] = [];
  const rb: number[] = [];
  for (let i = 1; i < days.length; i++) {
    const p = days[i - 1]!;
    const c = days[i]!;
    ra.push(Math.log(c.close / p.close));
    rb.push(Math.log(mb.get(c.date)! / mb.get(p.date)!));
  }
  return [ra, rb];
}

/** 皮尔逊相关系数；样本少于 3 或方差为 0 时返回 null */
export function pearson(x: number[], y: number[]): number | null {
  const n = Math.min(x.length, y.length);
  if (n < 3) return null;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += x[i]!;
    sy += y[i]!;
  }
  const mx = sx / n;
  const my = sy / n;
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i]! - mx;
    const dy = y[i]! - my;
    cov += dx * dy;
    vx += dx * dx;
    vy += dy * dy;
  }
  if (vx === 0 || vy === 0) return null;
  return Math.max(-1, Math.min(1, cov / Math.sqrt(vx * vy)));
}

export interface CorrelationMatrix {
  symbols: string[];
  /** values[i][j]，保留两位小数；数据不够时为 null */
  values: Array<Array<number | null>>;
  /** 每对用了多少个交易日 */
  days: number[][];
  /** 数据不够、没算出来的代码 */
  missing: string[];
}

/** 至少要这么多个共同交易日才给数字，太少不可靠 */
export const MIN_OVERLAP_DAYS = 60;

/** 只看最近 lookback 个交易日（默认约半年） */
export function correlationMatrix(series: Record<string, DailyBar[]>, symbols: string[], lookback = 126, minDays = MIN_OVERLAP_DAYS): CorrelationMatrix {
  const trimmed: Record<string, DailyBar[]> = {};
  const missing: string[] = [];
  for (const s of symbols) {
    const bars = [...(series[s] ?? [])].sort((a, b) => a.date.localeCompare(b.date)).slice(-(lookback + 1));
    if (bars.length < minDays + 1) missing.push(s);
    trimmed[s] = bars;
  }
  const values = symbols.map(() => symbols.map((): number | null => null));
  const days = symbols.map(() => symbols.map(() => 0));
  symbols.forEach((a, i) => {
    symbols.forEach((b, j) => {
      if (j < i) return;
      if (missing.includes(a) || missing.includes(b)) return;
      const [ra, rb] = alignedReturns(trimmed[a]!, trimmed[b]!);
      days[i]![j] = days[j]![i] = ra.length;
      if (ra.length < minDays) return;
      const c = i === j ? 1 : pearson(ra, rb);
      const v = c == null ? null : Math.round(c * 100) / 100;
      values[i]![j] = values[j]![i] = v;
    });
  });
  return { symbols, values, days, missing };
}

export interface CorrelatedPair {
  a: string;
  b: string;
  value: number;
}

/** 相关性最高的几对（不同代码之间），用来写一句话总结 */
export function topPairs(m: CorrelationMatrix, limit = 3): CorrelatedPair[] {
  const out: CorrelatedPair[] = [];
  m.symbols.forEach((a, i) => {
    m.symbols.forEach((b, j) => {
      const v = m.values[i]![j];
      if (j > i && v != null) out.push({ a, b, value: v });
    });
  });
  return out.sort((x, y) => y.value - x.value).slice(0, limit);
}

/** 候选标的和现有持仓的平均相关性（按持仓市值加权）；用来回答「新加的这只和我已有的东西像不像」 */
export function weightedCorrelation(m: CorrelationMatrix, candidate: string, weights: Record<string, number>): number | null {
  const i = m.symbols.indexOf(candidate);
  if (i < 0) return null;
  let sum = 0;
  let wsum = 0;
  m.symbols.forEach((s, j) => {
    const w = weights[s] ?? 0;
    const v = m.values[i]![j];
    if (s === candidate || w <= 0 || v == null) return;
    sum += v * w;
    wsum += w;
  });
  return wsum ? Math.round((sum / wsum) * 100) / 100 : null;
}
