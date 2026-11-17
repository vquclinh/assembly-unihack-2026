import type { Dict } from "./i18n";

/** An error with a stable code that the UI translates. */
export class AppError extends Error {
  code: string;
  detail?: string;
  constructor(code: string, detail?: string) {
    super(detail || code);
    this.code = code;
    this.detail = detail;
  }
}

export function errorText(t: Dict, e: unknown) {
  const err = e as { code?: string; message?: string; detail?: string };
  if (err?.code && t.errors[err.code]) {
    // AI failures carry the provider's reason (bad key, no credit, model gone): show it so it can be fixed.
    return err.code === "AiFailed" && err.detail ? `${t.errors[err.code]} (${err.detail.slice(0, 160)})` : t.errors[err.code];
  }
  const msg = err?.detail || err?.message || "";
  if (/user rejected|denied/i.test(msg)) return t.errors.UserRejected;
  return msg || t.errors.Unknown;
}
