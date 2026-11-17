/**
 * 界面语言。core 里拼出来的句子都按 lang 输出；默认 'zh'，旧调用不用改。
 * 主题、行业、规则名在数据里仍用中文做内部键，只在显示时翻译。
 */
import { FINNHUB_INDUSTRY_ZH } from './classify';

export type Lang = 'zh' | 'en';

/** 内置主题和板块名（中文内部键）→ 英文 */
const NAME_EN: Record<string, string> = {
  '半导体/AI': 'Semiconductors/AI',
  大型科技: 'Big Tech',
  云与企业软件: 'Cloud & Software',
  金融支付: 'Payments',
  金融: 'Financials',
  必需消费: 'Consumer Staples',
  可选消费: 'Consumer Discretionary',
  医疗健康: 'Health Care',
  能源: 'Energy',
  宽基指数: 'Broad Index',
  '汽车/EV': 'Autos/EV',
  其他: 'Other',
  工业: 'Industrials',
  纳指100: 'Nasdaq-100',
  标普500: 'S&P 500',
  罗素2000: 'Russell 2000',
};

/** Finnhub 行业的中文名反查回英文原文 */
const INDUSTRY_EN: Record<string, string> = Object.fromEntries(
  Object.entries(FINNHUB_INDUSTRY_ZH).map(([en, zh]) => [zh, en]),
);

/** 主题、行业、板块名按语言显示。用户自己填的名字原样返回。 */
export function nameIn(name: string, lang: Lang): string {
  if (lang === 'zh') return name;
  return NAME_EN[name] ?? INDUSTRY_EN[name] ?? name;
}

export function joinList(items: string[], lang: Lang): string {
  return items.join(lang === 'zh' ? '、' : ', ');
}

/** 默认账户名在数据里存的是「我的账户」 */
export function accountName(name: string, lang: Lang): string {
  return lang === 'en' && name === '我的账户' ? 'My account' : name;
}

export type Level = '高' | '中' | '低';

export function levelName(level: Level, lang: Lang): string {
  if (lang === 'zh') return level;
  return { 高: 'High', 中: 'Medium', 低: 'Low' }[level];
}
