/**
 * 持仓导入：券商导出的 CSV，或者每行「代码 数量 成本」的纯文本。
 * 不同券商列名不同，这里按别名找列；成本列分「每股均价」和「总成本」两种，总成本会除以数量。
 * 没有股票代码的行（债券、期权合约）也导入，标成 noQuote，价格固定用导入时的市值。
 */
import type { Holding } from './types';
import type { Lang } from './lang';

export interface ImportResult {
  holdings: Holding[];
  /** 识别到的现金行（如 Schwab 的 Cash & Cash Investments） */
  cash?: number;
  skipped: string[];
  /** 从文件格式猜出来的券商名，用来预填账户名 */
  broker?: string;
}

/** 按导出格式猜券商：Schwab 第一行是 "Positions for account ..."，IBKR 用 "Financial Instrument"，Fidelity 有 "Account Name" 列 */
export function detectBroker(text: string): string | undefined {
  const head = text.slice(0, 2000);
  if (/positions for (account|all-accounts)|mkt val \(market value\)/i.test(head)) return 'Schwab';
  if (/financial instrument|interactive brokers/i.test(head)) return 'IBKR';
  if (/account number\s*,\s*account name/i.test(head)) return 'Fidelity';
  if (/robinhood/i.test(head)) return 'Robinhood';
  if (/webull/i.test(head)) return 'Webull';
  return undefined;
}

const SYMBOL_KEYS = ['symbol', 'ticker', 'financial instrument', '代码', '股票代码', 'instrument'];
const QTY_KEYS = ['qty', 'quantity', 'shares', '数量', '持股数', 'position'];
const AVG_COST_KEYS = ['average cost', 'avg cost', 'average price', 'avg price', 'cost per share', 'unit cost', '均价', '成本价', '平均成本'];
const TOTAL_COST_KEYS = ['cost basis', 'total cost', '总成本', '持仓成本'];
const PRICE_KEYS = ['price', 'last price', 'last', 'current price', '现价', '最新价'];
const MV_KEYS = ['market value', 'mkt val', 'value', '市值'];
const NAME_KEYS = ['description', 'name', 'security name', '名称'];

/** 解析一个金额/数字单元格："$1,234.50"、"(12.3)"、"−5" */
export function parseNumber(raw: string | undefined): number | null {
  if (raw == null) return null;
  let s = raw.trim().replace(/[$,\s%]/g, '').replace(/[−–]/g, '-');
  if (!s || s === '--' || s.toUpperCase() === 'N/A') return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  const v = Number(s);
  if (!Number.isFinite(v)) return null;
  return neg ? -v : v;
}

/** 简单 CSV 拆行：支持引号包裹、引号内逗号、"" 转义；也支持制表符 */
export function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === delim) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function findCol(headers: string[], keys: string[]): number {
  const norm = headers.map((h) => h.toLowerCase().replace(/\s+/g, ' ').trim());
  // 先精确匹配，再前缀/包含匹配（Schwab 是 "Qty (Quantity)"、"Mkt Val (Market Value)"）
  for (const k of keys) {
    const i = norm.indexOf(k);
    if (i >= 0) return i;
  }
  for (const k of keys) {
    const i = norm.findIndex((h) => h.startsWith(k + ' ') || h.startsWith(k + '(') || h.includes(`(${k})`));
    if (i >= 0) return i;
  }
  return -1;
}

const SYMBOL_RE = /^[A-Z][A-Z0-9.\-/]{0,9}$/;

