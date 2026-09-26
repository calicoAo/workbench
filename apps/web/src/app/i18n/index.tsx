import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { englishMessages } from "./messages";

export type Locale = "zh-CN" | "en";
type Values = Record<string, string | number>;
type DateValue = Date | string | number;

const STORAGE_KEY = "workbench:locale";
const DEFAULT_LOCALE: Locale = "zh-CN";
let activeLocale: Locale = DEFAULT_LOCALE;

function isLocale(value: unknown): value is Locale { return value === "zh-CN" || value === "en"; }
function initialLocale(): Locale { const cached = globalThis.localStorage?.getItem(STORAGE_KEY); activeLocale = isLocale(cached) ? cached : DEFAULT_LOCALE; return activeLocale; }
function interpolate(template: string, values?: Values) { return values ? template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? "{" + key + "}")) : template; }
export function tx(message: string, values?: Values) { return interpolate(activeLocale === "en" ? englishMessages[message] ?? message : message, values); }
export function getActiveLocale() { return activeLocale; }
export function formatNumber(value: number | bigint, options?: Intl.NumberFormatOptions) { return new Intl.NumberFormat(activeLocale, options).format(value); }
export function formatDate(value: DateValue, options?: Intl.DateTimeFormatOptions) { return new Intl.DateTimeFormat(activeLocale, options).format(new Date(value)); }
function currencyForLocale(locale: Locale, cents: string | number | bigint, options?: Intl.NumberFormatOptions) {
  const value = BigInt(cents);
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const major = new Intl.NumberFormat(locale, { useGrouping: true, maximumFractionDigits: 0 }).format(absolute / 100n);
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  const parts = new Intl.NumberFormat(locale, { style: "currency", currency: "CNY", minimumFractionDigits: 2, maximumFractionDigits: 2, ...options }).formatToParts(negative ? -0 : 0);
  return parts.map((part) => part.type === "integer" ? major : part.type === "fraction" ? fraction : part.value).join("");
}
export function formatCurrencyCents(cents: string | number | bigint, options?: Intl.NumberFormatOptions) { return currencyForLocale(activeLocale, cents, options); }

type I18nValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (message: string, values?: Values) => string;
  number: (value: number, options?: Intl.NumberFormatOptions) => string;
  date: (value: DateValue, options?: Intl.DateTimeFormatOptions) => string;
  currency: (cents: string | number | bigint, options?: Intl.NumberFormatOptions) => string;
};

const fallback: I18nValue = {
  locale: DEFAULT_LOCALE,
  setLocale: () => undefined,
  t: (message, values) => interpolate(message, values),
  number: formatNumber,
  date: formatDate,
  currency: formatCurrencyCents
};

const I18nContext = createContext<I18nValue>(fallback);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  activeLocale = locale;
  const value = useMemo<I18nValue>(() => ({
    locale,
    setLocale(next) { activeLocale = next; setLocaleState(next); },
    t: tx,
    number(number, options) { return new Intl.NumberFormat(locale, options).format(number); },
    date(date, options) { return new Intl.DateTimeFormat(locale, options).format(new Date(date)); },
    currency(cents, options) { return currencyForLocale(locale, cents, options); }
  }), [locale]);
  useEffect(() => { document.documentElement.lang = locale; localStorage.setItem(STORAGE_KEY, locale); }, [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  activeLocale = value.locale;
  return value;
}
