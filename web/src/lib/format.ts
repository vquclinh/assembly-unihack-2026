import { formatUnits, parseUnits } from "viem";
import { USDC_DECIMALS, VND_PER_USDC } from "./config";
import type { Dict } from "./i18n";

export function usdcNumber(x: bigint) {
  return Number(formatUnits(x, USDC_DECIMALS));
}

export function fmtUsdc(x: bigint, locale = "en-US") {
  return `${usdcNumber(x).toLocaleString(locale, { maximumFractionDigits: 2 })} USDC`;
}

/** Display-only VND equivalent, rounded to the nearest thousand. */
export function fmtVnd(x: bigint, locale = "en-US") {
  const vnd = Math.round((usdcNumber(x) * VND_PER_USDC) / 1000) * 1000;
  return `${vnd.toLocaleString(locale)} ₫`;
}

/** Converts a VND amount typed by a landlord into the token amount, rounded to cents. */
export function vndToUsdc(vnd: number): bigint {
  const usdc = Math.round((vnd / VND_PER_USDC) * 100) / 100;
  return parseUnits(usdc.toFixed(2), USDC_DECIMALS);
}

export function shortAddr(a?: string) {
  if (!a) return "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function fmtDuration(seconds: number, t: Dict) {
  const s = Math.max(0, Math.floor(seconds));
  return t.units.duration(Math.floor(s / 86400), Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60);
}

export function fmtDate(unix: number | bigint, locale = "en-US") {
  return new Date(Number(unix) * 1000).toLocaleString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Parses "3.000.000", "3,000,000" or "3000000" into a number. */
export function parseVnd(s: string) {
  const n = Number(s.replace(/[^\d]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
