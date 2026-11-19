import { describe, expect, it } from 'vitest';
import { buildPortfolio, parseHoldingsCsv, shouldAutoRefresh, usMarketSession, aggregateBySymbol } from '../src';

// 全部用固定时刻（UTC），不依赖真实的「现在」
const at = (iso: string) => new Date(iso);

describe('美股交易时段', () => {
  it('冬令时（美东 = UTC-5）', () => {
    expect(usMarketSession(at('2026-11-18T15:00:00Z')).state).toBe('open'); // 10:00 ET
    expect(usMarketSession(at('2026-11-18T14:29:00Z')).state).toBe('pre'); // 9:29 ET
    expect(usMarketSession(at('2026-11-18T21:30:00Z')).state).toBe('post'); // 16:30 ET
    expect(usMarketSession(at('2026-11-19T02:00:00Z')).state).toBe('closed'); // 21:00 ET
    expect(usMarketSession(at('2026-11-18T15:00:00Z')).date).toBe('2026-11-18');
  });
  it('夏令时（美东 = UTC-4）', () => {
    expect(usMarketSession(at('2027-07-06T13:45:00Z')).state).toBe('open'); // 9:45 EDT
    expect(usMarketSession(at('2027-07-06T13:15:00Z')).state).toBe('pre');
  });
  it('周末、休市日、提前收盘', () => {
    expect(usMarketSession(at('2026-11-21T16:00:00Z')).state).toBe('closed'); // 周六
    expect(usMarketSession(at('2026-11-26T16:00:00Z')).state).toBe('closed'); // 感恩节
    expect(usMarketSession(at('2026-11-27T17:00:00Z')).state).toBe('open'); // 12:00 ET
    expect(usMarketSession(at('2026-11-27T18:30:00Z')).state).toBe('post'); // 13:30 ET，已提前收盘
    expect(usMarketSession(at('2026-11-27T18:30:00Z')).closeMinute).toBe(13 * 60);
  });
});

describe('自动刷新时机', () => {
  const open = at('2026-11-18T16:00:00Z'); // 11:00 ET
  it('盘中按间隔刷新', () => {
    expect(shouldAutoRefresh(open, at('2026-11-18T15:57:00Z'), 5)).toBe(false);
    expect(shouldAutoRefresh(open, at('2026-11-18T15:54:00Z'), 5)).toBe(true);
    expect(shouldAutoRefresh(open, null, 5)).toBe(true);
    expect(shouldAutoRefresh(open, at('2026-11-18T10:00:00Z'), 0)).toBe(false); // 关掉了
  });
  it('收盘后补拉一次收盘价，之后不再刷', () => {
    // 上次 15:50 ET 拉的，现在 16:10 ET
    expect(shouldAutoRefresh(at('2026-11-18T21:10:00Z'), at('2026-11-18T20:50:00Z'), 5)).toBe(true);
    // 上次 16:10 ET 拉的（已经是收盘后），现在 18:00 ET
    expect(shouldAutoRefresh(at('2026-11-18T23:00:00Z'), at('2026-11-18T21:10:00Z'), 5)).toBe(false);
    // 周五盘中拉的，周六打开
    expect(shouldAutoRefresh(at('2026-11-21T18:00:00Z'), at('2026-11-20T19:00:00Z'), 5)).toBe(true);
    // 周六拉过，周日打开
    expect(shouldAutoRefresh(at('2026-11-22T18:00:00Z'), at('2026-11-21T18:00:00Z'), 5)).toBe(false);
    // 昨天收盘后拉的，今天收盘后才打开：中间有一整个交易日
    expect(shouldAutoRefresh(at('2026-11-19T00:16:00Z'), at('2026-11-17T21:00:00Z'), 5)).toBe(true);
    // 周三收盘后拉的，感恩节（周四休市）晚上打开
    expect(shouldAutoRefresh(at('2026-11-27T01:00:00Z'), at('2026-11-25T22:00:00Z'), 5)).toBe(false);
    // 刚收盘 2 分钟，收盘价可能还没定，先不拉
    expect(shouldAutoRefresh(at('2026-11-18T21:02:00Z'), at('2026-11-18T20:59:00Z'), 5)).toBe(false);
  });
});

