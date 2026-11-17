import { describe, expect, it } from 'vitest';
import {
  attributionFacts,
  attributionFallback,
  attributionPrompt,
  buildPortfolio,
  computeConcentration,
  headline,
  nameIn,
  riskAlerts,
  riskBandName,
  ruleLabel,
  sectorLabels,
  subline,
  tomorrowWatch,
  violatesAdvicePolicy,
  type Quote,
  type SectorPerf,
} from '../src';

const CJK = /[一-鿿]/;
const q = (symbol: string, price: number, changePct: number): Quote => ({ symbol, price, changePct, asOf: '2026-11-05T21:00:00Z' });
// 虚构组合：全跌日，集中度超标
const view = buildPortfolio(
  [
    { symbol: 'NVDA', qty: 25, costBasis: 150 },
    { symbol: 'MU', qty: 3, costBasis: 900 },
    { symbol: 'XLV', qty: 4, costBasis: 180 },
  ],
  { NVDA: q('NVDA', 183.88, -8.12), MU: q('MU', 683.41, -14.06), XLV: q('XLV', 185, -0.4) },
  200,
);
const sectors: SectorPerf[] = [
  { symbol: 'XLP', name: '必需消费', changePct: -1.1 },
  { symbol: 'SOXX', name: '半导体', changePct: -10.76 },
  { symbol: 'XLV', name: '医疗健康', changePct: -0.4 },
];
const conc = computeConcentration(view);

describe('英文输出', () => {
  it('结论、补充句、归因、明日关注、风险提醒都没有中文', () => {
    const out = [
      headline(view, sectors, 'en'),
      subline(view, 'en'),
      attributionFacts(view, sectors, [], 'en'),
      ...attributionFallback(view, sectors, 'en'),
      ...tomorrowWatch({ view, sectors, concentration: conc, earnings: { NVDA: '2026-11-17' }, today: new Date('2026-11-10T00:00:00Z'), lang: 'en' }),
      ...riskAlerts(view, undefined, 'en').flatMap((a) => [a.rule, a.message]),
      attributionPrompt('x', 'en'),
      ...Object.values(sectorLabels(sectors, 'en')).filter((v): v is string => typeof v === 'string'),
    ];
    for (const s of out) expect(CJK.test(s), s).toBe(false);
    expect(headline(view, sectors, 'en')).toMatch(/^Semiconductors led a broad decline; portfolio −/);
    expect(subline(view, 'en')).toMatch(/% of the loss came from NVDA, MU\./);
  });
  it('中文输出保持原样', () => {
    expect(headline(view, sectors)).toMatch(/^半导体领跌全市场，组合今天 −/);
    expect(headline(view, sectors, 'zh')).toBe(headline(view, sectors));
  });
  it('名称翻译：内置主题和行业翻英文，用户自己起的名字不动', () => {
    expect(nameIn('半导体/AI', 'en')).toBe('Semiconductors/AI');
    expect(nameIn('医疗健康', 'en')).toBe('Health Care');
    expect(nameIn('我的主题', 'en')).toBe('我的主题');
    expect(nameIn('半导体/AI', 'zh')).toBe('半导体/AI');
    expect(ruleLabel({ type: 'top_n', label: '前三大持仓', n: 3 }, 'en')).toBe('Top 3 holdings');
    expect(ruleLabel({ type: 'single_max', label: '我的规则' }, 'en')).toBe('我的规则');
    expect(riskBandName('高风险', 'en')).toBe('High risk');
  });
});

describe('英文买卖措辞拦截', () => {
  it.each([
    'You should buy more NVDA here.',
    'I recommend selling MU before earnings.',
    'Consider trimming your NVDA position.',
    'Buy the dip.',
    'Our price target is $200.',
    'Set a stop-loss at $150.',
  ])('拦下：%s', (text) => expect(violatesAdvicePolicy(text)).toBe(true));
  it.each([
    'NVDA fell 8.1% today and was the biggest drag on the portfolio.',
    'The news gives no clear reason for the move.',
    'Semiconductors were the weakest sector; MU dropped 14%.',
  ])('放行：%s', (text) => expect(violatesAdvicePolicy(text)).toBe(false));
});
