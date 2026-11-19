#!/usr/bin/env python3
"""
更新内置的 ETF 前十大成分表（packages/core/src/etfData.ts）。

数据来自基金公司公开的每日持仓文件（State Street SPDR 系列），只取前十大：
  holdings-daily-us-en-<代码>.xlsx  每只成分股的权重和持股数
  navhist-us-en-<代码>.xlsx         基金的流通份额（Shares Outstanding）

每一份 ETF 里含多少股某只股票（units = 持股数 ÷ 基金流通份额）在基金不调仓时是固定的，
网页上用「units × 成分股现价 ÷ ETF 现价」就能算出当前的真实权重，不用再拉历史价格。

只用标准库。用法：python3 scripts/update_etf_holdings.py
"""
import io
import json
import re
import sys
import urllib.request
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime

SSGA = 'https://www.ssga.com/library-content/products/fund-data/etfs/us/{kind}-us-en-{sym}.xlsx'
FUNDS = ['SPY', 'XLK', 'XLY', 'XLE', 'XLF', 'XLV', 'XLI', 'XLP', 'XLRE']
TOP_N = 10
NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
OUT = 'packages/core/src/etfData.ts'


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={'User-Agent': 'portus-etf-update (github.com/PixelBlue-LLC/portus)'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def read_xlsx(data: bytes) -> list[list[str]]:
    """最简单的 xlsx 读取：第一张表，所有单元格当字符串"""
    z = zipfile.ZipFile(io.BytesIO(data))
    shared = []
    if 'xl/sharedStrings.xml' in z.namelist():
        root = ET.fromstring(z.read('xl/sharedStrings.xml'))
        for si in root.findall('m:si', NS):
            shared.append(''.join(t.text or '' for t in si.iter('{%s}t' % NS['m'])))
    sheet = sorted(n for n in z.namelist() if n.startswith('xl/worksheets/sheet'))[0]
    root = ET.fromstring(z.read(sheet))
    rows = []
    for row in root.iter('{%s}row' % NS['m']):
        cells = {}
        for c in row.findall('m:c', NS):
            ref = c.get('r', '')
            col = 0
            for ch in re.match(r'[A-Z]+', ref).group(0):
                col = col * 26 + ord(ch) - 64
            v = c.find('m:v', NS)
            is_ = c.find('m:is', NS)
            if c.get('t') == 's' and v is not None:
                val = shared[int(v.text)]
            elif is_ is not None:
                val = ''.join(t.text or '' for t in is_.iter('{%s}t' % NS['m']))
            else:
                val = v.text if v is not None else ''
            cells[col - 1] = val or ''
        rows.append([cells.get(i, '') for i in range(max(cells) + 1)] if cells else [])
    return rows


def as_of(rows: list[list[str]]) -> str:
    for r in rows[:6]:
        for c in r:
            m = re.search(r'As of (\d{1,2}-[A-Za-z]{3}-\d{4})', c)
            if m:
                return datetime.strptime(m.group(1), '%d-%b-%Y').strftime('%Y-%m-%d')
    raise ValueError('no as-of date')


def fund(sym: str) -> dict:
    hold = read_xlsx(fetch(SSGA.format(kind='holdings-daily', sym=sym.lower())))
    date = as_of(hold)
    head = next(i for i, r in enumerate(hold) if r[:2] == ['Name', 'Ticker'])
    cols = hold[head]
    ci = {k: cols.index(k) for k in ['Name', 'Ticker', 'Weight', 'Shares Held']}
    name = hold[0][1] if len(hold[0]) > 1 else sym
    rows = []
    for r in hold[head + 1:]:
        if len(r) <= ci['Shares Held'] or not r[ci['Ticker']] or r[ci['Ticker']] in ('-', 'CASH_USD'):
            continue
        try:
            rows.append((r[ci['Ticker']].strip().upper(), float(r[ci['Weight']]), float(r[ci['Shares Held']])))
        except ValueError:
            continue
    rows.sort(key=lambda x: -x[1])
    nav = read_xlsx(fetch(SSGA.format(kind='navhist', sym=sym.lower())))
    nh = next(i for i, r in enumerate(nav) if r[:1] == ['Date'])
    ncols = nav[nh]
    # 和持仓同一天的流通份额
    want = datetime.strptime(date, '%Y-%m-%d').strftime('%d-%b-%Y')
    line = next(r for r in nav[nh + 1:] if r and r[0] == want)
    shares_out = float(line[ncols.index('Shares Outstanding')])
    top = [[t, round(w, 2), round(s / shares_out, 6)] for t, w, s in rows[:TOP_N]]
    return {'name': re.sub(r'\s*[®™]', '', name).replace('State Street ', '').strip(), 'asOf': date, 'top': top}


def main() -> int:
    out = {}
    for sym in FUNDS:
        try:
            out[sym] = fund(sym)
            print(sym, out[sym]['asOf'], out[sym]['top'][0], file=sys.stderr)
        except Exception as e:  # 一只失败不影响其他
            print(f'{sym}: {e}', file=sys.stderr)
    if not out:
        return 1
    lines = [
        '// 由 scripts/update_etf_holdings.py 生成，不要手改。数据来自 State Street 公开的每日持仓文件。',
        '// top: [代码, 占基金 %, 每份 ETF 含该股票的股数]',
        "import type { EtfProfile } from './etf';",
        '',
        'export const SSGA_HOLDINGS: Record<string, EtfProfile> = {',
    ]
    for sym, f in out.items():
        top = ', '.join(json.dumps(x) for x in f['top'])
        lines.append(f"  {sym}: {{ name: {json.dumps(f['name'], ensure_ascii=False)}, asOf: '{f['asOf']}', top: [{top}] }},")
    lines.append('};')
    with open(OUT, 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(lines) + '\n')
    return 0


if __name__ == '__main__':
    sys.exit(main())
