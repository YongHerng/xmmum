// Country selection changes the unit of the user's budget, not an exchange rate.
import countryCurrencies from '../../../shared/countries.json';
export const countries = countryCurrencies as [string, string][];

export function currencyForLocation(location: string): string | null {
  const normalized = location.trim().toLowerCase();
  const aliases: Record<string, string> = {uk:'GBP', usa:'USD', us:'USD', uae:'AED', 'united states of america':'USD', korea:'KRW'};
  if (aliases[normalized]) return aliases[normalized];
  return countries.find(([country]) => normalized === country.toLowerCase() || normalized.endsWith(`, ${country.toLowerCase()}`))?.[1] ?? null;
}

export function formatMoney(amount: number, currency: string | null): string {
  const value = Number.isFinite(amount) ? amount : 0;
  return currency
    ? new Intl.NumberFormat('en', {style:'currency', currency, currencyDisplay:'code', maximumFractionDigits:0}).format(value)
    : new Intl.NumberFormat('en', {maximumFractionDigits:0}).format(value);
}
