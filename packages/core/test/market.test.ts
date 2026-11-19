import { describe, expect, it } from 'vitest';
import { buildPortfolio, etfMovers, parseHoldingsCsv, parsePastedHoldings, shouldAutoRefresh, usMarketSession, aggregateBySymbol } from '../src';

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

describe('粘贴持仓（从券商网页表格复制）', () => {
  // 虚构数据，格式照 IBKR 网页「Your Holdings」
  const head = ['INSTRUMENT ▲', '▲ POSITION', '▲ LAST', '▲ CHANGE %', '▲ COST BASIS', '▲ MARKET VALUE', '▲ AVG PRICE', '▲ DAILY P&L', '▲ UNREALIZED P&L'];
  const rows = [
    ['AAPL', '10', '200.00', '+1.00%', '1,800.00', '2,000.00', '180.00', '+19.80', '+200.00'],
    ["US-T Govt Note TIPS 1.5 Jan15'30", '1', '98.50000', '-0.10%', '1,000.00', '990.00', '100.00', '-0.99', '-10.00'],
    ['• VTI', '2.5', '300.00', '-0.50%', '760.00', '750.00', '304.00', '-10.00', '-10.00'],
  ];
  const check = (r: ReturnType<typeof parsePastedHoldings>) => {
    expect(r.holdings.map((h) => h.symbol)).toEqual(['AAPL', "US-T Govt Note TIPS 1.5 Jan15'30", 'VTI']);
    expect(r.holdings[0]).toMatchObject({ qty: 10, costBasis: 180 });
    expect(r.holdings[1]).toMatchObject({ qty: 1, noQuote: true, manualPrice: 990, costBasis: 1000 });
    expect(r.holdings[2]).toMatchObject({ qty: 2.5, costBasis: 304 });
  };
  it('带表头、制表符分隔', () => check(parsePastedHoldings([head, ...rows].map((r) => r.join('\t')).join('\n'))));
  it('每个格子一行，夹着「⋮」菜单', () => check(parsePastedHoldings([...head, ...rows.flatMap((r) => [...r, '⋮'])].join('\n'))));
  it('没带表头，按 IBKR 列顺序', () => {
    const r = parsePastedHoldings(rows.map((x) => x.join('\t')).join('\n'));
    check(r);
    expect(r.broker).toBe('IBKR');
  });
  it('还认「代码 数量 成本」', () => {
    expect(parsePastedHoldings('NVDA 30 92\nAAPL 20 150').holdings).toEqual([
      { symbol: 'NVDA', qty: 30, costBasis: 92 },
      { symbol: 'AAPL', qty: 20, costBasis: 150 },
    ]);
  });
});

describe('IBKR 活动报表（分段 CSV）', () => {
  const csv = [
    'Statement,Header,Field Name,Field Value',
    'Statement,Data,Title,Activity Statement',
    'Open Positions,Header,DataDiscriminator,Asset Category,Currency,Symbol,Quantity,Mult,Cost Price,Cost Basis,Close Price,Value,Unrealized P/L,Code',
    'Open Positions,Data,Summary,Stocks,USD,AAPL,10,1,180,1800,200,2000,200,',
    'Open Positions,Data,Lot,Stocks,USD,AAPL,10,1,180,1800,200,2000,200,',
    'Open Positions,Total,,Stocks,USD,,,,,1800,,2000,200,',
    'Open Positions,Data,Summary,Bonds,USD,T 1 1/2 01/15/30,1000,1,99.5,995,98.77,987.7,-7.3,',
    'Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price',
    'Trades,Data,Order,Stocks,USD,MSFT,"2026-11-02, 10:00:00",5,400',
  ].join('\n');
  it('只读 Open Positions 段的 Summary 行，债券按市值', () => {
    const r = parseHoldingsCsv(csv);
    expect(r.holdings.map((h) => h.symbol)).toEqual(['AAPL', 'T 1 1/2 01/15/30']);
    expect(r.holdings[0]).toMatchObject({ qty: 10, costBasis: 180 });
    expect(r.holdings[1]).toMatchObject({ qty: 1000, noQuote: true, manualPrice: 0.9877, costBasis: 0.995 });
  });
});

describe('每股涨跌和板块成分股', () => {
  it('有昨收用昨收算每股涨跌', () => {
    const v = buildPortfolio([{ symbol: 'AAA', qty: 5, costBasis: 90 }], { AAA: { symbol: 'AAA', price: 101, changePct: 1, prevClose: 100, asOf: '' } }, 0);
    expect(v.positions[0]!.dayChange).toBeCloseTo(1, 6);
  });
  it('按贡献（权重 × 涨跌幅）排序', () => {
    const m = etfMovers('XLE', { XOM: { changePct: -4 }, CVX: { changePct: -1 }, COP: { changePct: 2 } })!;
    expect(m.rows[0]).toMatchObject({ symbol: 'XOM', contribution: -0.973 });
    expect(m.rows[1]!.symbol).toBe('CVX');
    expect(m.rows[2]!.symbol).toBe('COP');
    expect(m.rows.at(-1)!.contribution).toBeNull();
    expect(m.explained).toBeCloseTo(-0.973 - 0.185 + 0.145, 2);
    expect(etfMovers('NOPE', {})).toBeNull();
    // 用户自己填的成分表优先
    expect(etfMovers('XLE', {}, { XLE: [['ZZZ', 50]] })!.rows[0]!.symbol).toBe('ZZZ');
  });
});

describe('没有行情的持仓带登记时间', () => {
  it('估值时带出来；跨账户合并时取最旧的', () => {
    const bond = { symbol: 'T 2030', qty: 1, costBasis: 1000, manualPrice: 990, noQuote: true };
    const merged = aggregateBySymbol([
      { ...bond, account: 'A', valuedAt: '2026-11-10T18:00:00Z' },
      { ...bond, account: 'B', valuedAt: '2026-10-01T18:00:00Z' },
    ]);
    expect(merged[0]!.valuedAt).toBe('2026-10-01T18:00:00Z');
    const v = buildPortfolio(merged, {}, 0);
    expect(v.positions[0]!.valuedAt).toBe('2026-10-01T18:00:00Z');
    // 有代码的股票不带这个字段
    expect(buildPortfolio([{ symbol: 'AAA', qty: 1, costBasis: 1, valuedAt: '2026-10-01' }], {}, 0).positions[0]!.valuedAt).toBeUndefined();
  });
});