export function parseHoldingsCsv(text: string, lang: Lang = 'zh'): ImportResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const skipped: string[] = [];
  if (!lines.length) return { holdings: [], skipped };
  const delim = (lines.find((l) => l.includes('\t')) ? '\t' : ',') as string;

  // 表头不一定在第一行（Schwab 第一行是账户标题），找第一行同时含代码列和数量列的
  let headerIdx = -1;
  let headers: string[] = [];
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const cells = splitCsvLine(lines[i]!, delim);
    if (findCol(cells, SYMBOL_KEYS) >= 0 && findCol(cells, QTY_KEYS) >= 0) {
      headerIdx = i;
      headers = cells;
      break;
    }
  }
  if (headerIdx < 0) return { holdings: [], skipped: [lang === 'zh' ? '没找到包含「代码」和「数量」的表头' : 'No header row with symbol and quantity columns found'] };

  const cSym = findCol(headers, SYMBOL_KEYS);
  const cQty = findCol(headers, QTY_KEYS);
  const cAvg = findCol(headers, AVG_COST_KEYS);
  const cTotal = findCol(headers, TOTAL_COST_KEYS);
  const cPrice = findCol(headers, PRICE_KEYS);
  const cMv = findCol(headers, MV_KEYS);
  const cName = findCol(headers, NAME_KEYS);

  const holdings: Holding[] = [];
  let cash: number | undefined;
  for (const line of lines.slice(headerIdx + 1)) {
    const cells = splitCsvLine(line, delim);
    const rawSym = (cells[cSym] ?? '').trim();
    const sym = rawSym.toUpperCase();
    if (/cash/i.test(rawSym)) {
      const mv = parseNumber(cells[cMv]);
      if (mv != null) cash = (cash ?? 0) + mv;
      continue;
    }
    const qty = parseNumber(cells[cQty]);
    const totalCost = cTotal >= 0 ? parseNumber(cells[cTotal]) : null;
    const price = cPrice >= 0 ? parseNumber(cells[cPrice]) : null;
    const name = cName >= 0 ? (cells[cName] ?? '').trim() : '';
    if (!SYMBOL_RE.test(sym)) {
      // 债券、期权合约等：只有一段描述，没有股票代码。用市值 ÷ 数量当价格（债券报价是每 100 面值、
      // 期权是每股，直接乘数量会差 10 倍或 100 倍），成本用总成本 ÷ 数量，两边单位一致
      const mv = cMv >= 0 ? parseNumber(cells[cMv]) : null;
      const unit = mv != null && qty ? mv / qty : price;
      if (rawSym && !/total/i.test(rawSym) && qty != null && qty > 0 && unit != null && unit > 0) {
        const avg = cAvg >= 0 ? parseNumber(cells[cAvg]) : null;
        const unitCost = totalCost != null && mv != null ? totalCost / qty : mv == null ? avg : null;
        holdings.push({
          symbol: rawSym.replace(/\s+/g, ' ').slice(0, 40),
          name: name && name !== '--' && name !== rawSym ? `${rawSym} · ${name}` : rawSym,
          qty,
          costBasis: unitCost != null && unitCost > 0 ? Math.round(unitCost * 10000) / 10000 : unit,
          manualPrice: Math.round(unit * 10000) / 10000,
          noQuote: true,
        });
      } else if (rawSym && !/total/i.test(rawSym)) skipped.push(rawSym);
      continue;
    }
    if (qty == null || qty <= 0) {
      if (rawSym && !/total/i.test(rawSym)) skipped.push(rawSym);
      continue;
    }
    let cost: number | null = null;
    if (cAvg >= 0) cost = parseNumber(cells[cAvg]);
    if (cost == null && totalCost != null) cost = totalCost / qty;
    holdings.push({
      symbol: sym,
      qty,
      costBasis: cost != null && cost > 0 ? Math.round(cost * 10000) / 10000 : (price ?? 0),
      ...(price != null && price > 0 ? { manualPrice: price } : {}),
      ...(name && name !== '--' ? { name } : {}),
    });
  }
  return { holdings, cash, skipped, broker: detectBroker(text) };
}

/** 每行「代码 数量 [每股成本]」，空格、逗号或制表符分隔 */
export function parseHoldingsText(text: string): ImportResult {
  const holdings: Holding[] = [];
  const skipped: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const parts = t.split(/[\s,\t]+/);
    const sym = (parts[0] ?? '').toUpperCase();
    const qty = parseNumber(parts[1]);
    const cost = parseNumber(parts[2]);
    if (!SYMBOL_RE.test(sym) || qty == null || qty <= 0) {
      skipped.push(t);
      continue;
    }
    holdings.push({ symbol: sym, qty, costBasis: cost ?? 0 });
  }
  return { holdings, skipped };
}

/** 合并：同一账户里的同一代码以新导入的为准，不同账户的同一代码各自保留 */
export function mergeHoldings(existing: Holding[], incoming: Holding[]): Holding[] {
  const k = (h: Holding) => `${h.account?.trim() ?? ''}|${h.symbol.toUpperCase()}`;
  const map = new Map(existing.map((h) => [k(h), h]));
  for (const h of incoming) {
    const sym = h.symbol.toUpperCase();
    map.set(k(h), { ...map.get(k(h)), ...h, symbol: sym });
  }
  return [...map.values()];
}
