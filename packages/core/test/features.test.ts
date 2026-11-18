// 阶段二功能：规则提醒、事件日历、ETF 穿透、相关性、分批计划、期权链导入。
// 只用虚构持仓和固定日期。
import { describe, expect, it } from 'vitest';
import {
  alignedReturns,
  alertSymbols,
  buildCalendar,
  buildPortfolio,
  correlationMatrix,
  describeAlert,
  ETF_HOLDINGS,
  evaluateAlerts,
  eventsToIcs,
  lookThrough,
  MACRO_CALENDAR,
  overdueTranches,
  parseEtfTop,
  parseExpiry,
  parseOcc,
  parseOptionChain,
  pearson,
  planSummary,
  staleDayOrders,
  topPairs,
  weightedCorrelation,
  analyzeChain,
  type AlertRule,
  type DailyBar,
  type Holding,
  type Plan,
  type Quote,
} from '../src';

const h = (symbol: string, qty: number, costBasis: number, manualPrice?: number): Holding => ({ symbol, qty, costBasis, manualPrice });
const q = (symbol: string, price: number, changePct: number | null = 0): Quote => ({ symbol, price, changePct, asOf: '2026-11-17T21:00:00Z' });

describe('规则提醒', () => {
  const holdings = [h('NVDA', 10, 120), h('AAPL', 5, 200), h('XOM', 20, 100)];
  const quotes = { NVDA: q('NVDA', 148.2, -6.3), AAPL: q('AAPL', 210, 0.4), XOM: q('XOM', 80, -1), TSLA: q('TSLA', 300, 2) };
  const view = buildPortfolio(holdings, quotes, 500, { NVDA: 'Semiconductors', AAPL: 'Technology', XOM: 'Energy' });

  it('价格跌破、涨过', () => {
    const rules: AlertRule[] = [
      { id: 'a', type: 'price_below', symbol: 'NVDA', value: 150 },
      { id: 'b', type: 'price_above', symbol: 'AAPL', value: 250 },
      { id: 'c', type: 'price_above', symbol: 'TSLA', value: 290 },
    ];
    const hits = evaluateAlerts(rules, view, quotes, 'zh');
    expect(hits.map((x) => x.id)).toEqual(['a', 'c']);
    expect(hits[0]!.text).toBe('NVDA 现价 $148.20，已跌破你设的 $150.00');
    expect(evaluateAlerts(rules, view, quotes, 'en')[1]!.text).toBe('TSLA is at $300.00, above your $290.00 level');
  });

  it('没有行情的代码不触发', () => {
    expect(evaluateAlerts([{ id: 'x', type: 'price_below', symbol: 'ZZZZ', value: 1e9 }], view, quotes)).toEqual([]);
  });

  it('任意持仓单日大涨大跌、相对成本亏损', () => {
    const hits = evaluateAlerts(
      [
        { id: 'm', type: 'day_move', value: 5 },
        { id: 'l', type: 'loss_from_cost', value: 15 },
      ],
      view,
      quotes,
    );
    expect(hits.map((x) => `${x.id}:${x.subject}`)).toEqual(['m:NVDA', 'l:XOM']);
    expect(hits[1]!.actual).toBe(-20);
  });

  it('单只占比、行业占比', () => {
    const total = view.totalValue;
    expect(total).toBe(10 * 148.2 + 5 * 210 + 20 * 80 + 500);
    const hits = evaluateAlerts(
      [
        { id: 'w', type: 'weight_above', symbol: 'NVDA', value: 25 },
        { id: 's', type: 'sector_above', value: 30 },
      ],
      view,
      quotes,
    );
    expect(hits.find((x) => x.id === 'w')!.actual).toBeCloseTo((1482 / total) * 100, 1);
    expect(hits.filter((x) => x.id === 's').map((x) => x.subject)).toEqual(['能源', '半导体']);
  });

  it('规则描述和要额外拉行情的代码', () => {
    expect(describeAlert({ id: '1', type: 'sector_above', sector: '能源', value: 40 }, 'en')).toBe('Energy is more than 40% of the portfolio');
    expect(describeAlert({ id: '1', type: 'day_move', value: 5 }, 'zh')).toBe('任意持仓 单日涨跌超过 5%');
    expect(alertSymbols([{ id: '1', type: 'price_below', symbol: 'tsla', value: 1 }, { id: '2', type: 'day_move', value: 3 }])).toEqual(['TSLA']);
  });
});

