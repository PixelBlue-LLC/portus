/**
 * 期权链导入：免费又允许浏览器直连的期权数据源基本没有，所以让用户把券商导出的期权链贴进来。
 * 支持「每行一个合约」的 CSV（列名按别名识别），合约代码也可以是 OCC 格式（AAPL261218C00200000），
 * 缺少到期日、行权价、看涨看跌列时从合约代码里解析。
 */
import { parseNumber, splitCsvLine } from './importers';
import type { OptionContract } from './options';

const COLS = {
  contract: ['contract', 'symbol', 'option symbol', 'option', 'contract name', 'description', '合约', '代码'],
  expiry: ['expiration', 'expiry', 'exp', 'exp date', 'expiration date', 'expire date', '到期日', '到期'],
  strike: ['strike', 'strike price', '行权价'],
  right: ['type', 'right', 'call/put', 'put/call', 'option type', 'side', 'cp', '类型', '看涨看跌'],
  bid: ['bid', '买价'],
  ask: ['ask', '卖价'],
  mark: ['mark', 'mid', 'last', 'last price', 'price', '最新价', '中间价'],
  volume: ['volume', 'vol', '成交量'],
  oi: ['open interest', 'open int', 'oi', 'openinterest', '未平仓', '持仓量'],
  iv: ['iv', 'implied volatility', 'impl vol', 'imp vol', 'volatility', '隐含波动率'],
  delta: ['delta'],
  gamma: ['gamma'],
  theta: ['theta'],
  vega: ['vega'],
} as const;

type ColKey = keyof typeof COLS;

/** OCC 合约代码：根代码 + YYMMDD + C/P + 行权价×1000（8 位） */
export function parseOcc(code: string): { underlying: string; expiry: string; right: 'CALL' | 'PUT'; strike: number } | null {
  const m = code.replace(/\s+/g, '').toUpperCase().match(/^([A-Z.]{1,6})(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
  if (!m) return null;
  return { underlying: m[1]!, expiry: `20${m[2]}-${m[3]}-${m[4]}`, right: m[5] === 'C' ? 'CALL' : 'PUT', strike: Number(m[6]) / 1000 };
}

const MONTHS: Record<string, string> = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };

/** 到期日：2026-12-18、12/18/2026、18 Dec 2026、Dec 18 2026、20261218 */
export function parseExpiry(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().replace(/,/g, ' ').replace(/\s+/g, ' ');
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) return `${m[3]!.length === 2 ? `20${m[3]}` : m[3]}-${m[1]!.padStart(2, '0')}-${m[2]!.padStart(2, '0')}`;
  m = s.match(/^(\d{8})$/);
  if (m) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  m = s.match(/^(\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{2,4})/);
  if (m && MONTHS[m[2]!.toUpperCase()]) return `${m[3]!.length === 2 ? `20${m[3]}` : m[3]}-${MONTHS[m[2]!.toUpperCase()]}-${m[1]!.padStart(2, '0')}`;
  m = s.match(/^([A-Za-z]{3})[a-z]* (\d{1,2}) (\d{2,4})/);
  if (m && MONTHS[m[1]!.toUpperCase()]) return `${m[3]!.length === 2 ? `20${m[3]}` : m[3]}-${MONTHS[m[1]!.toUpperCase()]}-${m[2]!.padStart(2, '0')}`;
  return null;
}

function parseRight(raw: string | undefined): 'CALL' | 'PUT' | null {
  const s = (raw ?? '').trim().toUpperCase();
  if (s === 'C' || s.startsWith('CALL') || s === '看涨' || s === '认购') return 'CALL';
  if (s === 'P' || s.startsWith('PUT') || s === '看跌' || s === '认沽') return 'PUT';
  return null;
}

export interface ChainImport {
  contracts: OptionContract[];
  /** 从数据里认出来的标的代码 */
  underlying?: string;
  skipped: number;
  /** 识别到的列（给页面提示） */
  columns: string[];
  /** 找不到必要的列时的说明 key：noHeader / noStrike / noExpiry */
  error?: 'noHeader' | 'noStrike' | 'noExpiry' | 'noRight';
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5);

