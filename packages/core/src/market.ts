/**
 * 美股交易时段：用来决定什么时候自动刷新行情、顶栏显示「盘中 / 已收盘」。
 * 时间按美东（America/New_York）算，夏令时由 Intl 处理；休市和提前收盘用 calendar.ts 里的官方日程表。
 */
import { MACRO_CALENDAR } from './calendar';

export type MarketState = 'pre' | 'open' | 'post' | 'closed';

export interface MarketSession {
  state: MarketState;
  /** 美东日期 YYYY-MM-DD */
  date: string;
  /** 美东时间，从 0 点起的分钟数 */
  minute: number;
  /** 当天常规交易结束的分钟数（16:00 = 960，提前收盘 13:00 = 780）；休市日为 null */
  closeMinute: number | null;
}

const OPEN = 9 * 60 + 30;
const CLOSE = 16 * 60;
const PRE_START = 4 * 60;
const POST_END = 20 * 60;

const NY = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  weekday: 'short',
  hourCycle: 'h23',
});

/** 某一刻在美东的日期、星期、分钟 */
export function nyClock(at: Date): { date: string; weekday: string; minute: number } {
  const p: Record<string, string> = {};
  for (const part of NY.formatToParts(at)) p[part.type] = part.value;
  return { date: `${p.year}-${p.month}-${p.day}`, weekday: p.weekday ?? '', minute: Number(p.hour) * 60 + Number(p.minute) };
}

const CLOSED_DAYS = new Set(MACRO_CALENDAR.filter((r) => r.kind === 'closed').map((r) => r.date));
const EARLY_DAYS = new Set(MACRO_CALENDAR.filter((r) => r.kind === 'early_close').map((r) => r.date));

export function usMarketSession(at: Date): MarketSession {
  const { date, weekday, minute } = nyClock(at);
  if (weekday === 'Sat' || weekday === 'Sun' || CLOSED_DAYS.has(date)) return { state: 'closed', date, minute, closeMinute: null };
  const close = EARLY_DAYS.has(date) ? 13 * 60 : CLOSE;
  let state: MarketState = 'closed';
  if (minute >= OPEN && minute < close) state = 'open';
  else if (minute >= PRE_START && minute < OPEN) state = 'pre';
  else if (minute >= close && minute < POST_END) state = 'post';
  return { state, date, minute, closeMinute: close };
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function isTradingDay(date: string): boolean {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd !== 0 && wd !== 6 && !CLOSED_DAYS.has(date);
}

/** from 和 to 之间（美东时间）有没有常规交易时段：有的话 from 时拿到的价格已经过时 */
export function tradedBetween(from: Date, to: Date): boolean {
  if (to <= from) return false;
  const a = nyClock(from);
  const b = nyClock(to);
  // 隔了十天以上肯定有交易日
  if (to.getTime() - from.getTime() > 10 * 864e5) return true;
  for (let day = a.date; day <= b.date; day = addDays(day, 1)) {
    if (!isTradingDay(day)) continue;
    const close = EARLY_DAYS.has(day) ? 13 * 60 : CLOSE;
    const start = day === a.date ? Math.max(OPEN, a.minute) : OPEN;
    const end = day === b.date ? Math.min(close, b.minute) : close;
    if (start < end) return true;
  }
  return false;
}

/**
 * 现在要不要自动刷新行情：
 * - 盘中：距上次刷新超过 intervalMin 分钟就刷；
 * - 不在盘中：上次刷新之后又有过交易（比如昨天收盘后刷的，今天收盘后才打开），刷一次拿最新收盘价；
 * - 从来没刷过：刷。
 */
export function shouldAutoRefresh(now: Date, lastFetch: Date | null, intervalMin: number): boolean {
  if (intervalMin <= 0) return false;
  if (!lastFetch) return true;
  const ageMin = (now.getTime() - lastFetch.getTime()) / 60000;
  if (usMarketSession(now).state === 'open') return ageMin >= intervalMin;
  // 收盘后数据源可能晚几分钟才定下收盘价，至少隔几分钟再拉
  return tradedBetween(lastFetch, now) && ageMin >= Math.min(intervalMin, 5);
}
