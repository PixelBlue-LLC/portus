/**
 * 分批计划和挂单记录：用户自己写下「打算分几批、每批什么时候、挂了哪些限价单」，
 * 成交后填上成交价，和计划对照。全部是用户录入的数据，这里只做汇总，不判断该不该买卖。
 */

export type TrancheStatus = 'planned' | 'placed' | 'filled' | 'cancelled';

export interface Tranche {
  id: string;
  /** 计划日期 YYYY-MM-DD，可空 */
  date?: string;
  /** 计划金额（美元）或股数，二选一 */
  amount?: number;
  qty?: number;
  /** 限价；空 = 市价 */
  limit?: number;
  /** day = 当日有效，gtc = 一直有效直到撤单 */
  tif?: 'day' | 'gtc';
  status: TrancheStatus;
  fillPrice?: number;
  fillQty?: number;
  /** 成交日期 */
  filledOn?: string;
  note?: string;
}

export interface Plan {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  /** 在哪个券商账户执行 */
  account?: string;
  /** 用户写的理由和计划，原样保存 */
  note?: string;
  createdAt: string;
  /** 整个计划结束（全部完成或放弃）后归档 */
  archived?: boolean;
  tranches: Tranche[];
}

export interface OpenOrder {
  id: string;
  limit: number;
  /** 现价离限价还差多少 %；买单为负表示现价已经低于限价 */
  distancePct: number | null;
  tif?: 'day' | 'gtc';
}

export interface PlanSummary {
  /** 全部批次（不含已撤销）的计划金额；按股数计划的批次用限价或现价折算 */
  plannedAmount: number;
  filledAmount: number;
  filledQty: number;
  /** 已成交的平均价 */
  avgFill: number | null;
  /** 已成交金额 / 计划金额 % */
  progressPct: number;
  counts: Record<TrancheStatus, number>;
  openOrders: OpenOrder[];
  /** 下一个还没执行的批次（按日期） */
  next?: Tranche;
  /** 已成交平均价相对现价的 %（买入为浮盈亏，卖出为卖出后的涨跌） */
  vsPricePct: number | null;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** 一批的金额：有成交用成交，否则用计划金额；按股数计划的用限价、没有限价用现价 */
function trancheAmount(t: Tranche, price: number | null): number {
  if (t.status === 'filled' && t.fillPrice && t.fillQty) return t.fillPrice * t.fillQty;
  if (t.amount) return t.amount;
  const px = t.limit ?? price;
  return t.qty && px ? t.qty * px : 0;
}

export function planSummary(plan: Plan, price: number | null): PlanSummary {
  const counts: Record<TrancheStatus, number> = { planned: 0, placed: 0, filled: 0, cancelled: 0 };
  let planned = 0;
  let filledAmount = 0;
  let filledQty = 0;
  const openOrders: OpenOrder[] = [];
  for (const t of plan.tranches) {
    counts[t.status] += 1;
    if (t.status === 'cancelled') continue;
    planned += trancheAmount(t, price);
    if (t.status === 'filled' && t.fillPrice && t.fillQty) {
      filledAmount += t.fillPrice * t.fillQty;
      filledQty += t.fillQty;
    }
    if (t.status === 'placed' && t.limit) {
      openOrders.push({ id: t.id, limit: t.limit, tif: t.tif, distancePct: price ? r2(((price - t.limit) / t.limit) * 100) : null });
    }
  }
  const pending = plan.tranches
    .filter((t) => t.status === 'planned' || t.status === 'placed')
    .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));
  const avgFill = filledQty ? filledAmount / filledQty : null;
  const vs = avgFill && price ? ((price - avgFill) / avgFill) * 100 : null;
  return {
    plannedAmount: r2(planned),
    filledAmount: r2(filledAmount),
    filledQty: r2(filledQty),
    avgFill: avgFill != null ? r2(avgFill) : null,
    progressPct: planned ? Math.round((filledAmount / planned) * 1000) / 10 : 0,
    counts,
    openOrders,
    next: pending[0],
    vsPricePct: vs != null ? r2(vs) : null,
  };
}

/** 日期已过、还没成交也没撤的批次（提醒用户去核对） */
export function overdueTranches(plan: Plan, today: string): Tranche[] {
  return plan.tranches.filter((t) => t.status === 'planned' && t.date != null && t.date < today);
}

/** 当日有效的挂单，日期已过还标着「已挂单」，多半已经失效 */
export function staleDayOrders(plan: Plan, today: string): Tranche[] {
  return plan.tranches.filter((t) => t.status === 'placed' && t.tif === 'day' && t.date != null && t.date < today);
}
