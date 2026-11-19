/**
 * 点股票代码时打开的公开行情网站。只是一个链接，不从这些网站拿数据。
 * BRK.B 这类带点的代码：Yahoo 写成 BRK-B。
 */
import type { Settings } from './store';

export const QUOTE_SITES: Record<Settings['quoteSite'], string> = {
  yahoo: 'Yahoo Finance',
  google: 'Google Finance',
  tradingview: 'TradingView',
};

export function quoteUrl(symbol: string, site: Settings['quoteSite'] = 'yahoo'): string {
  const sym = symbol.trim().toUpperCase();
  if (site === 'google') return `https://www.google.com/finance?q=${encodeURIComponent(sym)}`;
  if (site === 'tradingview') return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(sym.replace('.', '-'))}`;
  return `https://finance.yahoo.com/quote/${encodeURIComponent(sym.replace(/\./g, '-'))}`;
}
