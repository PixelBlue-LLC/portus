/**
 * 观望列表：用户记下「哪天、什么价格开始观望」和「自己设的目标价」。
 * 这里只算事实：从观望起点到现在涨跌了多少、离用户设的目标价还差多少、是不是已经到了。
 * 不判断该不该买卖。
 */

export interface WatchItem {
  symbol: string;
  /** 开始观望的时间（ISO 或 YYYY-MM-DD） */
  addedAt: string;
  /** 开始观望时的价格 */
  addedPrice?: number;
  /** 用户自己设的目标价 */
  target?: number;
  note?: string;
  /** 第一次到达目标价的时间（ISO），由页面在刷新行情时记下 */
  reachedAt?: string;
}

export interface WatchStatus {
  /** 从观望起点到现在 % */
  sincePct: number | null;
  /** 目标价相对现价还差多少 %：正数 = 要涨这么多才到，负数 = 要跌这么多才到 */
  toTargetPct: number | null;
  /** 目标价在起点价的上方（等涨）还是下方（等跌） */
  direction: 'up' | 'down' | null;
  /** 现价已经到了或越过目标价 */
  reached: boolean;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

export function watchStatus(w: WatchItem, price: number | null | undefined): WatchStatus {
  const p = price != null && price > 0 ? price : null;
  const start = w.addedPrice && w.addedPrice > 0 ? w.addedPrice : null;
  const target = w.target && w.target > 0 ? w.target : null;
  // 没有起点价时，按目标价在现价的哪一边判断方向
  const ref = start ?? p;
  const direction = target != null && ref != null ? (target >= ref ? 'up' : 'down') : null;
  return {
    sincePct: p != null && start != null ? r2(((p - start) / start) * 100) : null,
    toTargetPct: p != null && target != null ? r2(((target - p) / p) * 100) : null,
    direction,
    reached: p != null && target != null && direction != null && (direction === 'up' ? p >= target : p <= target),
  };
}
