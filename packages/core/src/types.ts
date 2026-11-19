/** 用户录入的一条持仓。价格可以手动填，也可以由行情源覆盖。 */
export interface Holding {
  symbol: string;
  qty: number;
  /** 每股成本 */
  costBasis: number;
  /** 手动填写的现价；有行情时以行情为准 */
  manualPrice?: number;
  /** 手动指定的主题，覆盖自动分类（旧版录入页留下的；新录入页不再填） */
  theme?: string;
  name?: string;
  /** 属于哪个券商账户，如 "Schwab"。没填的归「我的账户」 */
  account?: string;
  /** 由 aggregateBySymbol 填：这只股票分布在哪些账户 */
  accounts?: string[];
  /**
   * 不是股票代码（债券、期权合约等，券商导出里只有一段描述）：不拉行情，
   * 价格固定用导入时的「市值 ÷ 数量」，name 里是券商给的原始描述。
   */
  noQuote?: boolean;
}

/** 行情源返回的一只标的的报价 */
export interface Quote {
  symbol: string;
  price: number;
  /** 当日涨跌幅（%），如 -8.12 */
  changePct: number | null;
  prevClose?: number;
  high52?: number;
  low52?: number;
  /** ISO 时间 */
  asOf: string;
}

/** 由持仓 + 行情算出来的一行 */
export interface Position {
  symbol: string;
  name?: string;
  qty: number;
  costBasis: number;
  price: number;
  priceSource: 'quote' | 'manual' | 'cost';
  /** 总成本 = 数量 × 均价（券商叫 Cost Basis） */
  cost: number;
  marketValue: number;
  /** 当日盈亏（$）；没有涨跌幅数据时为 null */
  dayPnl: number | null;
  dayPct: number | null;
  totalPnl: number;
  totalPct: number | null;
  theme: string;
  sector: string;
  isTech: boolean;
  /** 占总市值（含现金）的比例 % */
  weight: number;
  /** 这只股票分布在哪些账户（合并显示时） */
  accounts?: string[];
  high52?: number;
  low52?: number;
  /** 见 Holding.noQuote */
  noQuote?: boolean;
}

export interface PortfolioView {
  positions: Position[];
  cash: number;
  /** 持仓市值 + 现金 */
  totalValue: number;
  /** 所有持仓都有涨跌幅时才有值 */
  dayPnl: number | null;
  totalPnl: number;
}

export interface SectorPerf {
  symbol: string;
  name: string;
  changePct: number;
}

export interface NewsItem {
  symbol: string;
  title: string;
  source: string;
  url: string;
  /** ISO 时间 */
  publishedAt: string;
  summary?: string;
}
