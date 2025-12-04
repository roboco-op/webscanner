#!/usr/bin/env node
/**
 * Smoke test: Insert a scan row, trigger web-scanner, and poll for results.
 * Run: node smoke-test.js
 * Tests cloud deployment with real PageSpeed API and Gemini AI
 */

const SUPABASE_URL = 'https://cxyswtdklznjqrfzzelj.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4eXN3dGRrbHpuanFyZnp6ZWxqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0MDAyMTYsImV4cCI6MjA3ODk3NjIxNn0.KiE1RiUBPp6qyQbTfeT1g_HukwRsoZlSG1Lhih3RF7U';

// Helper to make HTTP requests
async function request(url, method = 'GET', body = null, headers = {}) {
  const fullHeaders = {
    'Content-Type': 'application/json',
    ...headers,
  };

  const options = {
    method,
    headers: fullHeaders,
  };

  // Add a timeout to avoid hanging requests (90s for PageSpeed API)
  const controller = new AbortController();
  const timeoutMs = 90000;
  const t = setTimeout(() => controller.abort(), timeoutMs);
  options.signal = controller.signal;

  if (body) {
    options.body = typeof body === 'string' ? body : JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);
    let data = null;
    
    if (response.headers.get('content-type')?.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    clearTimeout(t);
    return { status: response.status, body: data, headers: response.headers };
  } catch (error) {
    clearTimeout(t);
    throw error;
  }
}

async function runSmokeTest() {
  console.log('🚀 Starting smoke test...\n');

  try {
    // Step 1: Insert scan_results row
    console.log('📝 Step 1: Inserting scan_results row...');
    const insertRes = await request(
      `${SUPABASE_URL}/rest/v1/scan_results`,
      'POST',
      {
        target_url: 'https://example.com',
        scan_status: 'pending',
      },
      {
        Prefer: 'return=representation',
        Authorization: `Bearer ${ANON_KEY}`,
        apikey: ANON_KEY,
      }
    );

    if (insertRes.status !== 201) {
      console.error('❌ Insert failed:', insertRes.status, insertRes.body);
      process.exit(1);
    }

    const scanRow = Array.isArray(insertRes.body) ? insertRes.body[0] : insertRes.body;
    const scanId = scanRow.id;
    console.log(`✅ Row created with scanId: ${scanId}\n`);

    // Step 2: Trigger web-scanner function
    console.log('🔄 Step 2: Triggering web-scanner function...');
    const scanRes = await request(
      `${SUPABASE_URL}/functions/v1/web-scanner`,
      'POST',
      {
        scanId,
        url: 'https://example.com',
      },
      {
        Authorization: `Bearer ${ANON_KEY}`,
        apikey: ANON_KEY,
      }
    );

    if (scanRes.status !== 200) {
      console.error('❌ Function call failed:', scanRes.status);
      try {
        console.error('Response body:', typeof scanRes.body === 'string' ? scanRes.body : JSON.stringify(scanRes.body));
      } catch {}
      process.exit(1);
    }

    console.log(`✅ Function triggered (response: ${scanRes.status})\n`);

    // Step 3: Poll for scan completion
    console.log('⏳ Step 3: Polling for scan completion (max 30 seconds)...');
    let completed = false;
    let attempts = 0;
    const maxAttempts = 10;

    while (!completed && attempts < maxAttempts) {
      await new Promise((r) => setTimeout(r, 3000)); // Wait 3 seconds
      attempts++;

      const pollRes = await request(
        `${SUPABASE_URL}/rest/v1/scan_results?id=eq.${scanId}`,
        'GET',
        null,
        {
          Authorization: `Bearer ${ANON_KEY}`,
          apikey: ANON_KEY,
        }
      );

      if (pollRes.status === 200 && Array.isArray(pollRes.body) && pollRes.body.length > 0) {
        const row = pollRes.body[0];
        console.log(`  Attempt ${attempts}: scan_status = "${row.scan_status}"`);

        if (row.scan_status === 'completed') {
          completed = true;
          console.log('\n✅ Scan completed!\n');
          console.log('📊 Results summary:');
          console.log(`  Overall Score: ${row.overall_score || 'N/A'}`);
          console.log(`  Top Issues: ${row.top_issues ? row.top_issues.length : 0}`);
          console.log(`  Performance Score: ${row.performance_score || 'N/A'}`);
          console.log(`  SEO Score: ${row.seo_score || 'N/A'}`);
          console.log(`  Security Checks Passed: ${row.security_checks_passed || 0}/${row.security_checks_total || 0}`);
          console.log(`  Accessibility Issues: ${row.accessibility_issue_count || 0}`);
          console.log(`  Technologies Detected: ${row.technologies ? row.technologies.length : 0}`);
          console.log(`  Exposed Endpoints: ${row.exposed_endpoints ? row.exposed_endpoints.length : 0}`);
          
          // Check PageSpeed source
          const hasPageSpeed = row.performance_results?.source === 'google-pagespeed';
          console.log(`\n🔍 PageSpeed API: ${hasPageSpeed ? '✅ USED' : '❌ NOT USED (basic scan)'}`);
          
          if (row.ai_summary) {
            console.log(`\n🤖 AI Summary: ${row.ai_summary.substring(0, 150)}...`);
            console.log(`   Recommendations: ${row.ai_recommendations ? row.ai_recommendations.length : 0}`);
          } else {
            console.log('\n⚠️  AI Summary: Not generated (check GEMINI_API_KEY)');
          }
        } else if (row.scan_status === 'failed') {
          console.error('\n❌ Scan failed!');
          console.error(`  Status: ${row.scan_status}`);
          process.exit(1);
        }
      }
    }

    if (!completed) {
      console.warn('⚠️  Scan did not complete within 30 seconds (still processing or polling failed)');
      process.exit(1);
    }

    console.log('\n✨ Smoke test passed!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

runSmokeTest();
