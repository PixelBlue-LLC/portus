import { useSyncExternalStore } from 'react';
import type { LangPref } from './i18n';
import { t } from './i18n';
import { DEFAULT_ACCOUNT, DEFAULT_RULES, type AlertRule, type CashByAccount, type ConcentrationRule, type DailyBar, type Holding, type NewsItem, type OptionContract, type Plan, type Quote, type SectorPerf } from 'portus-core';

export type ThemePref = 'system' | 'light' | 'dark';

export interface Settings {
  finnhubKey: string;
  anthropicKey: string;
  aiModel: string;
  theme: ThemePref;
  /** us = 绿涨红跌，cn = 红涨绿跌 */
  colorConvention: 'us' | 'cn';
  rules: ConcentrationRule[];
  /** 多个账户时：merged = 同一只股票合成一条，split = 按账户分开 */
  accountView: 'merged' | 'split';
  /** 界面语言；auto = 跟随浏览器 */
  lang: LangPref;
  /** Twelve Data 的 key，用来拉日线算相关性 */
  twelveDataKey: string;
  /** 顶栏主时区（IANA 名）；空串 = 跟随浏览器 */
  tzPrimary: string;
  /** 顶栏副时区；空串 = 不显示 */
  tzSecondary: string;
  /** 盘中自动刷新行情的间隔（分钟），0 = 不自动刷新 */
  autoRefreshMin: number;
  /** 点股票代码时去哪个公开网站看价格 */
  quoteSite: 'yahoo' | 'google' | 'tradingview';
}

