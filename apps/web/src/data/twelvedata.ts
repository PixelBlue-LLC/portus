/**
 * Twelve Data 适配器：日线收盘价，用来算相关性和实际波动率。
 * Finnhub 免费档不给 K 线，所以另接一家。用户自己的 key，浏览器直连（已实测返回 Access-Control-Allow-Origin: *）。
 * 免费档每分钟 8 次、每天 800 次：一次请求最多 8 个代码，超过就等一分钟再拉下一批。
 */
import type { DailyBar } from 'portus-core';
import { t } from '../i18n';

const BASE = 'https://api.twelvedata.com';
/** 约半年交易日再多几天，够算 126 日相关性 */
export const HISTORY_DAYS = 140;
const PER_MINUTE = 8;

interface TdSeries {
  status?: string;
  code?: number;
  message?: string;
  values?: Array<{ datetime: string; close: string }>;
}

export interface HistoryFetch {
  bars: Record<string, DailyBar[]>;
  errors: string[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function toBars(s: TdSeries): DailyBar[] {
  return (s.values ?? [])
    .map((v) => ({ date: v.datetime.slice(0, 10), close: Number(v.close) }))
    .filter((b) => Number.isFinite(b.close) && b.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function batch(symbols: string[], key: string): Promise<Record<string, TdSeries>> {
  const qs = new URLSearchParams({ symbol: symbols.join(','), interval: '1day', outputsize: String(HISTORY_DAYS), apikey: key }).toString();
  let res: Response;
  try {
    res = await fetch(`${BASE}/time_series?${qs}`);
  } catch {
    throw new Error(t('err.tdNet'));
  }
  if (!res.ok) throw new Error(t('err.tdStatus', { s: res.status }));
  const json = (await res.json()) as TdSeries & Record<string, TdSeries>;
  // 一个代码时直接返回那一只；多个代码时按代码分组
  if (symbols.length === 1) return { [symbols[0]!]: json };
  if (json.status === 'error') return Object.fromEntries(symbols.map((s) => [s, json]));
  return json;
}

/** onProgress(已完成, 总数)，页面用来显示进度 */
export async function fetchDaily(symbols: string[], key: string, onProgress?: (done: number, total: number) => void): Promise<HistoryFetch> {
  const uniq = [...new Set(symbols.map((s) => s.toUpperCase()))];
  const bars: Record<string, DailyBar[]> = {};
  const errors = new Set<string>();
  for (let i = 0; i < uniq.length; i += PER_MINUTE) {
    if (i > 0) await sleep(61_000);
    const chunk = uniq.slice(i, i + PER_MINUTE);
    try {
      const r = await batch(chunk, key);
      for (const sym of chunk) {
        const s = r[sym];
        if (!s || s.status === 'error') {
          if (s?.code === 401 || s?.code === 403) errors.add(t('err.tdKey'));
          else if (s?.code === 429) errors.add(t('err.tdRate'));
          else errors.add(t('err.tdSymbol', { s: sym }));
          continue;
        }
        bars[sym] = toBars(s);
      }
    } catch (e) {
      errors.add(e instanceof Error ? e.message : String(e));
    }
    onProgress?.(Math.min(i + PER_MINUTE, uniq.length), uniq.length);
  }
  return { bars, errors: [...errors] };
}
