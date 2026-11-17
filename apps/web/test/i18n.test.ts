import { describe, expect, it } from 'vitest';
import { MESSAGES, setLang, t } from '../src/i18n';

const CJK = /[一-鿿]/;
const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('界面文案', () => {
  it('每条都有中英两种，占位符一致', () => {
    for (const [key, [zh, en]] of Object.entries(MESSAGES)) {
      expect(zh.trim(), key).not.toBe('');
      expect(en.trim(), key).not.toBe('');
      expect(vars(en), key).toEqual(vars(zh));
    }
  });
  it('英文文案里没有中文（切换按钮本身除外）', () => {
    for (const [key, [, en]] of Object.entries(MESSAGES)) {
      if (key === 'foot.switchLang') continue;
      expect(CJK.test(en), `${key}: ${en}`).toBe(false);
    }
  });
  it('t 按当前语言取文案并填占位符', () => {
    setLang('en');
    expect(t('tile.positions', { n: 3 })).toBe('3 holdings');
    setLang('zh');
    expect(t('tile.positions', { n: 3 })).toBe('3 只持仓');
  });
});
