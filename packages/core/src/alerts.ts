/**
 * 规则提醒：用户自己设的条件，比如「NVDA 跌破 $150」「单一行业超过 60%」。
 * 这里只判断条件有没有满足、把事实写出来，不给任何操作建议。
 */
import { nameIn, type Lang } from './lang';
import type { PortfolioView, Quote } from './types';

export type AlertRule =
  | { id: string; type: 'price_below' | 'price_above'; symbol: string; value: number }
  /** 当日涨跌幅绝对值 ≥ value%；不填 symbol = 任意一只持仓 */
  | { id: string; type: 'day_move'; symbol?: string; value: number }
  /** 相对成本亏损 ≥ value%；不填 symbol = 任意一只持仓 */
  | { id: string; type: 'loss_from_cost'; symbol?: string; value: number }
  /** 某只持仓占总资产 > value% */
  | { id: string; type: 'weight_above'; symbol: string; value: number }
  /** 某个行业（或「任意行业」）占总资产 > value% */
  | { id: string; type: 'sector_above'; sector?: string; value: number };

export type AlertType = AlertRule['type'];
export const ALERT_TYPES: AlertType[] = ['price_below', 'price_above', 'day_move', 'loss_from_cost', 'weight_above', 'sector_above'];

export interface AlertHit {
  id: string;
  type: AlertType;
  /** 触发的是哪只股票或哪个行业 */
  subject: string;
  /** 实际值：价格、涨跌幅%、亏损%、占比% */
  actual: number;
  value: number;
  /** 一句话事实，如「NVDA 现价 $148.20，已跌破你设的 $150」 */
  text: string;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const r1 = (v: number) => Math.round(v * 10) / 10;
const usd = (v: number) => `$${r2(v).toFixed(2)}`;

/** 规则本身的描述，用在规则列表里 */
export function describeAlert(rule: AlertRule, lang: Lang = 'zh'): string {
  const zh = lang === 'zh';
  switch (rule.type) {
    case 'price_below':
      return zh ? `${rule.symbol} 跌破 ${usd(rule.value)}` : `${rule.symbol} falls below ${usd(rule.value)}`;
    case 'price_above':
      return zh ? `${rule.symbol} 涨过 ${usd(rule.value)}` : `${rule.symbol} rises above ${usd(rule.value)}`;
    case 'day_move': {
      const who = rule.symbol ?? (zh ? '任意持仓' : 'Any holding');
      return zh ? `${who} 单日涨跌超过 ${rule.value}%` : `${who} moves more than ${rule.value}% in a day`;
    }
    case 'loss_from_cost': {
      const who = rule.symbol ?? (zh ? '任意持仓' : 'Any holding');
      return zh ? `${who} 比成本亏损超过 ${rule.value}%` : `${who} is down more than ${rule.value}% from cost`;
    }
    case 'weight_above':
      return zh ? `${rule.symbol} 占总资产超过 ${rule.value}%` : `${rule.symbol} is more than ${rule.value}% of the portfolio`;
    case 'sector_above': {
      const s = rule.sector ? nameIn(rule.sector, lang) : zh ? '任意行业' : 'Any sector';
      return zh ? `${s} 占总资产超过 ${rule.value}%` : `${s} is more than ${rule.value}% of the portfolio`;
    }
  }
}

/** 规则里出现、但不一定持有的代码（要额外拉行情） */
export function alertSymbols(rules: AlertRule[]): string[] {
  const out = new Set<string>();
  for (const r of rules) if ('symbol' in r && r.symbol) out.add(r.symbol.toUpperCase());
  return [...out];
}

/**
 * 逐条判断。价格优先用行情；没持有也没行情的代码跳过（不会误报）。
 * 结果按规则顺序排列，一条「任意持仓」规则可能触发多次。
 */
export function evaluateAlerts(rules: AlertRule[], view: PortfolioView, quotes: Record<string, Quote>, lang: Lang = 'zh'): AlertHit[] {
  const zh = lang === 'zh';
  const pos = new Map(view.positions.map((p) => [p.symbol, p]));
  const priceOf = (sym: string): number | null => {
    const q = quotes[sym];
    if (q && q.price > 0) return q.price;
    const p = pos.get(sym);
    return p && p.priceSource !== 'cost' ? p.price : null;
  };
  const hits: AlertHit[] = [];

  for (const rule of rules) {
    switch (rule.type) {
      case 'price_below':
      case 'price_above': {
        const sym = rule.symbol.toUpperCase();
        const price = priceOf(sym);
        if (price == null) break;
        const below = rule.type === 'price_below';
        if (below ? price < rule.value : price > rule.value) {
          const text = zh
            ? `${sym} 现价 ${usd(price)}，已${below ? '跌破' : '涨过'}你设的 ${usd(rule.value)}`
            : `${sym} is at ${usd(price)}, ${below ? 'below' : 'above'} your ${usd(rule.value)} level`;
          hits.push({ id: rule.id, type: rule.type, subject: sym, actual: r2(price), value: rule.value, text });
        }
        break;
      }
      case 'day_move': {
        const targets = rule.symbol ? [rule.symbol.toUpperCase()] : [...pos.keys()];
        for (const sym of targets) {
          const pct = quotes[sym]?.changePct ?? pos.get(sym)?.dayPct ?? null;
          if (pct == null || Math.abs(pct) < rule.value) continue;
          const text = zh
            ? `${sym} 今天${pct >= 0 ? '涨' : '跌'} ${r1(Math.abs(pct))}%，超过你设的 ${rule.value}%`
            : `${sym} is ${pct >= 0 ? 'up' : 'down'} ${r1(Math.abs(pct))}% today, past your ${rule.value}% limit`;
          hits.push({ id: rule.id, type: rule.type, subject: sym, actual: r1(pct), value: rule.value, text });
        }
        break;
      }
      case 'loss_from_cost': {
        const targets = rule.symbol ? [rule.symbol.toUpperCase()] : [...pos.keys()];
        for (const sym of targets) {
          const p = pos.get(sym);
          if (!p || p.totalPct == null || p.priceSource === 'cost') continue;
          if (-p.totalPct < rule.value) continue;
          const loss = r1(-p.totalPct);
          const text = zh
            ? `${sym} 比成本亏损 ${loss}%，超过你设的 ${rule.value}%`
            : `${sym} is down ${loss}% from your cost, past your ${rule.value}% limit`;
          hits.push({ id: rule.id, type: rule.type, subject: sym, actual: -loss, value: rule.value, text });
        }
        break;
      }
      case 'weight_above': {
        const sym = rule.symbol.toUpperCase();
        const p = pos.get(sym);
        if (!p || !view.totalValue) break;
        const pct = r1((p.marketValue / view.totalValue) * 100);
        if (pct > rule.value) {
          const text = zh ? `${sym} 占总资产 ${pct}%，超过你设的 ${rule.value}%` : `${sym} is ${pct}% of the portfolio, above your ${rule.value}% limit`;
          hits.push({ id: rule.id, type: rule.type, subject: sym, actual: pct, value: rule.value, text });
        }
        break;
      }
      case 'sector_above': {
        if (!view.totalValue) break;
        const by = new Map<string, number>();
        for (const p of view.positions) by.set(p.sector, (by.get(p.sector) ?? 0) + p.marketValue);
        const sectors = rule.sector ? [rule.sector] : [...by.keys()];
        for (const s of sectors) {
          const pct = r1(((by.get(s) ?? 0) / view.totalValue) * 100);
          if (pct <= rule.value) continue;
          const name = nameIn(s, lang);
          const text = zh ? `${name} 占总资产 ${pct}%，超过你设的 ${rule.value}%` : `${name} is ${pct}% of the portfolio, above your ${rule.value}% limit`;
          hits.push({ id: rule.id, type: rule.type, subject: s, actual: pct, value: rule.value, text });
        }
        break;
      }
    }
  }
  return hits;
}