describe('事件日历', () => {
  it('合并财报和宏观日程，按日期和时间排序', () => {
    const ev = buildCalendar({ earnings: { NVDA: '2026-11-19', AAPL: '2027-01-29' }, earningsHour: { NVDA: 'amc' }, from: '2026-11-17', days: 30, lang: 'zh' });
    expect(ev.map((e) => `${e.date} ${e.title}`)).toEqual([
      '2026-11-19 NVDA 财报（盘后）',
      '2026-11-26 感恩节休市',
      '2026-11-27 感恩节次日，13:00 提前收盘',
      '2026-12-04 非农就业报告',
      '2026-12-09 美联储议息决议',
      '2026-12-10 CPI 通胀数据',
    ]);
  });

  it('可以只看某几类，英文标题', () => {
    const ev = buildCalendar({ earnings: {}, from: '2027-10-01', days: 40, kinds: ['fomc'], lang: 'en' });
    expect(ev).toEqual([{ date: '2027-10-27', kind: 'fomc', time: undefined, title: 'Fed strategy meeting (no rate decision)' }]);
  });

  it('宏观表按日期排得进去、没有重复', () => {
    const keys = MACRO_CALENDAR.map((r) => `${r.date}-${r.kind}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(MACRO_CALENDAR.filter((r) => r.date.startsWith('2027') && r.kind === 'closed')).toHaveLength(10);
    expect(MACRO_CALENDAR.filter((r) => r.date.startsWith('2027') && r.kind === 'cpi')).toHaveLength(12);
  });

  it('导出 .ics：定时事件带美东时区，全天事件用日期', () => {
    const ev = buildCalendar({ earnings: { NVDA: '2026-11-19' }, from: '2026-11-17', days: 24, kinds: ['earnings', 'cpi', 'closed'], lang: 'en' });
    const ics = eventsToIcs(ev, '20261117T120000Z');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261119\r\nDTEND;VALUE=DATE:20261120');
    expect(ics).toContain('DTSTART;TZID=America/New_York:20261210T083000');
    expect(ics).toContain('SUMMARY:Thanksgiving\\, market closed');
    expect(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(3);
  });

  it('长中文标题按字节折行', () => {
    const ics = eventsToIcs([{ date: '2027-06-18', kind: 'closed', title: '六月节（补休）休市'.repeat(4) }], '20261117T120000Z');
    const lines = ics.split('\r\n');
    expect(lines.every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    expect(lines.some((l) => l.startsWith(' '))).toBe(true);
  });
});

describe('ETF 穿透', () => {
  it('直接持有和通过 ETF 间接持有合在一起，GOOG 并入 GOOGL', () => {
    const positions = [
      { symbol: 'NVDA', marketValue: 5000 },
      { symbol: 'QQQ', marketValue: 10000 },
      { symbol: 'SMH', marketValue: 2000 },
    ];
    const r = lookThrough(positions, 20000);
    const nvda = r.rows.find((x) => x.symbol === 'NVDA')!;
    expect(nvda.direct).toBe(5000);
    expect(nvda.viaEtf).toBeCloseTo(10000 * 0.0809 + 2000 * 0.1725, 2);
    expect(nvda.sources).toEqual({ QQQ: 809, SMH: 345 });
    expect(nvda.pct).toBe(Math.round(((5000 + 1154) / 20000) * 1000) / 10);
    const googl = r.rows.find((x) => x.symbol === 'GOOGL')!;
    expect(googl.viaEtf).toBeCloseTo(10000 * (0.0299 + 0.0279), 2);
    expect(r.rows.some((x) => x.symbol === 'GOOG')).toBe(false);
    expect(r.rows[0]!.symbol).toBe('NVDA');
    const covered = (e: string) => ETF_HOLDINGS[e]!.top.reduce((s, [, w]) => s + w, 0);
    expect(covered('SMH')).toBeCloseTo(68.97, 2);
    expect(r.otherInEtfs).toBeCloseTo(10000 * (1 - covered('QQQ') / 100) + 2000 * (1 - covered('SMH') / 100), 1);
  });

  it('用户自己填的成分表优先；没有成分表的 ETF 单独列出', () => {
    const r = lookThrough(
      [
        { symbol: 'VGT', marketValue: 1000 },
        { symbol: 'ABCD', marketValue: 1000 },
      ],
      2000,
      { VGT: parseEtfTop('NVDA 18.5%\nAAPL, 15\nbad line\nMSFT\t12.1') },
      (s) => s === 'ABCD',
    );
    expect(r.rows.find((x) => x.symbol === 'NVDA')!.viaEtf).toBe(185);
    expect(r.etfs).toEqual([{ symbol: 'VGT', value: 1000, asOf: '', custom: true, coveredPct: 45.6 }]);
    expect(r.unknownEtfs).toEqual(['ABCD']);
  });
});

describe('相关性', () => {
  const days = (n: number) => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));
  // 用确定性的伪随机序列，不用 Math.random
  const series = (seed: number, n: number, link?: number[]): number[] => {
    let x = seed;
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      x = (x * 9301 + 49297) % 233280;
      const noise = x / 233280 - 0.5;
      out.push(link ? link[i]! * 0.9 + noise * 0.1 : noise);
    }
    return out;
  };
  const toBars = (rets: number[], start = 100): DailyBar[] => {
    let p = start;
    const ds = days(rets.length + 1);
    const bars = [{ date: ds[0]!, close: p }];
    rets.forEach((r, i) => {
      p *= Math.exp(r * 0.04);
      bars.push({ date: ds[i + 1]!, close: p });
    });
    return bars;
  };

  it('皮尔逊相关系数', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 10);
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 10);
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull();
    expect(pearson([1, 2], [1, 2])).toBeNull();
  });

  it('按日期对齐，缺的日子跳过', () => {
    const a = [{ date: '2026-01-01', close: 10 }, { date: '2026-01-02', close: 11 }, { date: '2026-01-03', close: 12 }];
    const b = [{ date: '2026-01-01', close: 20 }, { date: '2026-01-03', close: 24 }];
    const [ra, rb] = alignedReturns(a, b);
    expect(ra).toHaveLength(1);
    expect(ra[0]).toBeCloseTo(Math.log(1.2), 10);
    expect(rb[0]).toBeCloseTo(Math.log(1.2), 10);
  });

  it('矩阵、最相关的几对、候选和现有持仓的加权相关性', () => {
    const base = series(7, 130);
    const bars = { AAA: toBars(base), BBB: toBars(series(11, 130, base)), CCC: toBars(series(23, 130)), DDD: toBars(series(5, 30)) };
    const m = correlationMatrix(bars, ['AAA', 'BBB', 'CCC', 'DDD']);
    expect(m.missing).toEqual(['DDD']);
    expect(m.values[0]![0]).toBe(1);
    expect(m.values[0]![1]!).toBeGreaterThan(0.9);
    expect(Math.abs(m.values[0]![2]!)).toBeLessThan(0.3);
    expect(m.values[3]![0]).toBeNull();
    expect(m.days[0]![1]).toBe(126);
    expect(topPairs(m, 1)[0]).toMatchObject({ a: 'AAA', b: 'BBB' });
    const w = weightedCorrelation(m, 'BBB', { AAA: 3000, CCC: 1000 })!;
    expect(w).toBeCloseTo((m.values[1]![0]! * 3000 + m.values[1]![2]! * 1000) / 4000, 1);
  });
});

describe('分批计划和挂单', () => {
  const plan: Plan = {
    id: 'p1',
    symbol: 'XLV',
    side: 'buy',
    createdAt: '2026-11-10',
    tranches: [
      { id: 't1', date: '2026-11-12', amount: 500, limit: 140, status: 'filled', fillPrice: 139.5, fillQty: 3.5 },
      { id: 't2', date: '2026-11-19', amount: 500, limit: 135, tif: 'gtc', status: 'placed' },
      { id: 't3', date: '2026-11-14', qty: 4, limit: 130, tif: 'day', status: 'placed' },
      { id: 't4', date: '2026-11-13', amount: 300, status: 'planned' },
      { id: 't5', amount: 999, status: 'cancelled' },
    ],
  };

  it('汇总：计划金额、已成交、均价、挂单离现价多远', () => {
    const s = planSummary(plan, 142);
    expect(s.plannedAmount).toBe(139.5 * 3.5 + 500 + 4 * 130 + 300);
    expect(s.filledAmount).toBe(488.25);
    expect(s.filledQty).toBe(3.5);
    expect(s.avgFill).toBe(139.5);
    expect(s.counts).toEqual({ planned: 1, placed: 2, filled: 1, cancelled: 1 });
    expect(s.openOrders).toEqual([
      { id: 't2', limit: 135, tif: 'gtc', distancePct: 5.19 },
      { id: 't3', limit: 130, tif: 'day', distancePct: 9.23 },
    ]);
    expect(s.next!.id).toBe('t4');
    expect(s.vsPricePct).toBe(1.79);
    expect(s.progressPct).toBe(Math.round((488.25 / s.plannedAmount) * 1000) / 10);
  });

  it('没有行情时不算距离', () => {
    expect(planSummary(plan, null).openOrders[0]!.distancePct).toBeNull();
  });

  it('过期没执行的批次、过期的当日单', () => {
    expect(overdueTranches(plan, '2026-11-17').map((t) => t.id)).toEqual(['t4']);
    expect(staleDayOrders(plan, '2026-11-17').map((t) => t.id)).toEqual(['t3']);
  });
});

describe('期权链导入', () => {
  it('OCC 合约代码和各种到期日写法', () => {
    expect(parseOcc('AAPL261218C00200000')).toEqual({ underlying: 'AAPL', expiry: '2026-12-18', right: 'CALL', strike: 200 });
    expect(parseOcc('SPY  270115P00550500')!.strike).toBe(550.5);
    expect(parseExpiry('12/18/2026')).toBe('2026-12-18');
    expect(parseExpiry('18 Dec 2026')).toBe('2026-12-18');
    expect(parseExpiry('Dec 18, 2026')).toBe('2026-12-18');
    expect(parseExpiry('20261218')).toBe('2026-12-18');
    expect(parseExpiry('soon')).toBeNull();
  });

  it('每行一个合约的 CSV，IV 小数转百分数，看跌 Delta 补负号', () => {
    const csv = [
      'Options chain for ZZZ (fictional)',
      'Expiration,Strike,Type,Bid,Ask,Volume,Open Int,IV,Delta,Gamma',
      '12/18/2026,95,Put,1.10,1.30,120,800,0.42,0.25,0.03',
      '12/18/2026,100,Put,2.90,3.10,300,1500,40%,-0.48,0.05',
      '12/18/2026,100,Call,3.00,3.20,500,2000,0.38,0.52,0.05',
      '12/18/2026,105,Call,1.00,1.20,200,900,0.36,0.24,0.03',
      '11/13/2026,100,Call,0.10,0.20,0,0,0.30,0.5,0.01',
      'total,,,,,,,,,',
    ].join('\n');
    const r = parseOptionChain(csv, '2026-11-17', 'zzz');
    expect(r.error).toBeUndefined();
    expect(r.underlying).toBe('ZZZ');
    expect(r.contracts).toHaveLength(4);
    expect(r.skipped).toBe(2);
    const p95 = r.contracts[0]!;
    expect(p95).toMatchObject({ underlying: 'ZZZ', dte: 31, strike: 95, right: 'PUT', mark: 1.2, iv: 42, delta: -0.25, openInterest: 800 });
    expect(r.contracts[1]!.iv).toBe(40);

    const m = analyzeChain('ZZZ', r.contracts, 100);
    expect(m.atmIv).toBe(39);
    expect(m.ivDte).toBe(31);
    expect(m.expectedMove).toBeCloseTo(100 * 0.39 * Math.sqrt(31 / 365), 2);
    expect(m.putCallOi).toBeCloseTo(2300 / 2900, 3);
    expect(m.maxPain).toBe(100);
    expect(m.volSkew).toBe(6);
  });

  it('只有 OCC 代码列也能读；认不出表头时报错', () => {
    const r = parseOptionChain('Symbol\tBid\tAsk\tOI\nZZZ261218C00100000\t3\t3.2\t10', '2026-11-17');
    expect(r.contracts[0]).toMatchObject({ underlying: 'ZZZ', strike: 100, right: 'CALL', expiry: '2026-12-18', mark: 3.1, openInterest: 10 });
    expect(parseOptionChain('hello\nworld', '2026-11-17').error).toBe('noHeader');
  });
});
