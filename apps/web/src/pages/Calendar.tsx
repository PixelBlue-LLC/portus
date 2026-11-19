import { useMemo, useState } from 'react';
import { buildCalendar, eventSortTime, eventsToIcs, MACRO_CALENDAR_CHECKED, MACRO_CALENDAR_END, type EventKind, type MarketEvent } from 'portus-core';
import { todayLocal } from '../actions';
import { getLang, t, type MsgKey } from '../i18n';
import type { AppState } from '../store';
import { browserZone, zoneShort } from '../timezones';
import { Card } from '../ui';

const KINDS: Array<{ kind: EventKind; label: MsgKey }> = [
  { kind: 'earnings', label: 'cal.kind.earnings' },
  { kind: 'fomc', label: 'cal.kind.fomc' },
  { kind: 'cpi', label: 'cal.kind.cpi' },
  { kind: 'jobs', label: 'cal.kind.jobs' },
  { kind: 'closed', label: 'cal.kind.closed' },
];

const RANGES = [30, 60, 90];
type View = 'day' | 'week' | 'month';

/** 美东某天某时 → 那一刻的时间戳（按纽约当天的 UTC 偏移换算，夏令时也对） */
export function etInstant(date: string, time: string): number {
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
  const [h, mi] = time.split(':').map(Number) as [number, number];
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(guess));
  const get = (k: string) => Number(parts.find((p) => p.type === k)?.value);
  const asNy = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'));
  return guess + (guess - asNy);
}

function ymdIn(ms: number, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

/** 「6:30 PST」：24 小时制、小时不补零，后面跟时区缩写 */
export function clockAt(ms: number, tz: string): string {
  // 有的浏览器在 24 小时制下会补零（05:30），统一去掉
  const hm = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms)).replace(/^0(\d)/, '$1');
  return `${hm} ${zoneShort(tz, new Date(ms))}`;
}

/** 一条事件在用户时区里的样子：哪天、几点（全天事件和只有时段的财报没有具体时间） */
interface Placed {
  e: MarketEvent;
  /** 用户主时区的日期 */
  day: string;
  /** 排序用 */
  at: number;
  /** 「6:30 PST」，没有具体时间时为空 */
  time: string;
  /** 副时区的时间，没设副时区时为空 */
  time2: string;
}

const allDay = (e: MarketEvent) => (!e.time && !e.session ? 1 : 0);

function zones(s: AppState): { tz: string; tz2: string } {
  const tz = s.settings.tzPrimary || browserZone();
  const tz2 = s.settings.tzSecondary && s.settings.tzSecondary !== tz ? s.settings.tzSecondary : '';
  return { tz, tz2 };
}

function place(events: MarketEvent[], tz: string, tz2: string): Placed[] {
  return events
    .map((e) => {
      const at = etInstant(e.date, eventSortTime(e));
      if (!e.time) return { e, day: e.date, at, time: '', time2: '' };
      return { e, day: ymdIn(at, tz), at, time: clockAt(at, tz), time2: tz2 ? clockAt(at, tz2) : '' };
    })
    // 同一天：全天事件（休市、没有时段的财报）在前，其余按时间
    .sort((a, b) => a.day.localeCompare(b.day) || allDay(b.e) - allDay(a.e) || a.at - b.at);
}

function dayLabel(date: string, lang: 'zh' | 'en', weekday = true): string {
  const dt = new Date(`${date}T12:00:00Z`);
  return dt.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', ...(weekday ? { weekday: 'short' } : {}), timeZone: 'UTC' });
}

const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekday = (ymd: string) => new Date(`${ymd}T00:00:00Z`).getUTCDay();

