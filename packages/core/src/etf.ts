/**
 * ETF 穿透：把 ETF 按成分股拆开，算你通过 ETF 间接持有每只股票多少钱。
 * 只用前十大成分：免费数据源大多不给全部持仓，前十大已经覆盖了大部分集中度风险。
 * 剩下的部分算作「ETF 内其他成分」，不假装知道。
 *
 * 内置表来自基金公司公开的持仓（经 stockanalysis.com 汇总），每季度更新一次；
 * 用户也可以在页面上为任意 ETF 填自己的成分表，优先用用户填的。
 */

export interface EtfProfile {
  /** 基金名 */
  name: string;
  /** 数据日期 */
  asOf: string;
  /** [代码, 占基金的 %] 按权重从大到小 */
  top: Array<[string, number]>;
  /** 跟踪同一指数的基金共用一张表时写来源基金 */
  proxy?: string;
}

const SP500_TOP: Array<[string, number]> = [
  ['AAPL', 7.9], ['NVDA', 6.14], ['MSFT', 5.93], ['AMZN', 4.01], ['GOOGL', 2.68],
  ['AVGO', 2.65], ['GOOG', 2.14], ['META', 2.1], ['LLY', 1.74], ['TSLA', 1.71],
];
const NDX_TOP: Array<[string, number]> = [
  ['NVDA', 8.09], ['AAPL', 8.07], ['MSFT', 6.19], ['MU', 4.35], ['AMZN', 4.25],
  ['AMD', 3.7], ['TSLA', 3.11], ['META', 3.04], ['GOOGL', 2.99], ['GOOG', 2.79],
];

export const ETF_HOLDINGS: Record<string, EtfProfile> = {
  SPY: { name: 'SPDR S&P 500 ETF', asOf: '2026-11-12', top: SP500_TOP },
  VOO: { name: 'Vanguard S&P 500 ETF', asOf: '2026-11-12', top: SP500_TOP, proxy: 'SPY' },
  IVV: { name: 'iShares Core S&P 500 ETF', asOf: '2026-11-12', top: SP500_TOP, proxy: 'SPY' },
  SPLG: { name: 'SPDR Portfolio S&P 500 ETF', asOf: '2026-11-12', top: SP500_TOP, proxy: 'SPY' },
  QQQ: { name: 'Invesco QQQ Trust', asOf: '2026-10-26', top: NDX_TOP },
  QQQM: { name: 'Invesco NASDAQ 100 ETF', asOf: '2026-10-26', top: NDX_TOP, proxy: 'QQQ' },
  SMH: {
    name: 'VanEck Semiconductor ETF',
    asOf: '2026-11-14',
    top: [['NVDA', 17.25], ['TSM', 10.09], ['AVGO', 6.42], ['TXN', 6.17], ['AMD', 6.07], ['ADI', 5.08], ['ASML', 4.61], ['MU', 4.49], ['KLAC', 4.43], ['QCOM', 4.36]],
  },
  XLK: {
    name: 'Technology Select Sector SPDR ETF',
    asOf: '2026-10-23',
    top: [['NVDA', 15.24], ['AAPL', 15.14], ['MSFT', 11.62], ['AVGO', 4.57], ['AMD', 4.56], ['MU', 3.92], ['PLTR', 2.74], ['INTC', 2.61], ['CSCO', 2.54], ['PANW', 1.87]],
  },
  // 下面是市场页的板块 ETF（2026-11-18 加），点开板块时看成分股当天谁动得最多
  SOXX: {
    name: 'iShares Semiconductor ETF',
    asOf: '2026-02-20',
    top: [['MU', 8.76], ['AMAT', 7.2], ['NVDA', 7.04], ['AMD', 6.04], ['AVGO', 5.42], ['LRCX', 5.16], ['ADI', 4.39], ['TXN', 4.29], ['ASML', 4.28], ['TER', 4.27]],
  },
  XLY: {
    name: 'Consumer Discretionary Select Sector SPDR ETF',
    asOf: '2025-09-12',
    top: [['AMZN', 22.11], ['TSLA', 18.59], ['HD', 7.04], ['MCD', 4.09], ['BKNG', 4.04], ['TJX', 3.68], ['LOW', 3.6], ['SBUX', 2.2], ['ORLY', 2.17], ['DASH', 2.09]],
  },
  XLE: {
    name: 'Energy Select Sector SPDR ETF',
    asOf: '2026-11-02',
    top: [['XOM', 24.32], ['CVX', 18.46], ['COP', 7.24], ['MPC', 4.69], ['PSX', 4.59], ['VLO', 4.27], ['WMB', 4.12], ['EOG', 4.05], ['SLB', 3.79], ['KMI', 3.13]],
  },
  XLF: {
    name: 'Financial Select Sector SPDR ETF',
    asOf: '2026-11-12',
    top: [['BRK.B', 13.4], ['JPM', 11.12], ['V', 8.74], ['MA', 6.44], ['BAC', 4.01], ['GS', 3.25], ['WFC', 3.16], ['MS', 2.75], ['C', 2.54], ['BLK', 2.14]],
  },
  XLV: {
    name: 'Health Care Select Sector SPDR ETF',
    asOf: '2026-10-23',
    top: [['LLY', 15.64], ['JNJ', 9.76], ['ABBV', 7.75], ['UNH', 5.76], ['MRK', 5.5], ['TMO', 3.82], ['AMGN', 3.65], ['GILD', 2.97], ['ABT', 2.75], ['PFE', 2.63]],
  },
  XLI: {
    name: 'Industrial Select Sector SPDR ETF',
    asOf: '2026-10-23',
    top: [['CAT', 6.03], ['GE', 5.66], ['RTX', 4.92], ['GEV', 4.15], ['UNP', 3.32], ['DE', 3.1], ['BA', 2.84], ['ETN', 2.72], ['UBER', 2.6], ['LMT', 2.34]],
  },
  XLP: {
    name: 'Consumer Staples Select Sector SPDR ETF',
    asOf: '2026-10-23',
    top: [['WMT', 10.94], ['COST', 9.11], ['PG', 7.66], ['KO', 7.35], ['PM', 6.36], ['MO', 4.52], ['CL', 4.41], ['MDLZ', 4.22], ['PEP', 4.1], ['TGT', 4.01]],
  },
  XLRE: {
    name: 'Real Estate Select Sector SPDR ETF',
    asOf: '2026-10-22',
    top: [['WELL', 11.64], ['PLD', 8.19], ['EQIX', 6.39], ['AMT', 5.76], ['PSA', 4.81], ['SPG', 4.75], ['VMRK', 4.48], ['VTR', 4.46], ['O', 4.35], ['CBRE', 4.25]],
  },
  // 罗素 2000 很分散，前十大只占 3% 左右，拆开意义不大，页面上会提示覆盖比例
  IWM: {
    name: 'iShares Russell 2000 ETF',
    asOf: '2026-10-23',
    top: [['FROG', 0.37], ['GKOS', 0.35], ['BTSG', 0.34], ['UMBF', 0.34], ['SM', 0.33], ['MOG.A', 0.33], ['TWST', 0.31], ['ONB', 0.3], ['RHP', 0.3]],
  },
};

