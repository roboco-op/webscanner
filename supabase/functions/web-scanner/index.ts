import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Type definitions for scan results (duplicated from src/types/scan.ts for Deno compatibility)
type PerformanceResults = {
  score: number;
  load_time_ms: number;
  image_count?: number;
  scripts_count?: number;
  stylesheets_count?: number;
  compression_enabled?: boolean;
  caching_enabled?: boolean;
  lighthouse_scores?: { performance?: number; seo?: number; accessibility?: number; bestPractices?: number };
  core_web_vitals?: Record<string, number>;
  source?: string;
  opportunities?: Array<{ title?: string; score?: number; savings?: number }>;
  diagnostics?: Array<{ title?: string; score?: number }>;
};

type SecurityResults = {
  issues: Array<{ severity: string; category?: string; description?: string; message?: string }>;
  checks_performed: number;
  checks_passed: number;
  https_enabled: boolean;
};

type AccessibilityResults = {
  issues: Array<{ severity: string; message?: string; count?: number; wcag?: string }>;
  total_issues: number;
  score: number;
  wcag_level?: string;
};

type E2EResults = {
  buttons_found: number;
  links_found: number;
  forms_found: number;
  primary_actions: string[];
  error?: string;
};

type APIResults = {
  endpoints_detected: number;
  endpoints: Array<{ method: string; path: string; status: number }>;
  error?: string;
};

type TechStackResult = {
  detected: Array<{ name: string; confidence: string; version?: string; category: string }>;
  total_detected: number;
  error?: string;
};