export interface MarketCache {
  quotes: Record<string, Quote>;
  sectors: SectorPerf[];
  news: NewsItem[];
  /** 代码 → YYYY-MM-DD */
  earnings: Record<string, string>;
  /** 代码 → Finnhub 行业（ETF 等没有的记成空串，避免重复请求） */
  industries: Record<string, string>;
  /** 代码 → 财报时段 bmo / amc / dmh */
  earningsHour?: Record<string, string>;
  /** 最近一次拉到报价的时间（顶栏显示这个） */
  fetchedAt?: string;
  /** 最近一次完整刷新（含新闻、财报、行业）的时间；自动刷新平时只拉报价 */
  fullAt?: string;
  errors: string[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface AppState {
  holdings: Holding[];
  /** 每个账户的现金 */
  cashByAccount: CashByAccount;
  settings: Settings;
  market: MarketCache;
  checklist: Record<string, string>;
  attribution?: { text: string; at: string };
  chat: ChatMessage[];
  /** 正在刷新行情 */
  loading: boolean;
  /** 当前持仓是示例数据（虚构） */
  isSample?: boolean;
  /** 新闻标题的中文机器翻译：原文 → 译文。只缓存在本地 */
  translations?: Record<string, string>;
  /** 正在翻译新闻 */
  translating?: boolean;
  /** 用户自己设的提醒规则 */
  alerts: AlertRule[];
  /** 分批计划和挂单记录 */
  plans: Plan[];
  /** 用户自己填的 ETF 成分表：ETF 代码 → [代码, 权重%] */
  etfCustom: Record<string, Array<[string, number]>>;
  /** 想看相关性的候选代码（不一定持有） */
  candidates: string[];
  /** 日线缓存，按天刷新 */
  history: HistoryCache;
  historyLoading?: boolean;
  /** 导入的期权链：标的 → 合约 */
  chains: Record<string, ChainCache>;
  /** 首次使用引导已关掉 */
  welcomeDismissed?: boolean;
  /** 板块的 AI 解读：ETF 代码 → 解读文字和时间 */
  sectorNotes?: Record<string, { text: string; at: string }>;
  /** 观望列表：没持有、但在看的股票 */
  watchlist?: WatchItem[];
}

export interface WatchItem {
  symbol: string;
  /** 加进来的时间（ISO） */
  addedAt: string;
  /** 加进来时的价格，用来算「加入以来」的涨跌 */
  addedPrice?: number;
  note?: string;
}

export interface HistoryCache {
  bars: Record<string, DailyBar[]>;
  /** 每只代码哪天拉的（YYYY-MM-DD），同一天不重复拉 */
  fetchedOn: Record<string, string>;
  errors: string[];
}

export interface ChainCache {
  contracts: OptionContract[];
  importedAt: string;
  /** 导入时填的现价（没有行情时用） */
  spot?: number;
}

const KEY = 'portus:v1';
// 2026-11-17 由 Loadline 改名为 Portus：旧键里的数据第一次打开时搬过来（同一个域名下 localStorage 共用）
const LEGACY_KEYS = ['loadline:v1'];
const BACKUP_APPS = ['portus', 'loadline'];

function readSaved(): string | null {
  const raw = localStorage.getItem(KEY);
  if (raw) return raw;
  for (const old of LEGACY_KEYS) {
    const legacy = localStorage.getItem(old);
    if (legacy) {
      try {
        localStorage.setItem(KEY, legacy);
        localStorage.removeItem(old);
      } catch {
        // 写不进去就先用旧数据，下次再搬
      }
      return legacy;
    }
  }
  return null;
}

export const DEFAULT_SETTINGS: Settings = {
  finnhubKey: '',
  anthropicKey: '',
  aiModel: 'claude-haiku-5-5',
  theme: 'system',
  colorConvention: 'us',
  rules: DEFAULT_RULES,
  accountView: 'merged',
  lang: 'auto',
  twelveDataKey: '',
  tzPrimary: '',
  tzSecondary: 'America/New_York',
  autoRefreshMin: 5,
  quoteSite: 'yahoo',
};

const EMPTY_MARKET: MarketCache = { quotes: {}, sectors: [], news: [], earnings: {}, industries: {}, errors: [] };
const EMPTY_HISTORY: HistoryCache = { bars: {}, fetchedOn: {}, errors: [] };

const OLD_DEFAULT_MODELS = ['claude-haiku-4-5'];

function migrateSettings(s: Settings): Settings {
  return OLD_DEFAULT_MODELS.includes(s.aiModel) ? { ...s, aiModel: DEFAULT_SETTINGS.aiModel } : s;
}

function load(): AppState {
  const base: AppState = {
    holdings: [],
    cashByAccount: {},
    settings: DEFAULT_SETTINGS,
    market: EMPTY_MARKET,
    checklist: {},
    chat: [],
    loading: false,
    alerts: [],
    plans: [],
    etfCustom: {},
    candidates: [],
    history: EMPTY_HISTORY,
    chains: {},
  };
  try {
    const raw = readSaved();
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<AppState> & { cash?: number };
    // 旧版只有一个总现金
    const legacyCash: CashByAccount = typeof saved.cash === 'number' && saved.cash > 0 ? { [DEFAULT_ACCOUNT]: saved.cash } : {};
    const { cash: _legacy, ...rest } = saved;
    return {
      ...base,
      ...rest,
      cashByAccount: saved.cashByAccount ?? legacyCash,
      settings: migrateSettings({ ...DEFAULT_SETTINGS, ...saved.settings }),
      market: { ...EMPTY_MARKET, ...saved.market },
      history: { ...EMPTY_HISTORY, ...saved.history },
      loading: false,
      historyLoading: false,
    };
  } catch {
    return base;
  }
}

let state: AppState = load();
const listeners = new Set<() => void>();

function persist() {
  try {
    const { loading: _loading, translating: _translating, historyLoading: _hl, ...rest } = state;
    localStorage.setItem(KEY, JSON.stringify(rest));
  } catch {
    // 隐私模式或存储已满时不影响使用，只是刷新后不保留
  }
}

export function getState(): AppState {
  return state;
}

export function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) {
  const next = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...next };
  persist();
  for (const l of listeners) l();
}

export function updateSettings(patch: Partial<Settings>) {
  setState((s) => {
    const settings = { ...s.settings, ...patch };
    // AI 解读是按旧语言写的，换语言后作废
    return patch.lang && patch.lang !== s.settings.lang ? { settings, attribution: undefined } : { settings };
  });
}

export function useAppState(): AppState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

/** 导出备份：持仓、现金、设置、提醒、计划（可选是否带 key） */
export function exportBackup(includeKeys: boolean): string {
  const { holdings, cashByAccount, settings, checklist, alerts, plans, etfCustom, candidates, watchlist } = state;
  const s = includeKeys ? settings : { ...settings, finnhubKey: '', anthropicKey: '', twelveDataKey: '' };
  return JSON.stringify(
    { app: 'portus', version: 3, exportedAt: new Date().toISOString(), holdings, cashByAccount, settings: s, checklist, alerts, plans, etfCustom, candidates, watchlist },
    null,
    2,
  );
}

