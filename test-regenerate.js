// Automated regenerate AI flow test
// Usage: set SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, then: node test-regenerate.js
// Exits 0 on success, non-zero on failure.

const {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
} = process.env;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required environment variables: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(2);
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function insertCompletedScan() {
  const body = {
    target_url: 'https://example.com',
    scan_status: 'completed',
    overall_score: 70,
    performance_results: { score: 70 },
    security_results: { issues: [], checks_performed: 7, checks_passed: 7, https_enabled: true },
    accessibility_results: { total_issues: 0, score: 95 },
    top_issues: [],
  };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/scan_results`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Insert failed: ${res.status} ${txt}`);
  }

  const data = await res.json();
  if (!Array.isArray(data) || !data[0]?.id) throw new Error('Unexpected insert response');
  return data[0].id;
}

async function callRegenerate(scanId) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/regenerate-ai`, {
    method: 'POST',
    headers: {
      // Use service role for function auth locally
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ scanId })
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`Regenerate call failed: ${res.status} ${txt}`);
  try { return JSON.parse(txt); } catch { return {}; }
}

async function pollForAI(scanId) {
  const start = Date.now();
  while (Date.now() - start < 60000) { // 60s timeout
    const res = await fetch(`${SUPABASE_URL}/rest/v1/scan_results?id=eq.${scanId}`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      }
    });
    const rows = await res.json();
    const row = rows[0];
    if (row?.ai_summary) {
      return row;
    }
    await sleep(3000);
  }
  throw new Error('Timeout waiting for ai_summary');
}

(async () => {
  try {
    console.log('Creating completed scan row...');
    const scanId = await insertCompletedScan();
    console.log('Scan ID:', scanId);

    console.log('Calling regenerate-ai function...');
    const regenResp = await callRegenerate(scanId);
    console.log('Initial regenerate response:', regenResp);

    console.log('Polling for AI summary...');
    const row = await pollForAI(scanId);

    console.log('AI summary length:', row.ai_summary.length);
    console.log('Recommendations count:', Array.isArray(row.ai_recommendations) ? row.ai_recommendations.length : 0);

    if (!row.ai_summary || row.ai_summary.length < 10) {
      throw new Error('AI summary too short or missing');
    }

    console.log('Regenerate AI test PASS');
    process.exit(0);
  } catch (err) {
    console.error('Regenerate AI test FAIL:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
})();
