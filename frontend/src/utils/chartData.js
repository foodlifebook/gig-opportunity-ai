/**
 * chartData.js
 * Transform cleaned backend data into Recharts-ready formats.
 */

/**
 * Build line chart data for Total Orders trend.
 * Returns: [{ date: '2026-03-11', totalOrders: 450 }, ...]
 */
export function buildTotalOrdersLineData(cleanedRows, dates) {
  return dates.map((date) => {
    const totalForDate = cleanedRows.reduce((sum, row) => {
      const seriesKey = Object.keys(row).find((k) => {
        if (!k.startsWith('_series_')) return false;
        const normalized = k.replace('_series_', '').toLowerCase().replace(/[_\s]/g, '');
        return normalized === 'totalorders';
      });
      if (!seriesKey) return sum;
      const point = row[seriesKey].find((p) => p.date === date);
      return sum + (point ? point.value : 0);
    }, 0);
    return { date, totalOrders: totalForDate };
  });
}

/**
 * Build bar chart data for Orders in Queue per day.
 * Returns: [{ date: '2026-03-11', ordersInQueue: 23 }, ...]
 * Shows average queue per gig for each date (not total)
 */
export function buildQueueBarData(cleanedRows, dates) {
  return dates.map((date) => {
    const totalForDate = cleanedRows.reduce((sum, row) => {
      const seriesKey = Object.keys(row).find((k) => {
        if (!k.startsWith('_series_')) return false;
        const normalized = k.replace('_series_', '').toLowerCase().replace(/[_\s]/g, '');
        return normalized === 'ordersinqueue';
      });
      if (!seriesKey) return sum;
      const point = row[seriesKey].find((p) => p.date === date);
      return sum + (point ? point.value : 0);
    }, 0);
    return { date, ordersInQueue: totalForDate };
  });
}

/**
 * Build pie chart data for Saturation levels.
 * Buckets total orders per gig into <100, 100-500, 500+
 */
export function buildSaturationPieData(cleanedRows) {
  const buckets = { low: 0, mid: 0, high: 0 };

  for (const row of cleanedRows) {
    const seriesKey = Object.keys(row).find((k) => {
      if (!k.startsWith('_series_')) return false;
      const normalized = k.replace('_series_', '').toLowerCase().replace(/[_\s]/g, '');
      return normalized === 'totalorders';
    });
    if (!seriesKey) continue;
    const points = row[seriesKey];
    const maxOrders = points.length > 0 ? Math.max(...points.map((p) => p.value)) : 0;
    if (maxOrders < 100) buckets.low++;
    else if (maxOrders <= 500) buckets.mid++;
    else buckets.high++;
  }

  return [
    { name: '< 100 orders', value: buckets.low, fill: '#22c55e' },
    { name: '100–500 orders', value: buckets.mid, fill: '#f59e0b' },
    { name: '500+ orders', value: buckets.high, fill: '#ef4444' },
  ].filter((d) => d.value > 0);
}

/**
 * Returns score color utility classes.
 */
export function scoreColor(label) {
  if (label === 'GREEN') return { bg: 'bg-green-500', text: 'text-green-400', border: 'border-green-500', hex: '#22c55e' };
  if (label === 'YELLOW') return { bg: 'bg-yellow-500', text: 'text-yellow-400', border: 'border-yellow-500', hex: '#f59e0b' };
  return { bg: 'bg-red-500', text: 'text-red-400', border: 'border-red-500', hex: '#ef4444' };
}

/**
 * Format a date string for display (truncate to YYYY-MM-DD).
 */
export function fmtDate(d) {
  return String(d).slice(0, 10);
}
