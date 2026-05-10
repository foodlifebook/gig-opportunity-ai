/**
 * bigmodel.js
 * BigModel GLM (ZhipuAI) integration via OpenAI-compatible REST API.
 */

const https = require('https');

function generateToken(apiKey) {
  const [id, secret] = apiKey.split('.');
  if (!id || !secret) throw new Error('Invalid BIGMODEL_API_KEY format. Expected "id.secret".');

  const now = Date.now();
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', sign_type: 'SIGN' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ api_key: id, exp: now + 3600000, timestamp: now })).toString('base64url');

  const crypto = require('crypto');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url');

  return `${header}.${payload}.${signature}`;
}

async function callGLM(messages, apiKey) {
  const token = generateToken(apiKey);
  const body = JSON.stringify({
    model: 'glm-4-flash',
    messages,
    temperature: 0.7,
    max_tokens: 1800,
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'open.bigmodel.cn',
        path: '/api/paas/v4/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              return reject(new Error(`BigModel API error: ${parsed.error.message || JSON.stringify(parsed.error)}`));
            }
            const text = parsed.choices?.[0]?.message?.content;
            if (!text) return reject(new Error('BigModel returned an empty response.'));
            resolve(text);
          } catch (e) {
            reject(new Error('Failed to parse BigModel response: ' + e.message));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

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

async function getBigModelInsights({ cleanedRows, scoreResult, dates }) {
  const apiKey = process.env.BIGMODEL_API_KEY;
  if (!apiKey) throw new Error('BIGMODEL_API_KEY is not set in environment variables.');

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

  const userPrompt = `You are a Fiverr niche expert and data analyst.
Generate a complete detailed analysis report.

## Data Summary
${JSON.stringify(summary, null, 2)}

## Sample Gig Data (first 5 rows, static fields only)
${JSON.stringify(sampleRows, null, 2)}

## Critical Requirement
You must explicitly evaluate every formula:
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
1. Executive Verdict
2. Formula-by-Formula Diagnostic (one subsection per formula)
3. Detailed Market Read: demand, competition, pricing, underserved buyer gaps
4. Recommended Positioning: titles, keywords, pricing tiers
5. Red Flags and what to monitor weekly
6. Regeneration Strategy: what changes could increase the final score
7. Final recommendation: Enter / Test / Avoid with reason

Be direct, practical, and specific.`;

  return callGLM(
    [
      { role: 'system', content: 'You are a helpful Fiverr niche analysis assistant. Always respond in markdown.' },
      { role: 'user', content: userPrompt },
    ],
    apiKey
  );
}

module.exports = { getBigModelInsights };
