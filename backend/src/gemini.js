const { GoogleGenerativeAI } = require('@google/generative-ai');

const MODEL_PREFERENCE = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-2.0-pro-exp',
  'gemini-1.5-flash-latest',
  'gemini-1.5-pro-latest',
];

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

function compactFormulas(scoreResult) {
  const formulas = scoreResult?.formulas || {};
  const out = {};
  for (const [key, f] of Object.entries(formulas)) {
    out[key] = {
      name: f.name,
      score: f.score,
      label: f.label,
      formula: f.formula,
      interpretation: f.interpretation,
      note: f.note,
      proxyUsed: f.proxyUsed,
      proxyScore: f.proxyScore,
      proxyFormula: f.proxyFormula,
    };
  }
  return out;
}

async function getGeminiInsights({ cleanedRows, scoreResult, dates, preferredModel }) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set in environment variables.');
  }

  const summary = {
    rowCount: cleanedRows.length,
    dateRange: dates.length > 0 ? `${dates[0]} to ${dates[dates.length - 1]}` : 'unknown',
    finalOpportunityScore: scoreResult.score,
    scoreLabel: scoreResult.label,
    primaryFormula: scoreResult.primaryFormula,
    avgOrdersInQueue: scoreResult.avgQueue,
    avgDailyGrowthTotalOrders: scoreResult.avgGrowth,
    avgPrice: scoreResult.avgPrice,
    avgRating: scoreResult.avgRating,
    marketMetrics: scoreResult.details || {},
    formulas: compactFormulas(scoreResult),
  };

  const sampleRows = cleanedRows.slice(0, 5).map((row) => {
    const sample = {};
    for (const [k, v] of Object.entries(row)) {
      if (!k.startsWith('_series_') && k !== '_rowIndex') sample[k] = v;
    }
    return sample;
  });

  const prompt = `You are a Fiverr niche expert and data analyst.
Analyze the dataset and produce a complete strategy report.

## Data Summary
${JSON.stringify(summary, null, 2)}

## Sample Gig Data (first 5 rows, static fields only)
${JSON.stringify(sampleRows, null, 2)}

## Critical Requirement
Use and explicitly reference EVERY formula below in your analysis:
- Demand vs Supply Ratio
- Demand/Supply Upgrade (Top 20)
- Revenue Density
- Competition Quality Score
- Entry Ease Ratio
- Momentum / Trend Score
- Saturation Gap Index (SGI)
- Entry Feasibility Score
- Keyword Discovery Proxy
- Master Formula
- Final Opportunity Composite (0-100)

## Output Format (Markdown)
1. **Executive Verdict** (enter now / test small / avoid)
2. **Formula-by-Formula Breakdown**
   - For each formula: value, interpretation, and what action it implies.
3. **Detailed Opportunity Analysis**
   - Demand quality
   - Competition weaknesses
   - Pricing power
   - Entry feasibility for a new/Level 1 seller
4. **Recommended Gig Positioning**
   - 2-3 gig titles
   - 5-8 tags/keywords
   - Starter/Standard/Premium prices
5. **Risk Flags**
6. **30-Day Execution Plan** (5 concrete actions)
7. **Final Score Summary Table**

Be concise, specific, data-driven, and actionable.`;

  const modelsToTry = preferredModel
    ? [preferredModel, ...MODEL_PREFERENCE.filter((m) => m !== preferredModel)]
    : MODEL_PREFERENCE;

  let lastError;
  for (const modelName of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return { text: response.text(), model: modelName };
    } catch (err) {
      lastError = err;
      const msg = err.message || '';

      if (
        msg.includes('not found') ||
        msg.includes('404') ||
        msg.includes('not supported') ||
        msg.includes('deprecated') ||
        msg.includes('This model is not supported') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('quota') ||
        msg.includes('exceeded')
      ) {
        continue;
      }

      if (msg.includes('unauthenticated') || msg.includes('API key')) {
        throw new Error(`Gemini API Authentication Error: Check your GEMINI_API_KEY. ${msg}`);
      }
    }
  }

  const errorMsg = lastError?.message || 'Unknown error';
  throw new Error(`Gemini: all configured models failed. Last error: ${errorMsg}`);
}

module.exports = { getGeminiInsights };