export function downloadText(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function upcomingEvents(s: AppState, days: number, kinds?: EventKind[], from = todayLocal()): MarketEvent[] {
  return buildCalendar({ earnings: s.market.earnings, earningsHour: s.market.earningsHour, from, days, kinds, lang: getLang() });
}

const tagOf = (e: MarketEvent) => t(KINDS.find((k) => k.kind === (e.kind === 'early_close' ? 'closed' : e.kind))!.label);

function Line({ p, compact }: { p: Placed; compact?: boolean }) {
  return (
    <div className={`ev ${compact ? 'compact' : ''}`}>
      {p.time ? <span className="ev-time">{p.time}</span> : null}
      <span className={`ev-tag ${p.e.kind}`}>{tagOf(p.e)}</span>
      <span className="ev-title">{p.e.title}</span>
      {p.time2 && !compact ? <span className="label">{p.time2}</span> : null}
    </div>
  );
}

/** 「今天」页用的单行 */
export function EventLine({ e, s }: { e: MarketEvent; s: AppState }) {
  const { tz, tz2 } = zones(s);
  return <Line p={place([e], tz, tz2)[0]!} />;
}

function DayList({ list, today, lang }: { list: Placed[]; today: string; lang: 'zh' | 'en' }) {
  const byDay = new Map<string, Placed[]>();
  for (const p of list) byDay.set(p.day, [...(byDay.get(p.day) ?? []), p]);
  if (!list.length) return <p className="muted" style={{ margin: 0, fontSize: 14 }}>{t('cal.empty')}</p>;
  return (
    <div className="ev-list">
      {[...byDay.entries()].map(([day, items]) => (
        <div key={day} className="ev-day">
          <span className="ev-date">
            {dayLabel(day, lang)}
            {day === today ? <span className="chip" style={{ marginLeft: 8 }}>{t('cal.today')}</span> : null}
          </span>
          {items.map((p) => (
            <Line key={p.e.date + p.e.kind + (p.e.symbol ?? '')} p={p} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** 周 / 月格子：每格一天；点某一天在下面列出那天的全部事件 */
function Grid({ start, days, month, list, today, lang }: { start: string; days: number; month?: string; list: Placed[]; today: string; lang: 'zh' | 'en' }) {
  const [picked, setPicked] = useState('');
  const byDay = new Map<string, Placed[]>();
  for (const p of list) byDay.set(p.day, [...(byDay.get(p.day) ?? []), p]);
  const cells = Array.from({ length: days }, (_, i) => addDays(start, i));
  const heads = cells.slice(0, 7).map((d) => new Date(`${d}T12:00:00Z`).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { weekday: 'short', timeZone: 'UTC' }));
  const sel = picked && byDay.get(picked);
  return (
    <>
      <div className={`cal-grid ${month ? 'month' : 'week'}`} role="grid">
        {heads.map((h) => (
          <span key={h} className="cal-head" role="columnheader">
            {h}
          </span>
        ))}
        {cells.map((d) => {
          const items = byDay.get(d) ?? [];
          const out = month && d.slice(0, 7) !== month;
          const max = month ? 3 : 8;
          return (
            <button
              key={d}
              role="gridcell"
              className={`cal-cell ${out ? 'out' : ''} ${d === today ? 'today' : ''} ${picked === d ? 'on' : ''}`}
              onClick={() => setPicked(picked === d ? '' : d)}
              aria-label={`${dayLabel(d, lang)} · ${t('cal.nEvents', { n: items.length })}`}
            >
              <span className="cal-num">{month ? Number(d.slice(8)) : dayLabel(d, lang)}</span>
              {items.slice(0, max).map((p) => (
                <span key={p.e.date + p.e.kind + (p.e.symbol ?? '')} className={`cal-ev ${p.e.kind}`}>
                  {p.time ? <b>{p.time.split(' ')[0]} </b> : null}
                  {p.e.symbol ?? tagOf(p.e)}
                </span>
              ))}
              {items.length > max ? <span className="cal-more">+{items.length - max}</span> : null}
            </button>
          );
        })}
      </div>
      {sel ? (
        <div className="ev-day" style={{ borderBottom: 'none' }}>
          <span className="ev-date">{dayLabel(picked, lang)}</span>
          {sel.map((p) => (
            <Line key={p.e.date + p.e.kind + (p.e.symbol ?? '')} p={p} />
          ))}
        </div>
      ) : null}
    </>
  );
}

export function Calendar({ s }: { s: AppState }) {
  const lang = getLang();
  const today = todayLocal();
  const [view, setView] = useState<View>('day');
  const [days, setDays] = useState(60);
  // 周、月视图看的是哪一段：存一个锚点日期，‹ › 前后翻
  const [anchor, setAnchor] = useState(today);
  const [off, setOff] = useState<EventKind[]>([]);
  const kinds = KINDS.map((k) => k.kind).filter((k) => !off.includes(k));
  if (!off.includes('closed')) kinds.push('early_close');
  const { tz, tz2 } = zones(s);

  // 中文一周从周一开始，英文从周日开始
  const weekStartDay = lang === 'zh' ? 1 : 0;
  const startOfWeek = (d: string) => addDays(d, -((weekday(d) - weekStartDay + 7) % 7));
  const month = anchor.slice(0, 7);
  let from = today;
  let span = days;
  if (view === 'week') {
    from = startOfWeek(anchor);
    span = 7;
  } else if (view === 'month') {
    from = startOfWeek(`${month}-01`);
    span = 42;
  }
  // 换时区后事件可能挪到前一天或后一天：多取一天再按用户的日期筛
  const events = useMemo(
    () => upcomingEvents(s, span + 2, kinds, addDays(from, -1)),
    [s.market.earnings, s.market.earningsHour, from, span, kinds.join(','), lang],
  );
  const to = addDays(from, span);
  const placed = place(events, tz, tz2).filter((p) => p.day >= from && p.day < to);
  const pastTable = today > MACRO_CALENDAR_END;

  const shift = (n: number) => {
    if (view === 'week') setAnchor(addDays(anchor, 7 * n));
    else {
      const [y, m] = month.split('-').map(Number) as [number, number];
      const d = new Date(Date.UTC(y, m - 1 + n, 1));
      setAnchor(d.toISOString().slice(0, 10));
    }
  };
  const title =
    view === 'week'
      ? `${dayLabel(from, lang, false)} – ${dayLabel(addDays(from, 6), lang, false)}`
      : new Date(`${month}-15T12:00:00Z`).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'long', timeZone: 'UTC' });

  return (
    <>
      <header className="page-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="title">{t('nav.calendar')}</span>
          <span className="label">{t('cal.sub')}</span>
        </div>
        <button
          className="btn"
          disabled={!events.length}
          onClick={() => {
            const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
            downloadText('portus-calendar.ics', eventsToIcs(events, stamp, t('cal.icsName')), 'text/calendar');
          }}
        >
          {t('cal.export')}
        </button>
      </header>

      <Card>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="seg" role="group" aria-label={t('cal.view')}>
            {(['day', 'week', 'month'] as View[]).map((v) => (
              <button key={v} className={view === v ? 'on' : ''} aria-pressed={view === v} onClick={() => setView(v)}>
                {t(`cal.view.${v}` as MsgKey)}
              </button>
            ))}
          </div>
          {view === 'day' ? (
            <div className="seg" role="group" aria-label={t('cal.range')}>
              {RANGES.map((r) => (
                <button key={r} className={days === r ? 'on' : ''} aria-pressed={days === r} onClick={() => setDays(r)}>
                  {t('cal.days', { n: r })}
                </button>
              ))}
            </div>
          ) : (
            <div className="row" style={{ gap: 6 }}>
              <button className="btn small icon" aria-label={t('cal.prev')} onClick={() => shift(-1)}>
                ‹
              </button>
              <span style={{ fontWeight: 700, minWidth: 120, textAlign: 'center' }}>{title}</span>
              <button className="btn small icon" aria-label={t('cal.next')} onClick={() => shift(1)}>
                ›
              </button>
              <button className="btn small" onClick={() => setAnchor(today)}>
                {t('cal.today')}
              </button>
            </div>
          )}
        </div>
        <div className="row" role="group" aria-label={t('cal.filter')}>
          {KINDS.map((k) => {
            const on = !off.includes(k.kind);
            return (
              <button key={k.kind} className={`acct-chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => setOff((o) => (on ? [...o, k.kind] : o.filter((x) => x !== k.kind)))}>
                {t(k.label)}
              </button>
            );
          })}
        </div>
        <span className="label">
          {t('cal.tzNote', { z: zoneShort(tz) })}
          {tz2 ? t('cal.tzNote2', { z: zoneShort(tz2) }) : ''}
        </span>
        {!s.settings.finnhubKey && !off.includes('earnings') ? (
          <div className="notice">
            {t('cal.needKey')} <a href="#/settings">{t('common.goSettings')}</a>
          </div>
        ) : null}
        {pastTable ? <div className="banner bad">{t('cal.tableOld', { d: MACRO_CALENDAR_END })}</div> : null}

        {view === 'day' ? (
          <DayList list={placed} today={today} lang={lang} />
        ) : (
          <Grid key={view + from} start={from} days={span} month={view === 'month' ? month : undefined} list={placed} today={today} lang={lang} />
        )}
        <p className="label" style={{ margin: 0, lineHeight: 1.6 }}>
          {t('cal.source', { d: MACRO_CALENDAR_CHECKED, end: MACRO_CALENDAR_END })}
        </p>
      </Card>
    </>
  );
}
