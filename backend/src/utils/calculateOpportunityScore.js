/**
 * calculateOpportunityScore.js
 *
 * Computes a full Fiverr opportunity model using:
 * - Demand vs Supply
 * - Revenue Density
 * - Competition Quality
 * - Momentum / Trend
 * - Saturation Gap Index (SGI)
 * - Entry Feasibility
 * - Keyword Discovery Proxy
 * - Master Combined Score
 */

function average(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((sum, v) => sum + v, 0) / arr.length;
}

function sum(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((acc, v) => acc + v, 0);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function round(v, digits = 4) {
  const f = 10 ** digits;
  return Math.round((Number(v) || 0) * f) / f;
}

function safeDiv(numerator, denominator) {
  const d = Number(denominator) || 0;
  if (d === 0) return 0;
  return (Number(numerator) || 0) / d;
}

function scoreLabel(score) {
  if (score >= 60) return 'GREEN';
  if (score >= 35) return 'YELLOW';
  return 'RED';
}

function normalize01(v, maxRef) {
  return clamp(safeDiv(v, maxRef), 0, 1);
}

function parseNumber(value) {
  if (value == null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = String(value).replace(/[^\d.-]/g, '');
  const n = Number(parsed);
  return Number.isFinite(n) ? n : 0;
}

function findSeriesKey(row, containsText) {
  const needle = String(containsText).toLowerCase();
  return Object.keys(row).find(
    (k) => k.startsWith('_series_') && k.toLowerCase().includes(needle)
  );
}

function latestPointValue(points) {
  if (!points || points.length === 0) return 0;
  return parseNumber(points[points.length - 1]?.value);
}

function dailyGrowth(points) {
  if (!points || points.length < 2) return [];
  const deltas = [];
  for (let i = 1; i < points.length; i++) {
    const prev = parseNumber(points[i - 1]?.value);
    const curr = parseNumber(points[i]?.value);
    deltas.push({ date: points[i]?.date, delta: curr - prev });
  }
  return deltas;
}

function readStaticNumber(row, candidateFields) {
  for (const f of candidateFields) {
    if (Object.prototype.hasOwnProperty.call(row, f)) {
      const n = parseNumber(row[f]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return 0;
}

function analyzeSellerLevel(levelValue) {
  const level = String(levelValue || '').toLowerCase();
  return {
    topRated: level.includes('top rated'),
    level2: level.includes('level 2') || level.includes('level two'),
    level1: level.includes('level 1') || level.includes('level one'),
    newer: level.includes('new seller') || level === 'new' || level.includes('new level'),
  };
}

function buildFormulaScore(value, interpretation) {
  if (value >= interpretation.strongMin) return 'GREEN';
  if (value >= interpretation.moderateMin) return 'YELLOW';
  return 'RED';
}

/**
 * @param {{ cleanedRows: Array, seriesFields: Array<string> }} cleaned
 */
function calculateOpportunityScore({ cleanedRows, seriesFields }) {
  const rows = Array.isArray(cleanedRows) ? cleanedRows : [];
  const totalSellers = rows.length;

  const perGig = rows.map((row) => {
    const queueKey = findSeriesKey(row, 'ordersinqueue');
    const totalOrdersKey = findSeriesKey(row, 'totalorders');
    const reviewsKey = findSeriesKey(row, 'gigreviews');
    const priceOnDayKey = findSeriesKey(row, 'priceonday');

    const queueSeries = queueKey ? row[queueKey] : [];
    const totalOrdersSeries = totalOrdersKey ? row[totalOrdersKey] : [];
    const reviewsSeries = reviewsKey ? row[reviewsKey] : [];
    const priceOnDaySeries = priceOnDayKey ? row[priceOnDayKey] : [];

    const latestQueue = latestPointValue(queueSeries);
    const latestTotalOrders = latestPointValue(totalOrdersSeries);

    const staticPrice = readStaticNumber(row, ['price', 'avgPrice', 'startingPrice']);
    const dynamicPrice = latestPointValue(priceOnDaySeries);
    const effectivePrice = staticPrice || dynamicPrice || 0;

    const rating = readStaticNumber(row, ['rating', 'sellerRatingScore', 'avgRating']);

    const level = analyzeSellerLevel(row.sellerLevel || row.level || row.seller_level);

    const orderGrowth = dailyGrowth(totalOrdersSeries);
    const reviewGrowth = dailyGrowth(reviewsSeries);

    return {
      latestQueue,
      latestTotalOrders,
      effectivePrice,
      rating,
      level,
      orderGrowth,
      reviewGrowth,
      queueSeries,
      totalOrdersSeries,
      reviewsSeries,
    };
  });

  const sortedByOrders = [...perGig].sort((a, b) => b.latestTotalOrders - a.latestTotalOrders);
  const top20 = sortedByOrders.slice(0, Math.min(20, sortedByOrders.length));

  const totalOrdersQueue = sum(perGig.map((g) => g.latestQueue));
  const ordersQueueTop20 = sum(top20.map((g) => g.latestQueue));
  const avgQueue = average(perGig.map((g) => g.latestQueue));

  const avgPrice = average(perGig.map((g) => g.effectivePrice).filter((p) => p > 0));

  const topRatedSellers = perGig.filter((g) => g.level.topRated).length;
  const level2Sellers = perGig.filter((g) => g.level.level2).length;
  const level1Sellers = perGig.filter((g) => g.level.level1).length;
  const newSellers = perGig.filter((g) => g.level.newer).length;
  const lowLevelSellers = level1Sellers + newSellers;

  const allDailyGrowth = perGig.flatMap((g) => g.orderGrowth.map((x) => x.delta));
  const avgGrowth = average(allDailyGrowth);

  const dailyDeltaByDate = new Map();
  for (const g of perGig) {
    for (const p of g.orderGrowth) {
      const key = p.date || '';
      const prev = dailyDeltaByDate.get(key) || 0;
      dailyDeltaByDate.set(key, prev + Math.max(0, p.delta));
    }
  }
  const orderedDates = [...dailyDeltaByDate.keys()].sort();
  const positiveOrderDeltas = orderedDates.map((d) => dailyDeltaByDate.get(d) || 0);

  const last10Orders = sum(positiveOrderDeltas.slice(-10));
  const prev10Orders = sum(positiveOrderDeltas.slice(-20, -10));
  const momentumScore = safeDiv(last10Orders, prev10Orders || 1);

  const reviewDeltaByDate = new Map();
  for (const g of perGig) {
    for (const p of g.reviewGrowth) {
      const key = p.date || '';
      const prev = reviewDeltaByDate.get(key) || 0;
      reviewDeltaByDate.set(key, prev + Math.max(0, p.delta));
    }
  }
  const reviewDates = [...reviewDeltaByDate.keys()].sort();
  const reviewDeltas = reviewDates.map((d) => reviewDeltaByDate.get(d) || 0);
  const recentReviews = sum(reviewDeltas.slice(-10));
  const totalReviewsGrowth = sum(reviewDeltas);
  const momentumProxy = safeDiv(recentReviews, totalReviewsGrowth || 1);

  const totalSearchResults = totalSellers;

  const demandSupplyRatio = safeDiv(totalOrdersQueue, totalSellers || 1);
  const demandSupplyTop20VsResults = safeDiv(ordersQueueTop20, totalSearchResults || 1);

  const topSellerCount = Math.max(1, top20.length);
  const revenueDensity = safeDiv(avgPrice * ordersQueueTop20, topSellerCount);

  const competitionScore = safeDiv(level2Sellers + topRatedSellers, totalSellers || 1);
  const entryEaseRatio = safeDiv(lowLevelSellers, totalSellers || 1);

  const momentumFinal = momentumScore > 0 ? momentumScore : momentumProxy;

  const saturationGapIndex =
    safeDiv(totalOrdersQueue, totalSellers || 1) * safeDiv(1, Math.max(competitionScore, 0.05));

  const avgRating = average(perGig.map((g) => g.rating).filter((r) => r > 0));
  const entryFeasibility =
    safeDiv(totalOrdersQueue * lowLevelSellers, (totalSellers || 1) * (avgRating || 1));

  const keywordOpportunityProxy =
    demandSupplyTop20VsResults * (1 + entryEaseRatio) * (momentumFinal || 1);

  const masterFormulaRaw =
    demandSupplyRatio *
    safeDiv(avgPrice || 0, 100) *
    entryEaseRatio *
    (momentumFinal || 1);

  const demandNorm = normalize01(demandSupplyRatio, 30);
  const revenueNorm = normalize01(revenueDensity, 300);
  const competitionAdvantageNorm = normalize01(1 - competitionScore, 1);
  const momentumNorm = normalize01(momentumFinal, 2);
  const sgiNorm = normalize01(saturationGapIndex, 80);
  const feasibilityNorm = normalize01(entryFeasibility, 120);
  const keywordNorm = normalize01(keywordOpportunityProxy, 25);

  const compositeScore100 =
    (demandNorm * 0.2 +
      revenueNorm * 0.15 +
      competitionAdvantageNorm * 0.2 +
      momentumNorm * 0.15 +
      sgiNorm * 0.15 +
      feasibilityNorm * 0.1 +
      keywordNorm * 0.05) *
    100;

  const formulas = {
    demand_supply_ratio: {
      id: 'demand_supply_ratio',
      name: 'Demand vs Supply Ratio',
      formula: 'TotalOrdersInQueue / TotalActiveGigs',
      score: round(demandSupplyRatio, 4),
      label: buildFormulaScore(demandSupplyRatio, { strongMin: 0.5, moderateMin: 0.2 }),
      interpretation: 'Measures unmet demand per active gig.',
    },
    demand_supply_top20_vs_results: {
      id: 'demand_supply_top20_vs_results',
      name: 'Demand/Supply Upgrade (Top 20)',
      formula: 'OrdersInQueueTop20 / TotalSearchResults',
      score: round(demandSupplyTop20VsResults, 4),
      label: buildFormulaScore(demandSupplyTop20VsResults, { strongMin: 0.5, moderateMin: 0.2 }),
      interpretation: 'Focuses on strongest listings against overall market size.',
    },
    revenue_density: {
      id: 'revenue_density',
      name: 'Revenue Density',
      formula: '(AvgPrice × OrdersInQueueTop20) / Top20Sellers',
      score: round(revenueDensity, 4),
      label: buildFormulaScore(revenueDensity, { strongMin: 80, moderateMin: 30 }),
      interpretation: 'Where money concentration is strongest.',
    },
    competition_quality: {
      id: 'competition_quality',
      name: 'Competition Quality Score',
      formula: '(Level2 + TopRated) / TotalSellers',
      score: round(competitionScore, 4),
      label: competitionScore < 0.3 ? 'GREEN' : competitionScore <= 0.6 ? 'YELLOW' : 'RED',
      interpretation: 'Higher means stronger incumbents.',
    },
    entry_ease_ratio: {
      id: 'entry_ease_ratio',
      name: 'Entry Ease Ratio',
      formula: '(New + Level1) / TotalSellers',
      score: round(entryEaseRatio, 4),
      label: buildFormulaScore(entryEaseRatio, { strongMin: 0.45, moderateMin: 0.25 }),
      interpretation: 'Higher means easier entry for newer sellers.',
    },
    momentum_trend: {
      id: 'momentum_trend',
      name: 'Momentum / Trend Score',
      formula: 'OrdersLast10Days / OrdersPrevious10Days',
      score: round(momentumFinal, 4),
      label: momentumFinal > 1.3 ? 'GREEN' : momentumFinal >= 0.8 ? 'YELLOW' : 'RED',
      interpretation: 'Shows whether demand is accelerating.',
      proxyUsed: momentumScore === 0,
      proxyFormula: 'RecentReviews(last 10) / TotalReviewsGrowth',
      proxyScore: round(momentumProxy, 4),
    },
    saturation_gap_index: {
      id: 'saturation_gap_index',
      name: 'Saturation Gap Index (SGI)',
      formula: '(OrdersInQueue / TotalSellers) × (1 / CompetitionScore)',
      score: round(saturationGapIndex, 4),
      label: buildFormulaScore(saturationGapIndex, { strongMin: 25, moderateMin: 12 }),
      interpretation: 'Higher indicates undervalued keywords with unmet demand.',
    },
    entry_feasibility: {
      id: 'entry_feasibility',
      name: 'Entry Feasibility Score',
      formula: '(OrdersInQueue × LowLevelSellers) / (TotalSellers × AvgRating)',
      score: round(entryFeasibility, 4),
      label: buildFormulaScore(entryFeasibility, { strongMin: 8, moderateMin: 3 }),
      interpretation: 'Practical ease of penetrating this niche.',
    },
    keyword_discovery_proxy: {
      id: 'keyword_discovery_proxy',
      name: 'Keyword Discovery Proxy',
      formula: '(OrdersInQueueTop20 / Results) × (1 + EntryEase) × Momentum',
      score: round(keywordOpportunityProxy, 4),
      label: buildFormulaScore(keywordOpportunityProxy, { strongMin: 1.5, moderateMin: 0.8 }),
      interpretation: 'Internal proxy for hidden keyword opportunity.',
      note: 'External search-volume input is not present in CSV; proxy used.',
    },
    master_formula: {
      id: 'master_formula',
      name: 'Master Formula',
      formula: '(OrdersInQueue/TotalGigs) × (AvgPrice/100) × (LowLevelSellers/TotalSellers) × Momentum',
      score: round(masterFormulaRaw, 6),
      label: buildFormulaScore(masterFormulaRaw, { strongMin: 0.05, moderateMin: 0.02 }),
      interpretation: 'Unified raw multiplier from demand, pricing, entry ease, and momentum.',
    },
    final_opportunity_composite: {
      id: 'final_opportunity_composite',
      name: 'Final Opportunity Composite (0-100)',
      formula: 'Weighted blend of all formulas',
      score: round(compositeScore100, 2),
      label: scoreLabel(compositeScore100),
      interpretation: 'Primary score used in app. Combines all criteria.',
    },
  };

  return {
    score: round(compositeScore100, 2),
    label: scoreLabel(compositeScore100),
    avgQueue: round(avgQueue, 2),
    avgGrowth: round(avgGrowth, 4),
    avgPrice: round(avgPrice, 2),
    avgRating: round(avgRating, 3),
    primaryFormula: 'final_opportunity_composite',
    formulas,
    details: {
      totalSellers,
      totalActiveGigs: totalSellers,
      totalSearchResults,
      totalOrdersQueue: round(totalOrdersQueue, 2),
      ordersQueueTop20: round(ordersQueueTop20, 2),
      topSellerCount: topSellerCount,
      topRatedSellers,
      level2Sellers,
      level1Sellers,
      newSellers,
      lowLevelSellers,
      last10Orders: round(last10Orders, 2),
      prev10Orders: round(prev10Orders, 2),
      recentReviews: round(recentReviews, 2),
      totalReviewsGrowth: round(totalReviewsGrowth, 2),
      scoringNotes:
        'Primary score is a 0-100 weighted composite across demand, revenue, competition, momentum, SGI, feasibility, and keyword opportunity proxy.',
      seriesFields,
    },
  };
}

module.exports = { calculateOpportunityScore };
