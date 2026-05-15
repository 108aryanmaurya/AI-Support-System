import { HttpError } from '../../utils/httpError.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse `from` / `to` query (YYYY-MM-DD). Defaults: last 7 days ending today (UTC).
 * @returns {{ fromIso: string, toIso: string, fromDate: Date, toExclusive: Date, compareFromIso: string, compareToIso: string }}
 */
export function parseAnalyticsDateRange(query = {}) {
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  let toDate = todayUtc;
  if (query.to && typeof query.to === 'string' && ISO_DATE.test(query.to.trim())) {
    const [y, m, d] = query.to.trim().split('-').map(Number);
    toDate = new Date(Date.UTC(y, m - 1, d));
  }

  let fromDate = new Date(toDate);
  fromDate.setUTCDate(fromDate.getUTCDate() - 6);

  if (query.from && typeof query.from === 'string' && ISO_DATE.test(query.from.trim())) {
    const [y, m, d] = query.from.trim().split('-').map(Number);
    fromDate = new Date(Date.UTC(y, m - 1, d));
  }

  if (fromDate > toDate) {
    throw new HttpError(400, '`from` must be on or before `to`.');
  }

  const toExclusive = new Date(toDate);
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);

  const spanMs = toExclusive.getTime() - fromDate.getTime();
  const compareToExclusive = new Date(fromDate);
  const compareFrom = new Date(fromDate.getTime() - spanMs);

  const fmt = (d) => d.toISOString().slice(0, 10);

  return {
    fromIso: fmt(fromDate),
    toIso: fmt(toDate),
    fromDate,
    toExclusive,
    compareFromIso: fmt(compareFrom),
    compareToIso: fmt(new Date(compareToExclusive.getTime() - 86400000)),
    compareFrom,
    compareToExclusive,
  };
}

/** @param {number} current @param {number} previous */
export function deltaPercent(current, previous) {
  if (previous === 0) {
    if (current === 0) return 0;
    return 100;
  }
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
