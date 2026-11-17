import { useState } from 'react';
import { sendChat } from '../actions';
import type { Derived } from '../derived';
import { t } from '../i18n';
import { setState, type AppState } from '../store';
import { Empty } from '../ui';

const SUGGESTIONS = ['ask.s1', 'ask.s2', 'ask.s3'] as const;

export function Ask({ s, d }: { s: AppState; d: Derived }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  if (!s.settings.anthropicKey)
    return (
      <>
      <header className="page-head">
        <span className="title">{t('nav.ask')}</span>
      </header>
      <Empty title={t('ask.needKey')}>
        <p className="body" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
          {t('ask.needKeyBody')}
        </p>
        <a className="btn" href="#/settings" style={{ alignSelf: 'flex-start' }}>
          {t('common.goSettings')}
        </a>
      </Empty>
      </>
    );

  const send = async (q: string) => {
    if (!q.trim() || busy) return;
    setBusy(true);
    setText('');
    await sendChat(q.trim(), d.facts);
    setBusy(false);
  };

  return (
    <>
      <header className="page-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="title">{t('nav.ask')}</span>
          <span className="label">{t('ask.sub')}</span>
        </div>
        {s.chat.length ? (
          <button className="btn small" onClick={() => setState({ chat: [] })}>
            {t('common.clear')}
          </button>
        ) : null}
      </header>

      <div className="row" style={{ padding: '0 2px' }}>
        {SUGGESTIONS.map((k) => (
          <button key={k} className="btn small" style={{ borderRadius: 22 }} onClick={() => void send(t(k))} disabled={busy}>
            {t(k)}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8 }}>
        {s.chat.map((m, i) => (
          <div key={i} className={`bubble ${m.role === 'user' ? 'me' : 'ai'}`}>
            {m.text}
          </div>
        ))}
        {busy ? <div className="bubble ai muted">{t('ask.thinking')}</div> : null}
      </div>

      <form
        className="row"
        style={{ marginTop: 'auto', flexWrap: 'nowrap' }}
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        <label htmlFor="ask" className="sr">
          {t('ask.label')}
        </label>
        <input id="ask" className="input" style={{ borderRadius: 22 }} value={text} placeholder={t('ask.ph')} onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="btn primary" disabled={busy || !text.trim()} style={{ borderRadius: 22 }}>
          {t('ask.send')}
        </button>
      </form>
    </>
  );
}
