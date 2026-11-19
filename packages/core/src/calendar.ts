/**
 * 事件日历：持仓公司的财报日 + 美国宏观日程（议息、CPI、非农）+ 美股休市和提前收盘。
 * 宏观日程是公开的官方日程表，在这里维护一张表，每年更新一次：
 *   议息  federalreserve.gov/monetarypolicy/fomccalendars.htm
 *   CPI   bls.gov/schedule/news_release/cpi.htm
 *   非农  bls.gov/schedule/news_release/empsit.htm
 *   休市  nyse.com/markets/hours-calendars
 * 时间都是美东时间（ET）。
 */
import type { Lang } from './lang';

export type EventKind = 'earnings' | 'fomc' | 'cpi' | 'jobs' | 'closed' | 'early_close';

interface MacroRow {
  date: string;
  kind: Exclude<EventKind, 'earnings'>;
  /** 美东时间 HH:MM；休市没有时间 */
  time?: string;
  /** 不同于默认标题时才填 */
  zh?: string;
  en?: string;
}

/** 表里最后一天，过了这天要更新这张表 */
export const MACRO_CALENDAR_END = '2027-12-31';
export const MACRO_CALENDAR_CHECKED = '2026-11-17';

const fomc = (date: string, extra?: Partial<MacroRow>): MacroRow => ({ date, kind: 'fomc', time: '14:00', ...extra });
const cpi = (date: string): MacroRow => ({ date, kind: 'cpi', time: '08:30' });
const jobs = (date: string): MacroRow => ({ date, kind: 'jobs', time: '08:30' });
const closed = (date: string, zh: string, en: string): MacroRow => ({ date, kind: 'closed', zh, en });
const early = (date: string, zh: string, en: string): MacroRow => ({ date, kind: 'early_close', time: '13:00', zh, en });

export const MACRO_CALENDAR: MacroRow[] = [
  // 议息：会议第二天 14:00 公布决议
  fomc('2026-01-28'), fomc('2026-03-18'), fomc('2026-04-29'), fomc('2026-06-17'),
  fomc('2026-07-29'), fomc('2026-09-16'), fomc('2026-10-28'), fomc('2026-12-09'),
  fomc('2027-01-27'), fomc('2027-03-17'), fomc('2027-04-28'), fomc('2027-06-09'),
  fomc('2027-07-28'), fomc('2027-09-15'),
  // 2026-11-12 美联储修订：10 月这次只讨论货币政策框架，不公布利率决议
  fomc('2027-10-27', { time: undefined, zh: '美联储策略会议（不公布利率决议）', en: 'Fed strategy meeting (no rate decision)' }),
  fomc('2027-12-08'),
  // CPI（上个月的数据）
  cpi('2026-11-10'), cpi('2026-12-10'),
  cpi('2027-01-13'), cpi('2027-02-11'), cpi('2027-03-10'), cpi('2027-04-13'), cpi('2027-05-12'), cpi('2027-06-10'),
  cpi('2027-07-14'), cpi('2027-08-11'), cpi('2027-09-14'), cpi('2027-10-14'), cpi('2027-11-10'), cpi('2027-12-10'),
  // 非农（就业报告）
  jobs('2026-11-06'), jobs('2026-12-04'),
  jobs('2027-01-08'), jobs('2027-02-05'), jobs('2027-03-05'), jobs('2027-04-02'), jobs('2027-05-07'), jobs('2027-06-04'),
  jobs('2027-07-02'), jobs('2027-08-06'), jobs('2027-09-03'), jobs('2027-10-08'), jobs('2027-11-05'), jobs('2027-12-03'),
  // 美股休市和提前收盘（NYSE、Nasdaq）
  closed('2026-11-26', '感恩节休市', 'Thanksgiving, market closed'),
  early('2026-11-27', '感恩节次日，13:00 提前收盘', 'Day after Thanksgiving, early close 1:00 p.m.'),
  early('2026-12-24', '平安夜，13:00 提前收盘', 'Christmas Eve, early close 1:00 p.m.'),
  closed('2026-12-25', '圣诞节休市', 'Christmas, market closed'),
  closed('2027-01-01', '元旦休市', "New Year's Day, market closed"),
  closed('2027-01-18', '马丁·路德·金纪念日休市', 'Martin Luther King Jr. Day, market closed'),
  closed('2027-02-15', '总统日休市', "Presidents' Day, market closed"),
  closed('2027-03-26', '耶稣受难日休市', 'Good Friday, market closed'),
  closed('2027-05-31', '阵亡将士纪念日休市', 'Memorial Day, market closed'),
  closed('2027-06-18', '六月节（补休）休市', 'Juneteenth (observed), market closed'),
  closed('2027-07-05', '独立日（补休）休市', 'Independence Day (observed), market closed'),
  closed('2027-09-06', '劳动节休市', 'Labor Day, market closed'),
  closed('2027-11-25', '感恩节休市', 'Thanksgiving, market closed'),
  early('2027-11-26', '感恩节次日，13:00 提前收盘', 'Day after Thanksgiving, early close 1:00 p.m.'),
  closed('2027-12-24', '圣诞节（补休）休市', 'Christmas (observed), market closed'),
];

export interface MarketEvent {
  /** YYYY-MM-DD */
  date: string;
  kind: EventKind;
  /** 美东时间 HH:MM；没有就是全天 */
  time?: string;
  /** 财报时段：bmo 盘前、dmh 盘中、amc 盘后（Finnhub 给的，没有具体时间） */
  session?: 'bmo' | 'dmh' | 'amc';
  symbol?: string;
  title: string;
}

