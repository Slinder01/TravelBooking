import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';

interface CacheEntry { rates: Record<string, number>; fetchedAt: number }

@Injectable()
export class FxService {
  private cache = new Map<string, CacheEntry>();
  private TTL = 60 * 60 * 1000;   // 1 hour

  private async getRates(base: string): Promise<Record<string, number>> {
    const hit = this.cache.get(base);
    if (hit && Date.now() - hit.fetchedAt < this.TTL) return hit.rates;
    try {
      const key = process.env.FXRATES_API_KEY;
      const url = `https://api.fxratesapi.com/latest?base=${base}${key ? `&api_key=${key}` : ''}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`FX API status ${res.status}`);
      const data: any = await res.json();
      if (!data?.success || !data.rates) throw new Error('Bad FX payload');
      this.cache.set(base, { rates: data.rates, fetchedAt: Date.now() });
      return data.rates;
    } catch {
      if (hit) return hit.rates;                       // stale cache beats failing
      throw new ServiceUnavailableException('Exchange rates are currently unavailable');
    }
  }

  assertCode(code: string) {
    if (!/^[A-Z]{3}$/.test(code)) throw new BadRequestException(`Invalid currency code: ${code}`);
    // Also validate against the currency codes found in Countries.csv (load them once at startup).
  }

  async convert(amount: number, from: string, to: string): Promise<number> {
    from = from.toUpperCase(); to = to.toUpperCase();
    this.assertCode(from); this.assertCode(to);
    if (from === to) return amount;
    const rates = await this.getRates(from);
    const rate = rates[to];
    if (!rate) throw new BadRequestException(`No exchange rate available for ${from} -> ${to}`);
    return amount * rate;
  }
}
