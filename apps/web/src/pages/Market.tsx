import { useEffect, useState } from 'react';
import { nameIn } from 'portus-core';
import { translateTitles } from '../actions';
import type { Derived } from '../derived';
import { signedPct, timeLabel } from '../format';
import { t } from '../i18n';
import type { AppState } from '../store';
import { Empty } from '../ui';
import { SectorChart } from './Sectors';

const NEWS_SHOWN = 20;

/** 中文界面下，把要显示的新闻标题交给 AI 翻译（用户自己的 key）。新标题出现时才会再调用。 */
function useNewsTranslation(s: AppState, d: Derived): string {
  const [err, setErr] = useState('');
  const want = d.lang === 'zh' && !!s.settings.anthropicKey;
  const titles = d.newsHeld.slice(0, NEWS_SHOWN).map((n) => n.title);
  const missing = want ? titles.filter((x) => !s.translations?.[x]) : [];
  const key = missing.join('\n');
  useEffect(() => {
    if (!key) return;
    let alive = true;
    void translateTitles(key.split('\n')).then((e) => {
      if (alive) setErr(e ?? '');
    });
    return () => {
      alive = false;
    };
  }, [key]);
  return err;
}

export function Market({ s, d }: { s: AppState; d: Derived }) {
  const translateErr = useNewsTranslation(s, d);

  if (!s.settings.finnhubKey)
    return (
      <>
        <header className="page-head">
          <span className="title">{t('nav.market')}</span>
        </header>
        <Empty title={t('mkt.needKey')}>
          <p className="body" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
            {t('mkt.needKeyBody')}
          </p>
          <a className="btn" href="#/settings" style={{ alignSelf: 'flex-start' }}>
            {t('common.goSettings')}
          </a>
        </Empty>
      </>
    );

  const sectors = d.sectors;
  // 从「今天」页点板块色块进来时是 #/market/XLE，直接展开那一个
  const initialSector = /^#\/market\/([A-Z.]+)/.exec(location.hash)?.[1];
  const best = sectors[0];
  const worst = sectors.at(-1);
  const summary = d.labels.allDown
    ? t('mkt.allDown', { n: sectors.length })
    : d.labels.allUp
      ? t('mkt.allUp', { n: sectors.length })
      : t('mkt.mixed', { u: sectors.filter((x) => x.changePct > 0).length, d: sectors.filter((x) => x.changePct < 0).length });
  const zhNews = d.lang === 'zh';

  return (
    <>
      <header className="page-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="title">{t('nav.market')}</span>
          <span className="label">{s.market.fetchedAt ? t('mkt.sub', { t: timeLabel(s.market.fetchedAt) }) : t('mkt.noRefresh')}</span>
        </div>
      </header>

      {sectors.length && best && worst ? (
        <section className="sec">
          <h1 className="headline" style={{ fontSize: 22 }}>{summary}</h1>
          <p className="lead" style={{ fontSize: 14 }}>
            {t('mkt.spread', {
              b: nameIn(best.name, d.lang),
              bp: signedPct(best.changePct),
              w: nameIn(worst.name, d.lang),
              wp: signedPct(worst.changePct),
              g: (best.changePct - worst.changePct).toFixed(1),
            })}
          </p>
        </section>
      ) : null}

      <div className="grid2">
        <SectorChart s={s} d={d} initial={initialSector} />

        <div className="col">
          <div className="card-head" style={{ padding: '0 6px' }}>
            <h2 style={{ margin: 0, fontSize: 15 }}>{t('mkt.news')}</h2>
            <span className="label">{t('mkt.newsSub')}</span>
          </div>
          {zhNews && d.newsHeld.length ? (
            s.translating ? (
              <span className="label" style={{ padding: '0 6px' }}>{t('mkt.translating')}</span>
            ) : translateErr ? (
              <span className="label neg" style={{ padding: '0 6px' }}>{t('mkt.translateFail', { e: translateErr })}</span>
            ) : !s.settings.anthropicKey ? (
              <span className="label" style={{ padding: '0 6px' }}>{t('mkt.translateHint')}</span>
            ) : null
          ) : null}
          {d.newsHeld.length ? (
            d.newsHeld.slice(0, NEWS_SHOWN).map((n) => {
              const zh = zhNews ? s.translations?.[n.title] : undefined;
              return (
                <a key={n.url + n.symbol} href={n.url} target="_blank" rel="noreferrer" className="card tight" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <span className="row" style={{ gap: 6, fontSize: 11 }}>
                    <span className="chip" style={{ fontWeight: 700, fontSize: 11 }}>{n.symbol}</span>
                    <span className="muted">
                      {n.source} · {timeLabel(n.publishedAt)}
                      {zh ? ` · ${t('mkt.machine')}` : ''}
                    </span>
                  </span>
                  <span lang={zh ? 'zh-CN' : 'en'} style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.45 }}>
                    {zh ?? n.title}
                  </span>
                  {zh ? (
                    <span lang="en" className="muted" style={{ fontSize: 12, lineHeight: 1.4 }}>
                      {n.title}
                    </span>
                  ) : null}
                </a>
              );
            })
          ) : (
            <div className="notice">{t('mkt.noNews')}</div>
          )}
        </div>
      </div>
    </>
  );
}
