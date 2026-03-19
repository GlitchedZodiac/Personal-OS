import { addDays, differenceInCalendarDays, startOfDay } from "date-fns";
import { prisma } from "@/lib/prisma";
import { normalizeCurrencyCode } from "@/lib/finance/money";

interface ExchangeRateLookup {
  rate: number;
  rateDate: Date;
  provider: string;
}

export interface CopNormalizationResult {
  amount: number | null;
  currency: "COP";
  sourceAmount: number | null;
  sourceCurrency: string | null;
  fxRate: number | null;
  fxDate: Date | null;
  requiresCurrencyReview: boolean;
}

function getRateDate(date: Date) {
  return startOfDay(date);
}

async function findStoredSnapshot(baseCurrency: string, quoteCurrency: string, rateDate: Date) {
  return prisma.exchangeRateSnapshot.findFirst({
    where: {
      baseCurrency,
      quoteCurrency,
      rateDate: {
        gte: rateDate,
        lt: addDays(rateDate, 1),
      },
    },
  });
}

async function storeSnapshot(params: {
  baseCurrency: string;
  quoteCurrency: string;
  rateDate: Date;
  rate: number;
  provider: string;
  sourceUrl?: string;
  rawPayload?: unknown;
}) {
  return prisma.exchangeRateSnapshot.upsert({
    where: {
      baseCurrency_quoteCurrency_rateDate_provider: {
        baseCurrency: params.baseCurrency,
        quoteCurrency: params.quoteCurrency,
        rateDate: params.rateDate,
        provider: params.provider,
      },
    },
    update: {
      rate: params.rate,
      sourceUrl: params.sourceUrl ?? undefined,
      rawPayload: params.rawPayload ? JSON.parse(JSON.stringify(params.rawPayload)) : undefined,
    },
    create: {
      baseCurrency: params.baseCurrency,
      quoteCurrency: params.quoteCurrency,
      rateDate: params.rateDate,
      rate: params.rate,
      provider: params.provider,
      sourceUrl: params.sourceUrl ?? null,
      rawPayload: params.rawPayload ? JSON.parse(JSON.stringify(params.rawPayload)) : undefined,
    },
  });
}

async function fetchSuperfinancieraUsdCop(date: Date): Promise<ExchangeRateLookup> {
  const rateDate = getRateDate(date);
  const stored = await findStoredSnapshot("USD", "COP", rateDate);
  if (stored) {
    return {
      rate: stored.rate,
      rateDate,
      provider: stored.provider,
    };
  }

  const sourceUrl =
    "https://app-sfc-prod-webservicetrm.azurewebsites.net/SuperfinancieraWebServiceTRM/TCRMServicesWebService/TCRMServicesWebService";
  const day = rateDate.toISOString().slice(0, 10);
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:act="http://action.trm.services.generic.action.superfinanciera.nexura.sc.com.co/">
  <soapenv:Header/>
  <soapenv:Body>
    <act:queryTCRM>
      <tcrmQueryAssociatedDate>${day}</tcrmQueryAssociatedDate>
    </act:queryTCRM>
  </soapenv:Body>
</soapenv:Envelope>`;

  const response = await fetch(sourceUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=UTF-8",
      SOAPAction: '""',
    },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Superfinanciera TRM request failed: ${response.status}`);
  }

  const xml = await response.text();
  const successMatch = xml.match(/<success>(true|false)<\/success>/i);
  const valueMatch = xml.match(/<value>([\d.]+)<\/value>/i);
  if (successMatch?.[1] !== "true" || !valueMatch?.[1]) {
    throw new Error("Superfinanciera TRM response did not include a usable USD/COP rate");
  }

  const rate = Number(valueMatch[1]);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("Invalid Superfinanciera TRM rate");
  }

  await storeSnapshot({
    baseCurrency: "USD",
    quoteCurrency: "COP",
    rateDate,
    rate,
    provider: "superfinanciera_trm",
    sourceUrl,
    rawPayload: xml.slice(0, 4000),
  });

  return {
    rate,
    rateDate,
    provider: "superfinanciera_trm",
  };
}

async function fetchEcbRatesForDate(date: Date) {
  const rateDate = getRateDate(date);
  const day = rateDate.toISOString().slice(0, 10);
  const recentUrl = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml";
  const fullUrl = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml";
  const useRecent = differenceInCalendarDays(new Date(), rateDate) <= 90;
  const sourceUrl = useRecent ? recentUrl : fullUrl;

  const response = await fetch(sourceUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`ECB FX request failed: ${response.status}`);
  }

  const xml = await response.text();
  const blockMatch = xml.match(new RegExp(`<Cube time=['"]${day}['"]>([\\s\\S]*?)<\\/Cube>`));
  if (!blockMatch?.[1]) {
    throw new Error(`ECB FX did not include rates for ${day}`);
  }

  const rates = new Map<string, number>();
  for (const match of blockMatch[1].matchAll(/currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g)) {
    const currency = match[1];
    const rate = Number(match[2]);
    if (Number.isFinite(rate) && rate > 0) {
      rates.set(currency, rate);
    }
  }

  if (rates.size === 0) {
    throw new Error("ECB FX did not return any usable rates");
  }

  return { rates, rateDate, sourceUrl, rawPayload: blockMatch[1] };
}