/** 一只 ETF 用哪张成分表：用户填的优先，其次内置 */
export function etfTop(symbol: string, custom: Record<string, Array<[string, number]>> = {}): { top: Array<[string, number]>; asOf: string; custom: boolean } | null {
  const sym = symbol.toUpperCase();
  if (custom[sym]?.length) return { top: custom[sym]!, asOf: '', custom: true };
  const p = ETF_HOLDINGS[sym];
  return p ? { top: p.top, asOf: p.asOf, custom: false } : null;
}

export interface EtfMover {
  symbol: string;
  /** 占 ETF 的 % */
  weight: number;
  /** 当日涨跌幅 %，没有报价时为 null */
  changePct: number | null;
  /** 对 ETF 当日涨跌的贡献（百分点）= 权重 × 涨跌幅 */
  contribution: number | null;
}

/**
 * 板块 ETF 当天的涨跌主要来自哪几只成分股：按贡献（权重 × 涨跌幅）的绝对值排序。
 * 只看前十大，剩下的部分不假装知道；explained 是前十大合计贡献了多少个百分点。
 */
export function etfMovers(
  symbol: string,
  quotes: Record<string, { changePct: number | null }>,
  custom: Record<string, Array<[string, number]>> = {},
): { rows: EtfMover[]; asOf: string; coveredPct: number; explained: number | null; custom: boolean } | null {
  const t = etfTop(symbol, custom);
  if (!t) return null;
  const rows: EtfMover[] = t.top.map(([sym, weight]) => {
    const q = quotes[sym.toUpperCase()];
    const changePct = q && q.changePct != null ? q.changePct : null;
    return { symbol: sym.toUpperCase(), weight, changePct, contribution: changePct != null ? Math.round(((weight * changePct) / 100) * 1000) / 1000 : null };
  });
  rows.sort((a, b) => (b.contribution == null ? -1 : Math.abs(b.contribution)) - (a.contribution == null ? -1 : Math.abs(a.contribution)));
  const known = rows.filter((r) => r.contribution != null);
  return {
    rows,
    asOf: t.asOf,
    custom: t.custom,
    coveredPct: r1(Math.min(100, t.top.reduce((s, [, w]) => s + w, 0))),
    explained: known.length ? Math.round(known.reduce((s, r) => s + r.contribution!, 0) * 100) / 100 : null,
  };
}

