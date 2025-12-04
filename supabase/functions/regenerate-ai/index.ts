import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { scanId } = await req.json();
    if (!scanId) {
      return new Response(JSON.stringify({ error: 'scanId required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: scanRow, error: fetchErr } = await supabase
      .from('scan_results')
      .select('*')
      .eq('id', scanId)
      .maybeSingle();

    if (fetchErr || !scanRow) {
      console.error('Scan row not found', fetchErr);
      return new Response(JSON.stringify({ error: 'Scan not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Compose prompt using the existing scan data
    const topIssues = Array.isArray(scanRow.top_issues) ? scanRow.top_issues : [];
    const overallScore = scanRow.overall_score ?? 0;
    const securityCount = (scanRow.security_results && Array.isArray(scanRow.security_results.issues)) ? scanRow.security_results.issues.length : 0;
    const accessibilityCount = scanRow.accessibility_results?.total_issues ?? 0;
    const performanceScore = scanRow.performance_results?.score ?? 0;
    const url = scanRow.target_url ?? scanRow.url ?? '';

    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) {
      console.log('GEMINI_API_KEY not configured, skipping AI regeneration');
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    interface IssueShape { severity?: string; category?: string; description?: string; message?: string }
    const prompt = `Analyze this website scan for ${url}:

Overall Score: ${overallScore}/100

Security Issues: ${securityCount}
Accessibility Issues: ${accessibilityCount}
Performance Score: ${performanceScore}/100

Top Issues:
${(topIssues as IssueShape[]).map((i) => `- [${i.severity || 'unknown'}] ${i.category || 'Issue'}: ${i.description || i.message || ''}`).join('\n')}

You are a web security and performance expert. Provide concise, actionable technical analysis.

Provide:
1. A brief 2-3 sentence technical summary
2. Top 3-5 actionable recommendations

Format as JSON: {"summary": "...", "recommendations": ["...", "..."]}`;

    const aiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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

    if (!aiRes.ok) {
      const txt = await aiRes.text().catch(() => '');
      console.error('Gemini error', aiRes.status, txt);
      return new Response(JSON.stringify({ error: 'Gemini API error' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const aiData = await aiRes.json();
    const content = aiData.candidates?.[0]?.content?.parts?.[0]?.text;

    let summary: string | null = null;
    let recommendations: string[] = [];

    if (content) {
      try {
        const parsed = JSON.parse(content);
        summary = parsed.summary ?? null;
        recommendations = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];
      } catch {
        summary = String(content);
      }
    }

    // Update DB with regenerated AI results
    const { error: updateErr } = await supabase
      .from('scan_results')
      .update({ ai_summary: summary, ai_recommendations: recommendations })
      .eq('id', scanId);

    if (updateErr) {
      console.error('Failed to update scan row with AI results', updateErr);
      return new Response(JSON.stringify({ error: 'Failed to update scan row' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ ai_summary: summary, ai_recommendations: recommendations }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Regenerate AI error', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
