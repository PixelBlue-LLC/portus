import { useMemo, useState } from 'react';
import { buildCalendar, eventsToIcs, MACRO_CALENDAR_CHECKED, MACRO_CALENDAR_END, type EventKind, type MarketEvent } from 'portus-core';
import { todayLocal } from '../actions';
import { getLang, t, type MsgKey } from '../i18n';
import type { AppState } from '../store';
import { Card } from '../ui';

const KINDS: Array<{ kind: EventKind; label: MsgKey }> = [
  { kind: 'earnings', label: 'cal.kind.earnings' },
  { kind: 'fomc', label: 'cal.kind.fomc' },
  { kind: 'cpi', label: 'cal.kind.cpi' },
  { kind: 'jobs', label: 'cal.kind.jobs' },
  { kind: 'closed', label: 'cal.kind.closed' },
];

const RANGES = [30, 60, 90];

/** 美东时间 → 用户本地时间（HH:MM）。按纽约当天的 UTC 偏移换算，夏令时也对 */
export function etToLocal(date: string, time: string, lang: 'zh' | 'en'): string {
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
  const [h, mi] = time.split(':').map(Number) as [number, number];
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(guess));
  const get = (k: string) => Number(parts.find((p) => p.type === k)?.value);
  const asNy = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'));
  const utc = guess + (guess - asNy);
  return new Date(utc).toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit' });
}

function dayLabel(date: string, lang: 'zh' | 'en'): string {
  const dt = new Date(`${date}T12:00:00Z`);
  return dt.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', weekday: 'short', timeZone: 'UTC' });
}

export function downloadText(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function upcomingEvents(s: AppState, days: number, kinds?: EventKind[]): MarketEvent[] {
  return buildCalendar({ earnings: s.market.earnings, earningsHour: s.market.earningsHour, from: todayLocal(), days, kinds, lang: getLang() });
}

export function EventLine({ e }: { e: MarketEvent }) {
  const lang = getLang();
  return (
    <div className="ev">
      <span className={`ev-tag ${e.kind}`}>{t(KINDS.find((k) => k.kind === (e.kind === 'early_close' ? 'closed' : e.kind))!.label)}</span>
      <span className="ev-title">{e.title}</span>
      {e.time ? (
        <span className="label">
          {t('cal.timeEt', { t: e.time, local: etToLocal(e.date, e.time, lang) })}
        </span>
      ) : null}
    </div>
  );
}

export function Calendar({ s }: { s: AppState }) {
  const lang = getLang();
  const [days, setDays] = useState(60);
  const [off, setOff] = useState<EventKind[]>([]);
  const kinds = KINDS.map((k) => k.kind).filter((k) => !off.includes(k));
  if (!off.includes('closed')) kinds.push('early_close');
  const events = useMemo(() => upcomingEvents(s, days, kinds), [s.market.earnings, s.market.earningsHour, days, kinds.join(','), lang]);
  const byDate = new Map<string, MarketEvent[]>();
  for (const e of events) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
  const today = todayLocal();
  const pastTable = today > MACRO_CALENDAR_END;

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
        <div className="seg" role="group" aria-label={t('cal.range')}>
          {RANGES.map((r) => (
            <button key={r} className={days === r ? 'on' : ''} aria-pressed={days === r} onClick={() => setDays(r)}>
              {t('cal.days', { n: r })}
            </button>
          ))}
        </div>
        {!s.settings.finnhubKey && !off.includes('earnings') ? (
          <div className="notice">
            {t('cal.needKey')} <a href="#/settings">{t('common.goSettings')}</a>
          </div>
        ) : null}
        {pastTable ? <div className="banner bad">{t('cal.tableOld', { d: MACRO_CALENDAR_END })}</div> : null}

        {events.length ? (
          <div className="ev-list">
            {[...byDate.entries()].map(([date, list]) => (
              <div key={date} className="ev-day">
                <span className="ev-date">
                  {dayLabel(date, lang)}
                  {date === today ? <span className="chip" style={{ marginLeft: 8 }}>{t('cal.today')}</span> : null}
                </span>
                {list.map((e) => (
                  <EventLine key={e.date + e.kind + (e.symbol ?? '')} e={e} />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            {t('cal.empty')}
          </p>
        )}
        <p className="label" style={{ margin: 0, lineHeight: 1.6 }}>
          {t('cal.source', { d: MACRO_CALENDAR_CHECKED, end: MACRO_CALENDAR_END })}
        </p>
      </Card>
    </>
  );
}
