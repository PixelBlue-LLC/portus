import { useState } from 'react';
import { t, type MsgKey } from '../i18n';
import { setState, type AppState } from '../store';
import { Card } from '../ui';

/** 交易前检查清单：用户自己写下理由和计划，工具不替你回答 */
const QUESTIONS = Array.from({ length: 16 }, (_, i) => `opt.q${i}` as MsgKey);

export function Options({ s }: { s: AppState }) {
  const [open, setOpen] = useState(false);
  const filled = QUESTIONS.filter((_, i) => (s.checklist[`q${i}`] ?? '').trim()).length;
  const missing = ['q10', 'q12', 'q13', 'q0'].filter((k) => !(s.checklist[k] ?? '').trim());

  return (
    <>
      <header className="page-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="title">{t('nav.options')}</span>
          <span className="label">{t('opt.sub')}</span>
        </div>
      </header>

      <div className="grid2">
        <Card>
          <span className="label" style={{ fontWeight: 600 }}>{t('opt.data')}</span>
          <h2 style={{ fontSize: 20, lineHeight: 1.35 }}>{t('opt.noChain')}</h2>
          <p className="body" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
            {t('opt.body')}
          </p>
          <ul className="list" style={{ fontSize: 14 }}>
            <li>{t('opt.li1')}</li>
            <li>{t('opt.li2')}</li>
          </ul>
          <a href="#/settings" style={{ fontSize: 14 }}>
            {t('opt.dsLink')}
          </a>
        </Card>

        <Card>
          <div className="card-head">
            <h2>{t('opt.checklist')}</h2>
            <span className="label">
              {filled} / {QUESTIONS.length}
            </span>
          </div>
          <p className="body" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
            {t('opt.checkBody')}
          </p>
          {missing.length && filled ? <div className="banner bad">{t('opt.missing', { list: missing.map((k) => t(QUESTIONS[Number(k.slice(1))]!)).join(t('common.sep')) })}</div> : null}
          {open ? (
            <>
              {QUESTIONS.map((q, i) => (
                <label className="field" key={q}>
                  <span>
                    {i + 1}. {t(q)}
                  </span>
                  <textarea
                    className="input"
                    style={{ minHeight: 56 }}
                    value={s.checklist[`q${i}`] ?? ''}
                    onChange={(e) => setState((st) => ({ checklist: { ...st.checklist, [`q${i}`]: e.target.value } }))}
                  />
                </label>
              ))}
              <div className="row">
                <button className="btn small" onClick={() => setOpen(false)}>
                  {t('common.collapse')}
                </button>
                <button className="btn small" onClick={() => setState({ checklist: {} })}>
                  {t('common.clear')}
                </button>
              </div>
            </>
          ) : (
            <button className="btn" onClick={() => setOpen(true)} style={{ alignSelf: 'flex-start' }}>
              {filled ? t('opt.continue') : t('opt.start')}
            </button>
          )}
        </Card>
      </div>
    </>
  );
}
