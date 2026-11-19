import type { ReactNode } from 'react';
import { nameIn, ruleLabel, type ConcentrationResult, type SectorPerf } from 'portus-core';
import { signedPct, signedUsd } from './format';
import { getLang, t } from './i18n';

export function tone(v: number | null | undefined): string {
  if (v == null || v === 0) return '';
  return v > 0 ? 'pos' : 'neg';
}

export function Money({ v, pct, digits = 0 }: { v: number | null; pct?: number | null; digits?: number }) {
  if (v == null) return <span className="muted">—</span>;
  return (
    <span className={tone(v)}>
      {signedUsd(v, digits)}
      {pct != null ? ` · ${signedPct(pct)}` : ''}
    </span>
  );
}

export function Pct({ v, digits = 2 }: { v: number | null | undefined; digits?: number }) {
  if (v == null) return <span className="muted">—</span>;
  return <span className={tone(v)}>{signedPct(v, digits)}</span>;
}

export function Card({ children, tight, className = '' }: { children: ReactNode; tight?: boolean; className?: string }) {
  return <section className={`card ${tight ? 'tight' : ''} ${className}`}>{children}</section>;
}

export function Tile({ label, value, sub, children }: { label: string; value: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <Card tight>
      <span className="label">{label}</span>
      <span className="mid">{value}</span>
      {sub ? <span className="label">{sub}</span> : null}
      {children}
    </Card>
  );
}

/** 一条集中度：数值条 + 阈值竖线 */
export function ConcRow({ c }: { c: ConcentrationResult }) {
  const lang = getLang();
  const label = ruleLabel(c, lang);
  const subject = c.subject ? nameIn(c.subject, lang) : '';
  const name = subject ? (lang === 'zh' ? `${label}（${subject}）` : `${label} (${subject})`) : label;
  const okColor = 'var(--ok-bar)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, gap: 8 }}>
        <span className="body">{name}</span>
        <span style={{ fontWeight: 600, color: c.over ? 'var(--warn-text)' : undefined }}>
          {c.pct}%{' '}
          <span className="muted" style={{ fontWeight: 400 }}>
            {c.direction === 'below' ? '≥' : '/'} {c.limit}%
          </span>
        </span>
      </div>
      <div className="bar" role="img" aria-label={t('conc.aria', { name, pct: c.pct, limit: c.limit })}>
        <i style={{ width: `${Math.min(100, c.pct)}%`, background: c.over ? undefined : okColor }} />
        <b style={{ left: `${Math.min(100, c.limit)}%` }} />
      </div>
    </div>
  );
}

/** 板块色块：跌越多颜色越深 */
export function HeatGrid({ sectors, limit = 6 }: { sectors: SectorPerf[]; limit?: number }) {
  if (!sectors.length) return <p className="muted" style={{ margin: 0, fontSize: 14 }}>{t('heat.empty')}</p>;
  const pick = sectors.length > limit ? [...sectors.slice(0, limit / 2), ...sectors.slice(-limit / 2)] : sectors;
  const max = Math.max(...sectors.map((s) => Math.abs(s.changePct)), 1);
  return (
    <div className="heat">
      {pick.map((s) => {
        const a = 0.15 + (Math.abs(s.changePct) / max) * 0.75;
        const base = s.changePct < 0 ? 'var(--down)' : 'var(--up)';
        const strong = a > 0.55;
        return (
          <a
            key={s.symbol}
            href={`#/market/${s.symbol}`}
            title={t('heat.open')}
            style={{ background: `color-mix(in srgb, ${base} ${Math.round(a * 100)}%, var(--card))`, color: strong ? '#fff' : 'var(--ink)', textDecoration: 'none' }}
          >
            <span className="n">
              {nameIn(s.name, getLang())} {s.symbol}
            </span>
            <span className="v">{signedPct(s.changePct, 1)}</span>
          </a>
        );
      })}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Card>
      <h2>{title}</h2>
      {children}
    </Card>
  );
}