export function importBackup(text: string): void {
  const data = JSON.parse(text) as Partial<AppState> & { app?: string; cash?: number };
  if (!BACKUP_APPS.includes(data.app ?? '') || !Array.isArray(data.holdings)) throw new Error(t('err.backup'));
  setState((s) => ({
    holdings: data.holdings ?? [],
    cashByAccount: data.cashByAccount ?? (typeof data.cash === 'number' && data.cash > 0 ? { [DEFAULT_ACCOUNT]: data.cash } : {}),
    settings: {
      ...s.settings,
      ...data.settings,
      finnhubKey: data.settings?.finnhubKey || s.settings.finnhubKey,
      anthropicKey: data.settings?.anthropicKey || s.settings.anthropicKey,
      twelveDataKey: data.settings?.twelveDataKey || s.settings.twelveDataKey,
    },
    checklist: data.checklist ?? {},
    alerts: data.alerts ?? s.alerts,
    plans: data.plans ?? s.plans,
    etfCustom: data.etfCustom ?? s.etfCustom,
    candidates: data.candidates ?? s.candidates,
    watchlist: data.watchlist ?? s.watchlist,
    market: EMPTY_MARKET,
    attribution: undefined,
    isSample: false,
  }));
}

const isSampleItem = (x: { id: string }) => x.id.startsWith('sample-');

/** 用示例持仓看效果；顺带放两条示例提醒和一个示例计划，退出示例时一起清掉 */
export function loadSample() {
  setState((s) => ({
    holdings: SAMPLE.holdings,
    cashByAccount: { [DEFAULT_ACCOUNT]: SAMPLE.cash },
    isSample: true,
    attribution: undefined,
    chat: [],
    alerts: [...s.alerts.filter((a) => !isSampleItem(a)), ...SAMPLE.alerts],
    plans: [...s.plans.filter((p) => !isSampleItem(p)), ...SAMPLE.plans],
  }));
}

/** 退出示例：清掉示例持仓和由它算出的内容，保留设置、key 和用户自己加的提醒、计划 */
export function exitSample() {
  setState((s) => ({
    holdings: [],
    cashByAccount: {},
    isSample: false,
    attribution: undefined,
    chat: [],
    checklist: {},
    alerts: s.alerts.filter((a) => !isSampleItem(a)),
    plans: s.plans.filter((p) => !isSampleItem(p)),
  }));
}

/** 生成本地唯一 id */
export function newId(prefix = ''): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function clearAll() {
  localStorage.removeItem(KEY);
  for (const old of LEGACY_KEYS) localStorage.removeItem(old);
  state = load();
  for (const l of listeners) l();
}

/** 示例持仓：虚构数据，方便第一次打开时看效果 */
export const SAMPLE: { holdings: Holding[]; cash: number; alerts: AlertRule[]; plans: Plan[] } = {
  alerts: [
    { id: 'sample-a1', type: 'weight_above', symbol: 'NVDA', value: 30 },
    { id: 'sample-a2', type: 'price_below', symbol: 'MSFT', value: 400 },
  ],
  plans: [
    {
      id: 'sample-p1',
      symbol: 'JNJ',
      side: 'buy',
      createdAt: '2026-11-10',
      tranches: [
        { id: 'sample-t1', date: '2026-11-12', amount: 600, limit: 152, status: 'filled', fillPrice: 151.4, fillQty: 4 },
        { id: 'sample-t2', date: '2026-11-26', amount: 600, limit: 146, tif: 'gtc', status: 'placed' },
        { id: 'sample-t3', date: '2026-12-10', amount: 600, status: 'planned' },
      ],
    },
  ],
  // 示例没有行情 key 时也要能算市值，所以带了虚构的现价
  holdings: [
    { symbol: 'NVDA', qty: 30, costBasis: 92, manualPrice: 184 },
    { symbol: 'AAPL', qty: 20, costBasis: 150, manualPrice: 228 },
    { symbol: 'MSFT', qty: 8, costBasis: 320, manualPrice: 415 },
    { symbol: 'VOO', qty: 6, costBasis: 410, manualPrice: 560 },
    { symbol: 'JNJ', qty: 15, costBasis: 158, manualPrice: 151 },
  ],
  cash: 1800,
};