/** 排序用的美东时间：有具体时间用时间；财报按时段排（盘前在开盘前、盘后在收盘后）；全天事件排最前 */
export function eventSortTime(e: Pick<MarketEvent, 'time' | 'session'>): string {
  if (e.time) return e.time;
  if (e.session === 'bmo') return '09:00';
  if (e.session === 'dmh') return '12:00';
  if (e.session === 'amc') return '16:01';
  return '00:00';
}

const DEFAULT_TITLE: Record<Exclude<EventKind, 'earnings' | 'closed' | 'early_close'>, [string, string]> = {
  fomc: ['美联储议息决议', 'Fed rate decision (FOMC)'],
  cpi: ['CPI 通胀数据', 'CPI inflation report'],
  jobs: ['非农就业报告', 'Jobs report (nonfarm payrolls)'],
};

const EARNINGS_HOUR: Record<string, [string, string]> = {
  bmo: ['盘前', 'before the open'],
  amc: ['盘后', 'after the close'],
  dmh: ['盘中', 'during market hours'],
};

export interface CalendarInput {
  /** 代码 → YYYY-MM-DD */
  earnings: Record<string, string>;
  /** 代码 → bmo / amc / dmh（Finnhub 给的时段，可缺） */
  earningsHour?: Record<string, string>;
  /** 从哪天开始（含），YYYY-MM-DD */
  from: string;
  /** 往后看多少天 */
  days: number;
  kinds?: EventKind[];
  lang?: Lang;
}

const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** 合并财报和宏观日程，按日期、时间排序 */
export function buildCalendar(input: CalendarInput): MarketEvent[] {
  const lang = input.lang ?? 'zh';
  const i = lang === 'zh' ? 0 : 1;
  const to = addDays(input.from, input.days);
  const want = new Set(input.kinds ?? (['earnings', 'fomc', 'cpi', 'jobs', 'closed', 'early_close'] as EventKind[]));
  const inRange = (d: string) => d >= input.from && d < to;
  const out: MarketEvent[] = [];

  if (want.has('earnings')) {
    for (const [symbol, date] of Object.entries(input.earnings)) {
      if (!inRange(date)) continue;
      const hour = input.earningsHour?.[symbol];
      const when = hour && EARNINGS_HOUR[hour] ? EARNINGS_HOUR[hour]![i] : '';
      const title = lang === 'zh' ? `${symbol} 财报${when ? `（${when}）` : ''}` : `${symbol} earnings${when ? ` (${when})` : ''}`;
      const session = hour === 'bmo' || hour === 'dmh' || hour === 'amc' ? hour : undefined;
      out.push({ date, kind: 'earnings', symbol, title, ...(session ? { session } : {}) });
    }
  }
  for (const row of MACRO_CALENDAR) {
    if (!want.has(row.kind) || !inRange(row.date)) continue;
    const custom = lang === 'zh' ? row.zh : row.en;
    const title = custom ?? (row.kind === 'fomc' || row.kind === 'cpi' || row.kind === 'jobs' ? DEFAULT_TITLE[row.kind][i] : row.kind);
    out.push({ date: row.date, kind: row.kind, time: row.time, title });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || eventSortTime(a).localeCompare(eventSortTime(b)) || a.title.localeCompare(b.title));
}

// ---------- 导出 .ics ----------

/** 美东时区定义，日历软件靠它把 08:30 ET 换成本地时间 */
const VTIMEZONE_NY = [
  'BEGIN:VTIMEZONE',
  'TZID:America/New_York',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:-0500',
  'TZOFFSETTO:-0400',
  'TZNAME:EDT',
  'DTSTART:19700308T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:-0400',
  'TZOFFSETTO:-0500',
  'TZNAME:EST',
  'DTSTART:19701101T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/** 按 RFC 5545 每行不超过 75 字节折行 */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let cur = '';
  let curBytes = 0;
  for (const ch of line) {
    const b = new TextEncoder().encode(ch).length;
    const limit = parts.length ? 74 : 75;
    if (curBytes + b > limit) {
      parts.push(cur);
      cur = '';
      curBytes = 0;
    }
    cur += ch;
    curBytes += b;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

/**
 * 生成可以导入 Apple 日历、Google 日历、Outlook 的 .ics 文本。
 * stamp 是生成时间（UTC，形如 20261117T120000Z），由调用方传入，方便测试。
 */
export function eventsToIcs(events: MarketEvent[], stamp: string, calName = 'Portus'): string {
  const ymd = (d: string) => d.replace(/-/g, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PixelBlue LLC//Portus//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${icsEscape(calName)}`, ...VTIMEZONE_NY];
  for (const e of events) {
    const uid = `${ymd(e.date)}-${e.kind}${e.symbol ? `-${e.symbol}` : ''}@portus.pixelbluellc.com`;
    lines.push('BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${stamp}`, `SUMMARY:${icsEscape(e.title)}`);
    if (e.time) {
      const [h, m] = e.time.split(':');
      lines.push(`DTSTART;TZID=America/New_York:${ymd(e.date)}T${h}${m}00`, 'DURATION:PT30M');
    } else {
      lines.push(`DTSTART;VALUE=DATE:${ymd(e.date)}`, `DTEND;VALUE=DATE:${ymd(addDays(e.date, 1))}`);
    }
    lines.push('TRANSP:TRANSPARENT', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
