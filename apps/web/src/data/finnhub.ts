/**
 * Finnhub 适配器：行情、52 周高低、公司新闻、财报日历。
 * 用户自己的 key，直接从浏览器调用；免费档每分钟 60 次，所以并发限制为 4 并顺序排队。
 */
import { t } from '../i18n';
import { SECTOR_ETFS, type NewsItem, type Quote, type SectorPerf } from 'portus-core';

const BASE = 'https://finnhub.io/api/v1';

export class SourceError extends Error {}

/**
 * 免费档每分钟 60 次。所有请求先过这里排队：最近 60 秒内已经发了 LIMIT 次就等到最早那次满 60 秒。
 * 留几次余量给同一个 key 在别处的使用。
 */
const LIMIT = 55;
const sent: number[] = [];
async function slot(): Promise<void> {
  for (;;) {
    const now = Date.now();
    while (sent.length && now - sent[0]! >= 60000) sent.shift();
    if (sent.length < LIMIT) {
      sent.push(now);
      return;
    }
    await new Promise((r) => setTimeout(r, 60000 - (now - sent[0]!) + 50));
  }
}

async function get<T>(path: string, params: Record<string, string>, key: string, retried = false): Promise<T> {
  const qs = new URLSearchParams({ ...params, token: key }).toString();
  await slot();
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}?${qs}`);
  } catch {
    throw new SourceError(t('err.finnhubNet'));
  }
  if (res.status === 401 || res.status === 403) throw new SourceError(t('err.finnhubKey'));
  // 被限流（同一个 key 在别处也在用）：等一会儿再试一次
  if (res.status === 429 && !retried) {
    await new Promise((r) => setTimeout(r, 15000));
    return get<T>(path, params, key, true);
  }
  if (res.status === 429) throw new SourceError(t('err.finnhubRate'));
  if (!res.ok) throw new SourceError(t('err.finnhubStatus', { s: res.status }));
  return (await res.json()) as T;
}

async function pool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<Array<R | Error>> {
  const out: Array<R | Error> = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try {
        out[idx] = await fn(items[idx]!);
      } catch (e) {
        out[idx] = e instanceof Error ? e : new Error(String(e));
      }
    }
  });
  await Promise.all(workers);
  return out;
}

interface FhQuote { c: number; dp: number | null; pc: number; t: number }
interface FhMetric { metric?: { '52WeekHigh'?: number; '52WeekLow'?: number } }
interface FhNews { headline: string; source: string; url: string; datetime: number; summary?: string }
interface FhProfile { finnhubIndustry?: string; name?: string }
interface FhEarnings { earningsCalendar?: Array<{ date: string; symbol: string; hour?: string }> }

const ymd = (d: Date) => d.toISOString().slice(0, 10);
export const NEWS_DAYS = 15;
export const NEWS_PER_SYMBOL = 10;

export interface MarketFetch {
  quotes: Record<string, Quote>;
  sectors: SectorPerf[];
  news: NewsItem[];
  earnings: Record<string, string>;
  earningsHour: Record<string, string>;
  /** 这次新查到的行业（只查缓存里没有的代码） */
  industries: Record<string, string>;
  errors: string[];
}

function toQuote(s: string, r: FhQuote): Quote {
  return { symbol: s, price: r.c, changePct: r.dp, prevClose: r.pc, asOf: new Date((r.t || Date.now() / 1000) * 1000).toISOString() };
}

/** 几只股票最近几天的新闻标题（板块解读用），每只最多 n 条 */
export async function fetchHeadlines(symbols: string[], key: string, days = 2, n = 3): Promise<Record<string, string[]>> {
  const to = new Date();
  const from = new Date(to.getTime() - days * 864e5);
  const res = await pool(symbols, 3, (s) => get<FhNews[]>('/company-news', { symbol: s, from: ymd(from), to: ymd(to) }, key));
  const out: Record<string, string[]> = {};
  symbols.forEach((s, i) => {
    const r = res[i];
    if (!r || r instanceof Error) return;
    const titles = r.sort((a, b) => b.datetime - a.datetime).slice(0, n).map((x) => x.headline);
    if (titles.length) out[s] = titles;
  });
  return out;
}

/** 只拉报价（持仓 + 板块 ETF + 额外代码），给自动刷新用：每只 1 次请求，不碰新闻和财报 */
export async function fetchQuotes(symbols: string[], key: string, withSectors = true): Promise<{ quotes: Record<string, Quote>; sectors: SectorPerf[]; errors: string[] }> {
  const sectorSyms = withSectors ? Object.keys(SECTOR_ETFS) : [];
  const all = [...new Set([...symbols.map((s) => s.toUpperCase()), ...sectorSyms])];
  const res = await pool(all, 4, (s) => get<FhQuote>('/quote', { symbol: s }, key));
  const quotes: Record<string, Quote> = {};
  const errors = new Set<string>();
  all.forEach((s, i) => {
    const r = res[i];
    if (r instanceof Error) errors.add(r.message);
    else if (r && r.c > 0) quotes[s] = toQuote(s, r);
  });
  const sectors = sectorSyms
    .filter((s) => quotes[s]?.changePct != null)
    .map((s) => ({ symbol: s, name: SECTOR_ETFS[s]!, changePct: quotes[s]!.changePct! }));
  return { quotes, sectors, errors: [...errors] };
}

/**
 * extraSymbols：只要报价的代码（提醒规则、分批计划、相关性候选里出现但没持有的），不查新闻和行业。
 */
export async function fetchMarket(symbols: string[], key: string, knownIndustries: Record<string, string> = {}, extraSymbols: string[] = []): Promise<MarketFetch> {
  const errors = new Set<string>();
  const note = (r: unknown) => {
    if (r instanceof Error) errors.add(r.message);
  };
  const uniq = [...new Set(symbols.map((s) => s.toUpperCase()))];
  const sectorSyms = Object.keys(SECTOR_ETFS);
  const allQuoteSyms = [...new Set([...uniq, ...sectorSyms, ...extraSymbols.map((x) => x.toUpperCase())])];

  const quoteRes = await pool(allQuoteSyms, 4, (s) => get<FhQuote>('/quote', { symbol: s }, key));
  const quotes: Record<string, Quote> = {};
  allQuoteSyms.forEach((s, i) => {
    const r = quoteRes[i];
    note(r);
    if (r && !(r instanceof Error) && r.c > 0) {
      quotes[s] = toQuote(s, r);
    }
  });

  const metricRes = await pool(uniq, 4, (s) => get<FhMetric>('/stock/metric', { symbol: s, metric: 'all' }, key));
  uniq.forEach((s, i) => {
    const r = metricRes[i];
    if (r && !(r instanceof Error) && quotes[s]) {
      quotes[s] = { ...quotes[s]!, high52: r.metric?.['52WeekHigh'], low52: r.metric?.['52WeekLow'] };
    }
  });

  const sectors: SectorPerf[] = sectorSyms
    .filter((s) => quotes[s]?.changePct != null)
    .map((s) => ({ symbol: s, name: SECTOR_ETFS[s]!, changePct: quotes[s]!.changePct! }));

  const to = new Date();
  // 每只持仓：最近 15 天，最多 10 条
  const from = new Date(to.getTime() - NEWS_DAYS * 864e5);
  const newsRes = await pool(uniq, 4, (s) => get<FhNews[]>('/company-news', { symbol: s, from: ymd(from), to: ymd(to) }, key));
  const cutoff = from.getTime();
  const news: NewsItem[] = [];
  uniq.forEach((s, i) => {
    const r = newsRes[i];
    note(r);
    if (!r || r instanceof Error) return;
    const recent = r.filter((n) => n.datetime * 1000 >= cutoff).sort((a, b) => b.datetime - a.datetime);
    for (const n of recent.slice(0, NEWS_PER_SYMBOL)) {
      news.push({ symbol: s, title: n.headline, source: n.source, url: n.url, publishedAt: new Date(n.datetime * 1000).toISOString(), summary: n.summary });
    }
  });
  news.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  const earnings: Record<string, string> = {};
  const earningsHour: Record<string, string> = {};
  try {
    // 日历页往后看 60 天
    const ahead = new Date(to.getTime() + 60 * 864e5);
    const r = await get<FhEarnings>('/calendar/earnings', { from: ymd(to), to: ymd(ahead) }, key);
    const held = new Set(uniq);
    for (const e of r.earningsCalendar ?? []) {
      if (!held.has(e.symbol) || earnings[e.symbol]) continue;
      earnings[e.symbol] = e.date;
      if (e.hour) earningsHour[e.symbol] = e.hour;
    }
  } catch (e) {
    note(e);
  }

  // 行业分类用 Finnhub 的公司资料；ETF 没有，记成空串下次不再查
  const missing = uniq.filter((s) => !(s in knownIndustries));
  const industries: Record<string, string> = {};
  const profRes = await pool(missing, 4, (s) => get<FhProfile>('/stock/profile2', { symbol: s }, key));
  missing.forEach((s, i) => {
    const r = profRes[i];
    if (r instanceof Error) return; // 网络错误下次再试
    industries[s] = r?.finnhubIndustry ?? '';
  });

  return { quotes, sectors, news, earnings, earningsHour, industries, errors: [...errors] };
}
