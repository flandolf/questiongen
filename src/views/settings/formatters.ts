// Rate as of 2026-05-18 (approx CNY per USD)
const USD_TO_CNY = 7.21;

export const fmt = {
  price(p: number | null, showCNY = false) {
    if (p == null) return '—';
    const usd = `$${(p * 1e6).toFixed(2)}/M`;
    if (!showCNY) return usd;
    const cny = `¥${(p * 1e6 * USD_TO_CNY).toFixed(2)}/M`;
    return `${usd} / ${cny}`;
  },
  priceCombined(a: number | null, b: number | null, showCNY = false) {
    if (a == null && b == null) return '—';
    const sum = (a ?? 0) + (b ?? 0);
    const usd = `$${(sum * 1e6).toFixed(2)}/M`;
    if (!showCNY) return usd;
    const cny = `¥${(sum * 1e6 * USD_TO_CNY).toFixed(2)}/M`;
    return `${usd} / ${cny}`;
  },
  tps(v: number | null) {
    return v == null ? '—' : `${v.toFixed(0)} t/s`;
  },
  latency(v: number | null) {
    return v == null
      ? '—'
      : v >= 1000
        ? `${(v / 1000).toFixed(2)} s`
        : `${v.toFixed(0)} ms`;
  },
  context(v: number | null) {
    return v == null
      ? '—'
      : v >= 1e6
        ? `${(v / 1e6).toFixed(1)}M`
        : v >= 1000
          ? `${(v / 1000).toFixed(0)}K`
          : String(v);
  },
  uptime(v: number | null) {
    return v == null ? '—' : `${v.toFixed(1)}%`;
  },
  time(d: Date | null) {
    return d
      ? d.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      : '';
  },
  cost(v: number) {
    if (v === 0) return '$0.00';
    if (v < 0.00001) return '<$0.00001';
    if (v < 0.01) return `$${v.toFixed(5)}`;
    return `$${v.toFixed(4)}`;
  },
  tokens(v: number) {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
    return v.toLocaleString();
  },
};