/**
 * 解析期权链 CSV。today 用来算剩余天数（YYYY-MM-DD）。
 * IV 写成 0.32 或 32% 都行，统一成百分数 32。
 */
export function parseOptionChain(text: string, today: string, underlyingHint?: string): ChainImport {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { contracts: [], skipped: 0, columns: [], error: 'noHeader' };
  const delim = lines.slice(0, 5).some((l) => l.includes('\t')) ? '\t' : ',';
  const norm = (h: string) => h.trim().toLowerCase().replace(/["']/g, '').replace(/\s+/g, ' ');

  // 表头可能不在第一行（前面有说明文字），找第一行能认出行权价列的
  let headerIdx = -1;
  let idx: Partial<Record<ColKey, number>> = {};
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const cells = splitCsvLine(lines[i]!, delim).map(norm);
    const found: Partial<Record<ColKey, number>> = {};
    (Object.keys(COLS) as ColKey[]).forEach((k) => {
      const at = cells.findIndex((c) => (COLS[k] as readonly string[]).includes(c));
      if (at >= 0) found[k] = at;
    });
    if (found.strike != null || found.contract != null) {
      headerIdx = i;
      idx = found;
      break;
    }
  }
  if (headerIdx < 0) return { contracts: [], skipped: 0, columns: [], error: 'noHeader' };
  const columns = (Object.keys(idx) as ColKey[]).filter((k) => idx[k] != null);

  const contracts: OptionContract[] = [];
  let skipped = 0;
  let underlying = underlyingHint?.toUpperCase();
  const get = (cells: string[], k: ColKey) => (idx[k] != null ? cells[idx[k]!] : undefined);
  const num = (cells: string[], k: ColKey) => parseNumber(get(cells, k));
  let missing: ChainImport['error'];

  for (const line of lines.slice(headerIdx + 1)) {
    const cells = splitCsvLine(line, delim);
    const occ = parseOcc(get(cells, 'contract') ?? '');
    const expiry = parseExpiry(get(cells, 'expiry')) ?? occ?.expiry ?? null;
    const strike = num(cells, 'strike') ?? occ?.strike ?? null;
    const right = parseRight(get(cells, 'right')) ?? occ?.right ?? null;
    if (strike == null) {
      missing ??= 'noStrike';
      skipped++;
      continue;
    }
    if (!expiry) {
      missing ??= 'noExpiry';
      skipped++;
      continue;
    }
    if (!right) {
      missing ??= 'noRight';
      skipped++;
      continue;
    }
    if (occ && !underlying) underlying = occ.underlying;
    const bid = num(cells, 'bid') ?? 0;
    const ask = num(cells, 'ask') ?? 0;
    const markRaw = num(cells, 'mark');
    const mark = markRaw ?? (bid && ask ? (bid + ask) / 2 : bid || ask);
    let iv = num(cells, 'iv') ?? 0;
    const ivCell = get(cells, 'iv') ?? '';
    if (iv > 0 && iv <= 3 && !ivCell.includes('%')) iv *= 100;
    const dte = daysBetween(today, expiry);
    if (dte < 0) {
      skipped++;
      continue;
    }
    const delta = num(cells, 'delta') ?? 0;
    contracts.push({
      underlying: underlying ?? '',
      contract: get(cells, 'contract')?.trim() || `${underlying ?? ''} ${expiry} ${strike} ${right[0]}`,
      expiry,
      dte,
      strike,
      right,
      bid,
      ask,
      mark: Math.round(mark * 100) / 100,
      // 有的券商看跌期权的 Delta 不带负号
      delta: right === 'PUT' && delta > 0 ? -delta : delta,
      gamma: num(cells, 'gamma') ?? undefined,
      theta: num(cells, 'theta') ?? undefined,
      vega: num(cells, 'vega') ?? undefined,
      iv: Math.round(iv * 100) / 100,
      openInterest: num(cells, 'oi') ?? 0,
      volume: num(cells, 'volume') ?? 0,
    });
  }
  if (underlying) for (const c of contracts) if (!c.underlying) c.underlying = underlying;
  return { contracts, underlying, skipped, columns, error: contracts.length ? undefined : missing ?? 'noStrike' };
}