/** 同一家公司的不同股份类别合并显示（GOOG 和 GOOGL 都是 Alphabet） */
const SHARE_CLASS: Record<string, string> = { GOOG: 'GOOGL', 'BRK.A': 'BRK.B' };
const canon = (s: string) => SHARE_CLASS[s] ?? s;

/** 解析用户填的成分表：每行「代码 权重%」，逗号、空格、制表符都行 */
export function parseEtfTop(text: string): Array<[string, number]> {
  const out: Array<[string, number]> = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.trim().match(/^([A-Za-z][A-Za-z0-9.\-]{0,9})[\s,;:\t]+([0-9]+(?:\.[0-9]+)?)\s*%?$/);
    if (m) out.push([m[1]!.toUpperCase(), Number(m[2])]);
  }
  return out.filter(([, w]) => w > 0 && w <= 100).sort((a, b) => b[1] - a[1]);
}

export interface ExposureRow {
  symbol: string;
  /** 直接持有的市值 */
  direct: number;
  /** 通过 ETF 间接持有的市值 */
  viaEtf: number;
  total: number;
  /** 占总资产（含现金）% */
  pct: number;
  /** 间接部分来自哪些 ETF：ETF 代码 → 市值 */
  sources: Record<string, number>;
}

export interface LookThrough {
  rows: ExposureRow[];
  /** 拆开了的 ETF 及其市值 */
  etfs: Array<{ symbol: string; value: number; asOf: string; custom: boolean; coveredPct: number }>;
  /** 持有但没有成分表的 ETF（只能按整只算） */
  unknownEtfs: string[];
  /** ETF 里前十大以外的部分，合计市值 */
  otherInEtfs: number;
  totalValue: number;
}

interface PositionLike {
  symbol: string;
  marketValue: number;
  /** 分类结果，用来判断一只没有成分表的持仓是不是 ETF */
  sector?: string;
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * 计算穿透后的真实敞口。
 * custom 是用户自己填的成分表（代码 → 前若干大），优先于内置表。
 * isEtf 用来找出「是 ETF 但没有成分表」的持仓，提示用户补。
 */
export function lookThrough(
  positions: PositionLike[],
  totalValue: number,
  custom: Record<string, Array<[string, number]>> = {},
  isEtf: (symbol: string) => boolean = () => false,
): LookThrough {
  const rows = new Map<string, ExposureRow>();
  const row = (sym: string) => {
    let r = rows.get(sym);
    if (!r) {
      r = { symbol: sym, direct: 0, viaEtf: 0, total: 0, pct: 0, sources: {} };
      rows.set(sym, r);
    }
    return r;
  };
  const etfs: LookThrough['etfs'] = [];
  const unknownEtfs: string[] = [];
  let otherInEtfs = 0;

  for (const p of positions) {
    const sym = p.symbol.toUpperCase();
    const mine = custom[sym];
    const top = mine?.length ? mine : ETF_HOLDINGS[sym]?.top;
    if (!top) {
      if (isEtf(sym)) unknownEtfs.push(sym);
      row(canon(sym)).direct += p.marketValue;
      continue;
    }
    let covered = 0;
    for (const [underlying, w] of top) {
      const v = (p.marketValue * w) / 100;
      const r = row(canon(underlying));
      r.viaEtf += v;
      r.sources[sym] = (r.sources[sym] ?? 0) + v;
      covered += w;
    }
    covered = Math.min(covered, 100);
    otherInEtfs += (p.marketValue * (100 - covered)) / 100;
    etfs.push({ symbol: sym, value: p.marketValue, asOf: mine?.length ? '' : ETF_HOLDINGS[sym]!.asOf, custom: !!mine?.length, coveredPct: r1(covered) });
  }

  const out = [...rows.values()].map((r) => {
    const total = r.direct + r.viaEtf;
    const sources = Object.fromEntries(Object.entries(r.sources).map(([k, v]) => [k, r2(v)]));
    return { ...r, direct: r2(r.direct), viaEtf: r2(r.viaEtf), total: r2(total), pct: totalValue ? r1((total / totalValue) * 100) : 0, sources };
  });
  out.sort((a, b) => b.total - a.total || a.symbol.localeCompare(b.symbol));
  return { rows: out, etfs, unknownEtfs, otherInEtfs: r2(otherInEtfs), totalValue };
}