type TopIssue = {
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ScanRequest {
  scanId: string;
  url: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const body: ScanRequest = await req.json();
    const scanId = body.scanId;
    const url = body.url;

    console.log(`Starting scan for ${url} with ID ${scanId}`);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Start processing asynchronously (don't await)
    processScan(scanId, url, supabase).catch(error => {
      console.error(`Async scan processing error for ${scanId}:`, error);
    });

    // Return immediately so function doesn't time out
    return new Response(
      JSON.stringify({ success: true, scanId, message: "Scan started" }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Request error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Invalid request",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

async function processScan(scanId: string, url: string, supabase: ReturnType<typeof createClient>) {
  try {
    await supabase
      .from("scan_results")
      .update({ scan_status: "processing" })
      .eq("id", scanId);

    console.log("Status updated to processing");

    const domain = new URL(url).hostname;

    const { data: rateLimit } = await supabase
      .from("rate_limits")
      .select("*")
      .eq("domain", domain)
      .maybeSingle();

    if (rateLimit) {
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      if (new Date(rateLimit.window_start) > hourAgo && rateLimit.scan_count >= 5) {
        console.log(`Rate limit exceeded for ${domain}`);
        await supabase
          .from("scan_results")
          .update({ scan_status: "failed" })
          .eq("id", scanId);

        return new Response(
          JSON.stringify({ error: "Rate limit exceeded for this domain" }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      await supabase
        .from("rate_limits")
        .update({
          scan_count: rateLimit.scan_count + 1,
          last_scan_at: new Date().toISOString(),
        })
        .eq("domain", domain);
    } else {
      await supabase.from("rate_limits").insert({
        domain,
        scan_count: 1,
        window_start: new Date().toISOString(),
        last_scan_at: new Date().toISOString(),
      });
    }

    console.log("Performing scans...");
    const scanResults = await performScan(url);
    console.log("Scans completed");

    const topIssues = extractTopIssues(scanResults);
    const overallScore = calculateOverallScore(scanResults);

    console.log(`Overall score: ${overallScore}, top issues: ${topIssues.length}`);

    let aiSummary = null;
    let aiRecommendations = [];

    try {
      console.log("Generating AI analysis...");
      const aiAnalysis = await generateAIAnalysis(url, scanResults, topIssues, overallScore);
      aiSummary = aiAnalysis.summary;
      aiRecommendations = aiAnalysis.recommendations;
      console.log("AI analysis completed");
    } catch (aiError) {
      console.error("AI analysis failed:", aiError);
    }

    const performanceScore = scanResults.performance?.score || scanResults.performance?.lighthouse_scores?.performance || 0;
    const seoScore = scanResults.performance?.lighthouse_scores?.seo || 0;
    const accessibilityIssueCount = scanResults.accessibility?.total_issues || 0;
    const securityIssues = scanResults.security?.issues || [];
    const securityChecksPassed = Math.max(0, 7 - securityIssues.length);
    const technologies = scanResults.techStack?.detected?.map((t) => t.name) || [];
    const exposedEndpoints = scanResults.api?.endpoints?.map((e) => e.path) || [];

    const { error: updateError } = await supabase
      .from("scan_results")
      .update({
        scan_status: "completed",
        overall_score: overallScore,
        e2e_results: scanResults.e2e,
        api_results: scanResults.api,
        security_results: scanResults.security,
        performance_results: scanResults.performance,
        accessibility_results: scanResults.accessibility,
        tech_stack: scanResults.techStack,
        top_issues: topIssues,
        ai_summary: aiSummary,
        ai_recommendations: aiRecommendations,
        performance_score: performanceScore,
        seo_score: seoScore,
        accessibility_issue_count: accessibilityIssueCount,
        security_checks_passed: securityChecksPassed,
        security_checks_total: 7,
        technologies: technologies,
        exposed_endpoints: exposedEndpoints,
      })
      .eq("id", scanId);

    if (updateError) {
      console.error("Update error:", updateError);
      throw updateError;
    }

    console.log("Scan completed successfully");
  } catch (error) {
    console.error("Scan processing error:", error);

    try {
      await supabase
        .from("scan_results")
        .update({ scan_status: "failed" })
        .eq("id", scanId);
    } catch (updateErr) {
      console.error("Failed to update scan status to failed:", updateErr);
    }
  }
}

type PipelineSection<T> = T & { status?: 'pending' | 'completed' | 'failed'; error?: string };
type PipelineResults = {
  e2e?: PipelineSection<E2EResults>;
  api?: PipelineSection<APIResults>;
  security?: PipelineSection<SecurityResults>;
  performance?: PipelineSection<PerformanceResults>;
  accessibility?: PipelineSection<AccessibilityResults>;
  techStack?: PipelineSection<TechStackResult>;
};

async function performScan(url: string): Promise<PipelineResults> {
  const results: PipelineResults = {
    e2e: { status: 'pending' },
    api: { status: 'pending' },
    security: { status: 'pending' },
    performance: { status: 'pending' },
    accessibility: { status: 'pending' },
    techStack: { status: 'pending' },
  };

  try {
    results.e2e = await performE2EScan(url);
  } catch (err) {
    console.error("E2E scan error:", err);
    results.e2e = { error: "E2E scan failed", status: "failed" };
  }

  try {
    results.api = await performAPIScan(url);
  } catch (err) {
    console.error("API scan error:", err);
    results.api = { error: "API scan failed", status: "failed" };
  }

  try {
    results.security = await performSecurityScan(url);
  } catch (err) {
    console.error("Security scan error:", err);
    results.security = { error: "Security scan failed", status: "failed" };
  }

  try {
    results.performance = await performPerformanceScan(url);
  } catch (err) {
    console.error("Performance scan error:", err);
    results.performance = { error: "Performance scan failed", status: "failed" };
  }

  try {
    results.accessibility = await performAccessibilityScan(url);
  } catch (err) {
    console.error("Accessibility scan error:", err);
    results.accessibility = { error: "Accessibility scan failed", status: "failed" };
  }

  try {
    results.techStack = await detectTechStack(url);
  } catch (err) {
    console.error("Tech stack detection error:", err);
    results.techStack = { error: "Tech detection failed", status: "failed" };
  }

  return results;
}

async function performE2EScan(url: string): Promise<PipelineSection<E2EResults>> {
  try {
    console.log(`E2E scan: fetching ${url}`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RobolabScanner/1.0)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.log(`E2E scan: received status ${response.status}`);
      return {
        error: `HTTP ${response.status}`,
        status: "failed",
        buttons_found: 0,
        links_found: 0,
        forms_found: 0,
        primary_actions: [],
      };
    }

    const html = await response.text();
    console.log(`E2E scan: received ${html.length} bytes`);

    // Prefer a DOM-based parse for accuracy; fall back to regex if DOMParser isn't available.
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      const buttons = Array.from(doc.querySelectorAll('button'));
      const anchors = Array.from(doc.querySelectorAll('a[href]'));
      const forms = Array.from(doc.querySelectorAll('form'));

      const primaryActions = buttons
        .map(b => (b.textContent || '').trim())
        .filter(Boolean)
        .slice(0, 5);

      return {
        buttons_found: buttons.length,
        links_found: anchors.length,
        forms_found: forms.length,
        primary_actions: primaryActions,
        status: 'completed',
      };
    } catch {
      // DOMParser may not be available in some runtimes; fall back to regex-based parsing.
      console.warn('DOMParser not available, falling back to regex parsing for E2E scan');

      const buttonMatches = html.match(/<button[^>]*>([\s\S]*?)<\/button>/gi) || [];
      const linkMatches = html.match(/<a[^>]*href=["']([^"']*)["'][^>]*>/gi) || [];
      const formMatches = html.match(/<form[^>]*>/gi) || [];

      return {
        buttons_found: buttonMatches.length,
        links_found: linkMatches.length,
        forms_found: formMatches.length,
        primary_actions: buttonMatches.slice(0, 5).map((btn) => btn.replace(/<[^>]*>/g, '').trim()).filter(s => s),
        status: 'completed',
      };
    }
  } catch (error) {
    console.error("E2E scan error:", error);
    return {
      error: error instanceof Error ? error.message : "E2E scan failed",
      status: "failed",
      buttons_found: 0,
      links_found: 0,
      forms_found: 0,
      primary_actions: [],
    };
  }
}

async function performAPIScan(url: string): Promise<PipelineSection<APIResults>> {
  const endpoints: Array<{ method: string; path: string; status: number }> = [];

  try {
    console.log(`API scan: fetching ${url}`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RobolabScanner/1.0)"
      },
    });

    clearTimeout(timeoutId);

    const html = await response.text();

    const scriptMatches = html.match(/fetch\(["']([^"']+)["']|axios\.[a-z]+\(["']([^"']+)["']|\$\.ajax\(["']([^"']+)["']/g) || [];
    scriptMatches.forEach((match) => {
      const path = match.match(/["']([^"']+)["']/)?.[1];
      if (path && path.startsWith('/')) {
        endpoints.push({ method: "GET", path, status: 0 });
      }
    });

    return {
      endpoints_detected: endpoints.length,
      endpoints: endpoints.slice(0, 10),
      status: "completed",
    };
  } catch (error) {
    console.error("API scan error:", error);
    return {
      error: error instanceof Error ? error.message : "API scan failed",
      endpoints_detected: 0,
      endpoints: [],
      status: "failed",
    };
  }
}

async function performSecurityScan(url: string): Promise<PipelineSection<SecurityResults>> {
  try {
    console.log(`Security scan: fetching ${url}`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RobolabScanner/1.0)"
      },
    });

    clearTimeout(timeoutId);

    const headers = response.headers;
    const issues = [];

    if (!headers.get("strict-transport-security")) {
      issues.push({
        severity: "high",
        category: "Security",
        description: "Missing HSTS header - site vulnerable to protocol downgrade attacks"
      });
    }

    if (!headers.get("x-content-type-options")) {
      issues.push({
        severity: "medium",
        category: "Security",
        description: "Missing X-Content-Type-Options header - vulnerable to MIME sniffing"
      });
    }

    if (!headers.get("x-frame-options") && !headers.get("content-security-policy")) {
      issues.push({
        severity: "high",
        category: "Security",
        description: "Missing X-Frame-Options/CSP - vulnerable to clickjacking attacks"
      });
    }

    const csp = headers.get("content-security-policy");
    if (!csp) {
      issues.push({
        severity: "medium",
        category: "Security",
        description: "No Content-Security-Policy - vulnerable to XSS attacks"
      });
    }

    if (!headers.get("x-xss-protection")) {
      issues.push({
        severity: "low",
        category: "Security",
        description: "Missing X-XSS-Protection header"
      });
    }

    const html = await response.text();

    const cookieMatches = html.match(/document\.cookie\s*=/gi);
    if (cookieMatches && cookieMatches.length > 0) {
      issues.push({
        severity: "high",
        category: "Security",
        description: "JavaScript cookie manipulation detected - potential XSS vector"
      });
    }

    return {
      issues,
      checks_performed: 7,
      checks_passed: 7 - issues.length,
      https_enabled: url.startsWith("https"),
      status: "completed",
    };
  } catch (error) {
    console.error("Security scan error:", error);
    return {
      error: error instanceof Error ? error.message : "Security scan failed",
      issues: [],
      checks_performed: 0,
      checks_passed: 0,
      https_enabled: false,
      status: "failed",
    };
  }
}

async function performPerformanceScan(url: string): Promise<PipelineSection<PerformanceResults>> {
  try {
    console.log(`Performance scan: fetching ${url}`);

    const pagespeedApiKey =
      Deno.env.get("GOOGLE_PAGESPEED_API_KEY") ||
      Deno.env.get("PAGE_PAGESPEED_INSIGHTS_API_KEY");

    if (pagespeedApiKey) {
      console.log("Using Google PageSpeed Insights API");
      return await performGooglePageSpeedScan(url, pagespeedApiKey);
    }

    console.log("Falling back to basic performance scan");
    return await performBasicPerformanceScan(url);
  } catch (error) {
    console.error("Performance scan error:", error);
    return {
      error: error instanceof Error ? error.message : "Performance scan failed",
      score: 0,
      load_time_ms: 0,
      status: "failed",
    };
  }
}

async function performGooglePageSpeedScan(url: string, apiKey: string): Promise<PipelineSection<PerformanceResults>> {
  try {
    const pagespeedUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&key=${apiKey}&category=performance&category=accessibility&category=best-practices&category=seo`;

    console.log("Calling Google PageSpeed Insights API...");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    const response = await fetch(pagespeedUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`PageSpeed API error: ${response.status}`);
    }

    const data = await response.json();
    const lighthouseResult = data.lighthouseResult;
    const categories = lighthouseResult.categories;
    const audits = lighthouseResult.audits;

    const performanceScore = Math.round((categories.performance?.score || 0) * 100);
    const accessibilityScore = Math.round((categories.accessibility?.score || 0) * 100);
    const bestPracticesScore = Math.round((categories['best-practices']?.score || 0) * 100);
    const seoScore = Math.round((categories.seo?.score || 0) * 100);

    const metrics = audits['metrics']?.details?.items?.[0] || {};
    const fcp = metrics.firstContentfulPaint || 0;
    const lcp = metrics.largestContentfulPaint || 0;
    const tti = metrics.interactive || 0;
    const tbt = metrics.totalBlockingTime || 0;
    const cls = metrics.cumulativeLayoutShift || 0;
    const speedIndex = metrics.speedIndex || 0;

    return {
      score: performanceScore,
      load_time_ms: Math.round(metrics.observedLoad || 0),
      lighthouse_scores: {
        performance: performanceScore,
        accessibility: accessibilityScore,
        bestPractices: bestPracticesScore,
        seo: seoScore,
      },
      core_web_vitals: {
        fcp: Math.round(fcp),
        lcp: Math.round(lcp),
        tti: Math.round(tti),
        tbt: Math.round(tbt),
        cls: Math.round(cls * 1000) / 1000,
        speedIndex: Math.round(speedIndex),
      },
      image_count: audits['uses-optimized-images']?.details?.items?.length || 0,
      compression_enabled: audits['uses-text-compression']?.score === 1,
      caching_enabled: audits['uses-long-cache-ttl']?.score > 0.5,
      opportunities: extractPageSpeedOpportunities(audits),
      diagnostics: extractPageSpeedDiagnostics(audits),
      source: "google-pagespeed",
      status: "completed",
    };
  } catch (error) {
    console.error("Google PageSpeed API error:", error);
    console.log("Falling back to basic scan");
    return await performBasicPerformanceScan(url);
  }
}

type PageSpeedAudit = { title?: string; description?: string; score?: number | null; details?: Record<string, unknown> };
type PageSpeedAudits = Record<string, PageSpeedAudit>;

function extractPageSpeedOpportunities(audits: PageSpeedAudits) {
  const opportunities: Array<{ title?: string; description?: string; score?: number | null; savings?: number }> = [];
  const opportunityAudits = [
    'render-blocking-resources',
    'unused-css-rules',
    'unused-javascript',
    'modern-image-formats',
    'offscreen-images',
    'minify-css',
    'minify-javascript',
    'reduce-unused-code',
  ];

  for (const auditId of opportunityAudits) {
    const audit = audits[auditId];
    if (audit && typeof audit.score === 'number' && audit.score < 1) {
      const details = audit.details as Record<string, unknown> | undefined;
      const savings = details && typeof details['overallSavingsMs'] === 'number' ? (details['overallSavingsMs'] as number) : 0;
      opportunities.push({
        title: audit.title || auditId,
        description: audit.description,
        score: audit.score,
        savings,
      });
    }
  }

  return opportunities.slice(0, 5);
}

function extractPageSpeedDiagnostics(audits: PageSpeedAudits) {
  const diagnostics: Array<{ title?: string; description?: string; score?: number | null }> = [];
  const diagnosticAudits = [
    'dom-size',
    'total-byte-weight',
    'mainthread-work-breakdown',
    'bootup-time',
    'duplicated-javascript',
  ];

  for (const auditId of diagnosticAudits) {
    const audit = audits[auditId];
    if (audit && typeof audit.score === 'number' && audit.score < 1) {
      diagnostics.push({
        title: audit.title || auditId,
        description: audit.description,
        score: audit.score,
      });
    }
  }

  return diagnostics.slice(0, 5);
}

async function performBasicPerformanceScan(url: string): Promise<PipelineSection<PerformanceResults>> {
  const startTime = performance.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  const response = await fetch(url, {
    signal: controller.signal,
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; RobolabScanner/1.0)"
    },
  });

  clearTimeout(timeoutId);

  const endTime = performance.now();
  const loadTime = endTime - startTime;

  const html = await response.text();
  const headers = response.headers;

  const imageCount = (html.match(/<img[^>]*>/gi) || []).length;
  const scriptCount = (html.match(/<script[^>]*>/gi) || []).length;
  const stylesheetCount = (html.match(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi) || []).length;

  const hasGzip = headers.get("content-encoding")?.includes("gzip") || headers.get("content-encoding")?.includes("br");
  const hasCaching = !!headers.get("cache-control");

  let score = 100;
  if (loadTime > 3000) score -= 30;
  else if (loadTime > 1500) score -= 15;

  if (imageCount > 20) score -= 10;
  if (scriptCount > 15) score -= 10;
  if (stylesheetCount > 5) score -= 5;
  if (!hasGzip) score -= 15;
  if (!hasCaching) score -= 10;

  score = Math.max(0, score);

  return {
    score,
    load_time_ms: Math.round(loadTime),
    image_count: imageCount,
    scripts_count: scriptCount,
    stylesheets_count: stylesheetCount,
    compression_enabled: hasGzip,
    caching_enabled: hasCaching,
    lighthouse_scores: {
      performance: score,
      seo: Math.max(0, score - 10),
    },
    source: "basic-scan",
    status: "completed",
  };
}

async function performAccessibilityScan(url: string): Promise<PipelineSection<AccessibilityResults>> {
  try {
    console.log(`Accessibility scan: fetching ${url}`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RobolabScanner/1.0)"
      },
    });

    clearTimeout(timeoutId);

    const html = await response.text();

    const issues = [];

    const imgWithoutAlt = (html.match(/<img(?![^>]*alt=)[^>]*>/gi) || []).length;
    if (imgWithoutAlt > 0) {
      issues.push({
        severity: "critical",
        count: imgWithoutAlt,
        message: `${imgWithoutAlt} images missing alt text - screen readers cannot describe images`,
        wcag: "WCAG 2.1 Level A (1.1.1)",
      });
    }

    const hasLang = /<html[^>]*lang=/i.test(html);
    if (!hasLang) {
      issues.push({
        severity: "high",
        message: "Missing lang attribute on html element - affects screen reader pronunciation",
        wcag: "WCAG 2.1 Level A (3.1.1)",
      });
    }

    const buttonWithoutText = (html.match(/<button[^>]*>\s*<\/button>/gi) || []).length;
    if (buttonWithoutText > 0) {
      issues.push({
        severity: "critical",
        count: buttonWithoutText,
        message: `${buttonWithoutText} buttons without accessible text - screen readers cannot announce purpose`,
        wcag: "WCAG 2.1 Level A (4.1.2)",
      });
    }

    const inputCount = (html.match(/<input[^>]*>/gi) || []).length;
    const labelCount = (html.match(/<label[^>]*>/gi) || []).length;
    if (inputCount > labelCount + 2) {
      issues.push({
        severity: "high",
        count: inputCount - labelCount,
        message: `${inputCount - labelCount} form inputs possibly without labels - difficult for screen reader users`,
        wcag: "WCAG 2.1 Level A (1.3.1, 3.3.2)",
      });
    }

    const headingsMatch = html.match(/<h[1-6][^>]*>/gi) || [];
    const h1Count = (html.match(/<h1[^>]*>/gi) || []).length;
    if (h1Count === 0 && headingsMatch.length > 0) {
      issues.push({
        severity: "medium",
        message: "Page has no H1 heading - impacts document structure and navigation",
        wcag: "WCAG 2.1 Level A (1.3.1)",
      });
    } else if (h1Count > 1) {
      issues.push({
        severity: "medium",
        message: `Page has ${h1Count} H1 headings - should typically have only one`,
        wcag: "WCAG 2.1 Best Practice",
      });
    }

    const linksWithoutText = (html.match(/<a[^>]*href=[^>]*>\s*<\/a>/gi) || []).length;
    if (linksWithoutText > 0) {
      issues.push({
        severity: "high",
        count: linksWithoutText,
        message: `${linksWithoutText} links without text - screen readers cannot announce destination`,
        wcag: "WCAG 2.1 Level A (2.4.4)",
      });
    }

    const hasSkipLink = /<a[^>]*href=["']#(main|content|skip)["'][^>]*>/i.test(html);
    if (!hasSkipLink) {
      issues.push({
        severity: "low",
        message: "No skip navigation link found - keyboard users must tab through all navigation",
        wcag: "WCAG 2.1 Level A (2.4.1)",
      });
    }

    const tabindexNegative = (html.match(/tabindex=["']-\d+["']/gi) || []).length;
    if (tabindexNegative > 0) {
      issues.push({
        severity: "medium",
        count: tabindexNegative,
        message: `${tabindexNegative} elements with negative tabindex - removes from keyboard navigation`,
        wcag: "WCAG 2.1 Level A (2.1.1)",
      });
    }

    const severityPoints: {[key: string]: number} = { critical: 25, high: 15, medium: 8, low: 3 };
    const totalDeduction = issues.reduce((sum, issue) => sum + (severityPoints[issue.severity] || 10), 0);

    return {
      issues,
      total_issues: issues.length,
      score: Math.max(0, 100 - totalDeduction),
      wcag_level: issues.some(i => i.severity === "critical" || i.severity === "high") ? "Fails Level A" : "Passes Level A (potential AA issues)",
      status: "completed",
    };
  } catch (error) {
    console.error("Accessibility scan error:", error);
    return {
      error: error instanceof Error ? error.message : "Accessibility scan failed",
      status: "failed",
      issues: [],
      total_issues: 0,
      score: 0,
      wcag_level: "Unable to determine",
    };
  }
}

async function detectTechStack(url: string): Promise<PipelineSection<TechStackResult>> {
  try {
    console.log(`Tech stack detection: fetching ${url}`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RobolabScanner/1.0)"
      },
    });

    clearTimeout(timeoutId);

    const html = await response.text();
    const headers = response.headers;

    const detected: Array<{name: string; confidence: string; version?: string; category: string}> = [];

    if (html.includes("__NEXT_DATA__") || html.includes("_next/static")) {
      const versionMatch = html.match(/"buildId":"([^"]+)"/); 
      detected.push({
        name: "Next.js",
        confidence: "high",
        version: versionMatch?.[1] ? "detected" : undefined,
        category: "Framework"
      });
    } else if (html.includes("react") || html.includes("React") || html.includes("_react") || html.match(/react[.-]?dom/i)) {
      detected.push({ name: "React", confidence: "medium", category: "Library" });
    }

    if (html.includes("__nuxt") || html.includes("_nuxt/")) {
      detected.push({ name: "Nuxt.js", confidence: "high", category: "Framework" });
    } else if (html.includes("vue") || html.includes("Vue") || html.match(/vue[.-]?js/i)) {
      detected.push({ name: "Vue.js", confidence: "medium", category: "Framework" });
    }

    if (html.includes("ng-version") || html.match(/<[^>]*ng-[^>]*>/i)) {
      const versionMatch = html.match(/ng-version="([^"]+)"/); 
      detected.push({
        name: "Angular",
        confidence: "high",
        version: versionMatch?.[1],
        category: "Framework"
      });
    }

    if (html.includes("wp-content") || html.includes("wp-includes") || html.includes("/wordpress/")) {
      const versionMatch = html.match(new RegExp('wp-content/themes/[^/]+/([0-9.]+)'));
      detected.push({
        name: "WordPress",
        confidence: "high",
        version: versionMatch?.[1],
        category: "CMS"
      });
    }

    if (html.includes("Drupal") || html.match(/sites\/(default|all)\/modules/i)) {
      detected.push({ name: "Drupal", confidence: "high", category: "CMS" });
    }

    if (html.includes("__svelte") || html.match(/<script[^>]*src=["'][^"']*svelte[^"']*["']/i)) {
      detected.push({ name: "Svelte", confidence: "medium", category: "Framework" });
    }

    if (html.match(/jquery[.-]?(\d+\.\d+\.\d+)?/i)) {
      const versionMatch = html.match(/jquery[.-]?(\d+\.\d+\.\d+)/i);
      detected.push({
        name: "jQuery",
        confidence: "high",
        version: versionMatch?.[1],
        category: "Library"
      });
    }

    if (html.includes("tailwind") || html.match(/class=["'][^"']*\b(flex|grid|bg-|text-|p-|m-|w-|h-)[^"']*["']/)) {
      detected.push({ name: "Tailwind CSS", confidence: "medium", category: "CSS Framework" });
    }

    if (html.match(/class=["'][^"']*\b(container|row|col-|btn|navbar)[^"']*["']/) && !html.includes("tailwind")) {
      detected.push({ name: "Bootstrap", confidence: "low", category: "CSS Framework" });
    }

    const poweredBy = headers.get("x-powered-by");
    if (poweredBy) {
      detected.push({
        name: poweredBy,
        confidence: "high",
        category: "Server"
      });
    }

    const server = headers.get("server");
    if (server) {
      detected.push({
        name: server.split("/")[0],
        confidence: "high",
        version: server.split("/")[1],
        category: "Web Server"
      });
    }

    if (headers.get("x-aspnet-version") || headers.get("x-aspnetmvc-version")) {
      detected.push({
        name: "ASP.NET",
        confidence: "high",
        version: headers.get("x-aspnet-version") || undefined,
        category: "Framework"
      });
    }

    return {
      detected,
      total_detected: detected.length,
      status: "completed",
    };
  } catch (error) {
    console.error("Tech stack detection error:", error);
    return {
      error: error instanceof Error ? error.message : "Tech detection failed",
      detected: [],
      total_detected: 0,
      status: "failed",
    };
  }
}

function extractTopIssues(scanResults: { security?: SecurityResults; accessibility?: AccessibilityResults; performance?: PerformanceResults }): TopIssue[] {
  const issues: TopIssue[] = [];

  if (scanResults.security?.issues) {
    scanResults.security.issues.forEach((issue) => {
      issues.push({
        category: (issue.category as string) || 'Security',
        severity: (issue.severity as TopIssue['severity']) || 'low',
        description: (issue.description as string) || (issue.message as string) || '',
      });
    });
  }

  if (scanResults.accessibility?.issues) {
    scanResults.accessibility.issues.forEach((issue) => {
      issues.push({
        category: 'Accessibility',
        severity: (issue.severity as TopIssue['severity']) || 'low',
        description: (issue.message as string) || '',
      });
    });
  }

  if (scanResults.performance?.score !== undefined && scanResults.performance.score < 50) {
    issues.push({
      category: 'Performance',
      severity: 'high',
      description: `Poor performance score (${scanResults.performance.score}/100) - site loads slowly`,
    });
  }

  const sortOrder: { [key: string]: number } = { critical: 0, high: 1, medium: 2, low: 3 };
  issues.sort((a, b) => (sortOrder[a.severity] || 99) - (sortOrder[b.severity] || 99));

  return issues.slice(0, 10);
}

function calculateOverallScore(scanResults: { security?: SecurityResults; performance?: PerformanceResults; accessibility?: AccessibilityResults; e2e?: E2EResults; api?: APIResults }): number {
  const weights = {
    security: 0.3,
    performance: 0.25,
    accessibility: 0.25,
    e2e: 0.1,
    api: 0.1,
  };

  let totalScore = 0;
  let totalWeight = 0;

  if (scanResults.security?.status === "completed") {
    const secScore = ((scanResults.security.checks_passed || 0) / (scanResults.security.checks_performed || 1)) * 100;
    totalScore += secScore * weights.security;
    totalWeight += weights.security;
  }

  if (scanResults.performance?.status === "completed") {
    totalScore += (scanResults.performance.score || 0) * weights.performance;
    totalWeight += weights.performance;
  }

  if (scanResults.accessibility?.status === "completed") {
    totalScore += (scanResults.accessibility.score || 0) * weights.accessibility;
    totalWeight += weights.accessibility;
  }

  if (scanResults.e2e?.status === 'completed') {
    const e2eScore = (scanResults.e2e.buttons_found || 0) > 0 ? 80 : 50;
    totalScore += e2eScore * weights.e2e;
    totalWeight += weights.e2e;
  }

  if (scanResults.api?.status === "completed") {
    const apiScore = 70;
    totalScore += apiScore * weights.api;
    totalWeight += weights.api;
  }

  return totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;
}

async function generateAIAnalysis(url: string, scanResults: Partial<{ security?: SecurityResults; accessibility?: AccessibilityResults; performance?: PerformanceResults }>, topIssues: TopIssue[], overallScore: number) {
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  console.log("GEMINI_API_KEY value:", geminiKey);

  if (!geminiKey) {
    console.log("GEMINI_API_KEY not configured, skipping AI analysis");
    return { summary: null, recommendations: [] };
  }

  try {
    const prompt = `Analyze this website scan for ${url}:

Overall Score: ${overallScore}/100

Security Issues: ${scanResults.security?.issues?.length || 0}
Accessibility Issues: ${scanResults.accessibility?.total_issues || 0}
Performance Score: ${scanResults.performance?.score || 0}/100

Top Issues:
${topIssues.map(issue => `- [${issue.severity}] ${issue.category}: ${issue.description}`).join('\n')}

You are a web security and performance expert. Provide concise, actionable technical analysis.

Provide:
1. A brief 2-3 sentence technical summary
2. Top 3-5 actionable recommendations

Format as JSON: {"summary": "...", "recommendations": ["...", "..."]}`;

    console.log("Gemini prompt:", prompt);

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 500,
        }
      }),
    });

    console.log("Gemini API response status:", response.status);

    if (!response.ok) {
      const txt = await response.text().catch(() => '');
      console.error("Gemini API error:", response.status, txt);
      return { summary: null, recommendations: [] };
    }

    const data = await response.json();
    console.log("Gemini API response data:", JSON.stringify(data));
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      console.log("Gemini API returned no content");
      return { summary: null, recommendations: [] };
    }

    try {
      // Remove markdown code blocks if present
      let jsonStr = content.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      const parsed = JSON.parse(jsonStr);
      console.log("Gemini parsed summary:", parsed.summary);
      return {
        summary: parsed.summary || null,
        recommendations: parsed.recommendations || []
      };
    } catch (parseError) {
      console.log("Gemini content not valid JSON, using raw content:", parseError);
      return {
        summary: content,
        recommendations: []
      };
    }
  } catch (error) {
    console.error("AI analysis error:", error);
    return { summary: null, recommendations: [] };
  }
}