// 虚构数据，列名照 IBKR 网页「Your Holdings」导出
const IBKR = [
  'Financial Instrument,Position,Last,Change %,Cost Basis,Market Value,Avg Price,Daily P&L,Unrealized P&L',
  'AAPL,10,200.00,+1.00%,"1,800.00","2,000.00",180.00,19.80,200.00',
  'VTI,2.5,300.00,-0.50%,700.00,750.00,280.00,-3.77,50.00',
  "US-T Govt Note 1.5 Jan30'30,2,98.50,-0.10%,\"1,990.00\",\"1,975.40\",99.50,-1.90,-14.60",
  'Total,,,,"4,490.00","4,725.40",,,',
].join('\n');

describe('券商导出里的债券、期权行', () => {
  const r = parseHoldingsCsv(IBKR);
  it('股票照常，零碎股保留小数，成本用均价', () => {
    expect(r.broker).toBe('IBKR');
    const aapl = r.holdings.find((h) => h.symbol === 'AAPL')!;
    expect(aapl).toMatchObject({ qty: 10, costBasis: 180, manualPrice: 200 });
    expect(aapl.noQuote).toBeUndefined();
    expect(r.holdings.find((h) => h.symbol === 'VTI')!.qty).toBe(2.5);
  });
  it('没有代码的行按市值导入，不拉行情；单位按市值和总成本换算，不会差 10 倍', () => {
    const bond = r.holdings.find((h) => h.noQuote)!;
    expect(bond.name).toBe("US-T Govt Note 1.5 Jan30'30");
    expect(bond.qty).toBe(2);
    expect(bond.manualPrice).toBe(987.7);
    expect(bond.costBasis).toBe(995);
    expect(r.skipped).toEqual([]);
  });
  it('估值和券商对得上：市值、总成本、未实现盈亏', () => {
    const quotes = {
      AAPL: { symbol: 'AAPL', price: 200, changePct: 1, asOf: '' },
      VTI: { symbol: 'VTI', price: 300, changePct: -0.5, asOf: '' },
      // 就算有同名报价也不用
      "US-T GOVT NOTE 1.5 JAN30'30": { symbol: 'X', price: 1, changePct: 5, asOf: '' },
    };
    const v = buildPortfolio(aggregateBySymbol(r.holdings), quotes, 0);
    const bond = v.positions.find((p) => p.noQuote)!;
    expect(bond.marketValue).toBeCloseTo(1975.4, 2);
    expect(bond.cost).toBeCloseTo(1990, 2);
    expect(bond.totalPnl).toBeCloseTo(-14.6, 2);
    expect(bond.dayPnl).toBeNull();
    expect(v.totalValue).toBeCloseTo(4725.4, 2);
    expect(v.positions.find((p) => p.symbol === 'AAPL')!.cost).toBe(1800);
    // 当日合计只算有行情的股票，债券没有涨跌幅也不会让合计变成空
    expect(v.dayPnl).not.toBeNull();
    expect(v.dayPnl!).toBeCloseTo(19.8 - 3.77, 1);
  });
});

describe('今日盈亏来源的比例', () => {
  it('有涨有跌时按上涨仓位的盈利合计算，不会超过 100%', async () => {
    const { subline } = await import('../src');
    const v = buildPortfolio(
      [
        { symbol: 'AAA', qty: 10, costBasis: 100 },
        { symbol: 'BBB', qty: 10, costBasis: 100 },
      ],
      {
        AAA: { symbol: 'AAA', price: 102, changePct: 2, asOf: '' },
        BBB: { symbol: 'BBB', price: 99, changePct: -1, asOf: '' },
      },
      0,
    );
    expect(v.dayPnl!).toBeGreaterThan(0);
    expect(subline(v, 'en')).toBe('100% of the gain came from AAA.');
  });
});
