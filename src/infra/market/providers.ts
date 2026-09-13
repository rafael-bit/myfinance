export type Quote = {
  code: string;
  price: number;
  asOf: string;
  source: string;
};

export type MarketDataProvider = {
  id: string;
  getQuotes(codes: string[]): Promise<Quote[]>;
};

export class CompositeMarketDataProvider implements MarketDataProvider {
  id = "composite";
  constructor(private readonly providers: MarketDataProvider[]) {}

  async getQuotes(codes: string[]): Promise<Quote[]> {
    const found = new Map<string, Quote>();
    for (const provider of this.providers) {
      try {
        const quotes = await provider.getQuotes(codes.filter((c) => !found.has(c)));
        for (const quote of quotes) found.set(quote.code, quote);
      } catch {
        continue;
      }
    }
    return [...found.values()];
  }
}

export class ManualMarketDataProvider implements MarketDataProvider {
  id = "manual";
  constructor(private readonly quotes: Quote[]) {}
  async getQuotes(codes: string[]): Promise<Quote[]> {
    return this.quotes.filter((q) => codes.includes(q.code));
  }
}

export class BcbMarketDataProvider implements MarketDataProvider {
  id = "bcb";
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async getQuotes(codes: string[]): Promise<Quote[]> {
    const series: Record<string, string> = { SELIC: "11", CDI: "12", IPCA: "433", USD: "1" };
    const wanted = codes.filter((c) => series[c]);
    const quotes: Quote[] = [];
    for (const code of wanted) {
      const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${series[code]}/dados/ultimos/1?formato=json`;
      const response = await this.fetchImpl(url);
      if (!response.ok) continue;
      const data = (await response.json()) as { data: string; valor: string }[];
      const last = data[0];
      if (!last) continue;
      quotes.push({
        code,
        price: Number(last.valor.replace(",", ".")),
        asOf: last.data.split("/").reverse().join("-"),
        source: "bcb",
      });
    }
    return quotes;
  }
}

export class BrapiMarketDataProvider implements MarketDataProvider {
  id = "brapi";
  constructor(
    private readonly token?: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async getQuotes(codes: string[]): Promise<Quote[]> {
    const tickers = codes.filter((c) => !["SELIC", "CDI", "IPCA", "USD"].includes(c));
    if (tickers.length === 0) return [];
    const url = new URL(`https://brapi.dev/api/quote/${tickers.join(",")}`);
    if (this.token) url.searchParams.set("token", this.token);
    const response = await this.fetchImpl(url.toString());
    if (!response.ok) return [];
    const json = (await response.json()) as {
      results?: { symbol: string; regularMarketPrice: number; regularMarketTime?: string }[];
    };
    return (json.results ?? []).map((r) => ({
      code: r.symbol,
      price: r.regularMarketPrice,
      asOf: r.regularMarketTime ?? new Date().toISOString().slice(0, 10),
      source: "brapi",
    }));
  }
}