async function fetchCrossRateToCop(currency: string, date: Date): Promise<ExchangeRateLookup> {
  const rateDate = getRateDate(date);
  const stored = await findStoredSnapshot(currency, "COP", rateDate);
  if (stored) {
    return {
      rate: stored.rate,
      rateDate,
      provider: stored.provider,
    };
  }

  const usdCop = await fetchSuperfinancieraUsdCop(rateDate);
  const ecb = await fetchEcbRatesForDate(rateDate);
  const usdPerEur = ecb.rates.get("USD");

  if (!usdPerEur) {
    throw new Error("ECB cross rates are missing USD");
  }

  let rate: number | null = null;
  if (currency === "EUR") {
    rate = usdPerEur * usdCop.rate;
  } else {
    const currencyPerEur = ecb.rates.get(currency);
    if (!currencyPerEur) {
      throw new Error(`ECB does not publish ${currency}/EUR for ${rateDate.toISOString().slice(0, 10)}`);
    }
    rate = (usdPerEur / currencyPerEur) * usdCop.rate;
  }

  if (!Number.isFinite(rate) || (rate || 0) <= 0) {
    throw new Error(`Invalid ${currency}/COP cross rate`);
  }

  await storeSnapshot({
    baseCurrency: currency,
    quoteCurrency: "COP",
    rateDate,
    rate,
    provider: "ecb_cross_via_usd_cop",
    sourceUrl: ecb.sourceUrl,
    rawPayload: {
      usdCop: usdCop.rate,
      ecbBlock: ecb.rawPayload,
    },
  });

  return {
    rate,
    rateDate,
    provider: "ecb_cross_via_usd_cop",
  };
}

export async function getExchangeRateToCop(currency: string, date: Date) {
  const normalizedCurrency = normalizeCurrencyCode(currency);
  if (!normalizedCurrency) {
    throw new Error("Unknown source currency");
  }

  if (normalizedCurrency === "COP") {
    return {
      rate: 1,
      rateDate: getRateDate(date),
      provider: "identity",
    } satisfies ExchangeRateLookup;
  }

  if (normalizedCurrency === "USD") {
    return fetchSuperfinancieraUsdCop(date);
  }

  return fetchCrossRateToCop(normalizedCurrency, date);
}

export async function normalizeAmountToCop(params: {
  amount?: number | null;
  currency?: string | null;
  date?: Date | null;
}) {
  const sourceAmount =
    typeof params.amount === "number" && Number.isFinite(params.amount) ? Math.abs(params.amount) : null;
  const sourceCurrency = normalizeCurrencyCode(params.currency);
  const rateDate = params.date ? getRateDate(params.date) : getRateDate(new Date());

  if (sourceAmount == null) {
    return {
      amount: null,
      currency: "COP",
      sourceAmount: null,
      sourceCurrency,
      fxRate: null,
      fxDate: null,
      requiresCurrencyReview: !sourceCurrency,
    } satisfies CopNormalizationResult;
  }

  if (!sourceCurrency) {
    return {
      amount: null,
      currency: "COP",
      sourceAmount,
      sourceCurrency: null,
      fxRate: null,
      fxDate: null,
      requiresCurrencyReview: true,
    } satisfies CopNormalizationResult;
  }

  if (sourceCurrency === "COP") {
    return {
      amount: sourceAmount,
      currency: "COP",
      sourceAmount,
      sourceCurrency,
      fxRate: 1,
      fxDate: rateDate,
      requiresCurrencyReview: false,
    } satisfies CopNormalizationResult;
  }

  try {
    const rate = await getExchangeRateToCop(sourceCurrency, rateDate);
    return {
      amount: Math.round(sourceAmount * rate.rate),
      currency: "COP",
      sourceAmount,
      sourceCurrency,
      fxRate: rate.rate,
      fxDate: rate.rateDate,
      requiresCurrencyReview: false,
    } satisfies CopNormalizationResult;
  } catch {
    return {
      amount: null,
      currency: "COP",
      sourceAmount,
      sourceCurrency,
      fxRate: null,
      fxDate: null,
      requiresCurrencyReview: true,
    } satisfies CopNormalizationResult;
  }
}
