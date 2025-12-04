import { useState } from 'react';
import { Shield, Zap, Eye, AlertTriangle, Mail, Loader2, CheckCircle, Search, Lock, BarChart3, Calendar } from 'lucide-react';
import type { ScanResult } from '../types/scan';

// AI Summary card component (standalone, not nested inside helpers)
function AISummaryCard({
  summary,
  recommendations,
  scanId,
  onUpdate,
}: {
  summary: string | null;
  recommendations: string[];
  scanId: string;
  onUpdate: (s: string | null, r: string[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiDisabled, setAiDisabled] = useState(false);

  const regenerate = async () => {
    if (aiDisabled) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/regenerate-ai`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ scanId }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        // Detect missing Gemini key scenario
        if (txt.includes('GEMINI_API_KEY') || res.status === 500) {
          setAiDisabled(true);
          throw new Error('AI feature is not enabled');
        }
        throw new Error(`Regenerate failed: ${res.status} ${txt}`);
      }

      const data = await res.json();
      onUpdate(data.ai_summary ?? null, data.ai_recommendations ?? []);
      setExpanded(true);
    } catch (err: unknown) {
      console.error('Regenerate error', err);
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summary);
    } catch (e) {
      console.warn('copy failed', e);
    }
  };

  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 mb-8 border border-white/20">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-lg font-bold text-white">AI Analysis Summary</h3>
            <span className="text-xs font-medium px-2 py-1 bg-blue-500 text-white rounded-full">Powered by AI</span>
            {aiDisabled && (
              <span className="text-xs px-2 py-1 rounded bg-white/20 text-white">Disabled</span>
            )}
          </div>
          {loading ? (
            <div className="animate-pulse space-y-3">
              <div className="h-4 bg-white/20 rounded w-3/4" />
              <div className="h-4 bg-white/10 rounded w-5/6" />
              <div className="h-4 bg-white/10 rounded w-2/3" />
            </div>
          ) : summary ? (
            <p className="text-blue-100 leading-relaxed text-base">{expanded ? summary : summary.slice(0, 300) + (summary.length > 300 ? '…' : '')}</p>
          ) : (
            <p className="text-blue-200 italic text-sm">No AI analysis available for this scan.</p>
          )}
          {!loading && recommendations && recommendations.length > 0 && (
            <ul className="mt-3 text-sm text-blue-100 list-disc list-inside">
              {recommendations.slice(0, 5).map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}
          {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
          {aiDisabled && !error && (
            <p className="text-xs text-blue-200 mt-2 italic">AI analysis is currently unavailable.</p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
            <div className="flex gap-2">
              <button
                type="button"
                className="px-3 py-1 bg-white/10 text-white rounded border border-white/20 text-sm hover:bg-white/20 disabled:opacity-40"
                onClick={() => setExpanded((s) => !s)}
                disabled={loading || !summary}
              >
                {expanded ? 'Show less' : 'Show more'}
              </button>
              {!aiDisabled && (
                <button
                  type="button"
                  disabled={loading || !scanId}
                  onClick={regenerate}
                  className="px-3 py-1 bg-blue-600 text-white rounded text-sm disabled:opacity-50"
                >
                  {loading ? 'Regenerating…' : 'Regenerate'}
                </button>
              )}
            </div>
            {summary && !loading && (
              <button
                type="button"
                onClick={copy}
                className="text-xs text-blue-100 underline"
              >
                Copy summary
              </button>
            )}
          </div>
      </div>
    </div>
  );
}

interface ResultsPreviewProps {
  result: ScanResult;
  onEmailSubmit: (email: string, optIn: boolean) => Promise<void>;
  onScanAnother: () => void;
}

export default function ResultsPreview({ result, onEmailSubmit, onScanAnother }: ResultsPreviewProps) {
  const [email, setEmail] = useState('');
  const [optIn, setOptIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  
  // Parse AI summary if it's wrapped in markdown code blocks
  const parseAISummary = (raw: string | null): { summary: string | null; recommendations: string[] } => {
    if (!raw) return { summary: null, recommendations: [] };
    
    try {
      // Remove markdown code blocks
      let jsonStr = raw.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      const parsed = JSON.parse(jsonStr);
      return {
        summary: parsed.summary || null,
        recommendations: parsed.recommendations || []
      };
    } catch {
      // If parsing fails, return raw content as summary
      return { summary: raw, recommendations: [] };
    }
  };
  
  const initialParsed = parseAISummary(result.ai_summary ?? null);
  const [aiSummary, setAiSummary] = useState<string | null>(initialParsed.summary);
  const [aiRecs, setAiRecs] = useState<string[]>(
    Array.isArray(result.ai_recommendations) && result.ai_recommendations.length > 0
      ? result.ai_recommendations
      : initialParsed.recommendations
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setSubmitting(true);
    try {
      await onEmailSubmit(email, optIn);
      setSubmitted(true);
    } catch (e) {
      console.error(e);
      setError('Failed to send report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'border-red-600 bg-red-50';
      case 'high':
        return 'border-orange-500 bg-orange-50';
      case 'medium':
        return 'border-yellow-400 bg-yellow-50';
      default:
        return 'border-gray-300 bg-gray-50';
    }
  };

  const getCategoryIcon = (category: string) => {
    const c = category.toLowerCase();
    if (c.includes('security')) return <Shield className="w-5 h-5 text-red-600" />;
    if (c.includes('performance')) return <Zap className="w-5 h-5 text-green-600" />;
    if (c.includes('access')) return <Eye className="w-5 h-5 text-orange-600" />;
    return <AlertTriangle className="w-5 h-5 text-gray-600" />;
  };
  return (
    <>
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Scan Results</h2>
          <p className="text-gray-600">Detailed technical analysis of your website</p>
        </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <div className="bg-gray-50 rounded-lg shadow p-6 border-l-4 border-green-500">
          <div className="flex items-center justify-between mb-2">
            <Zap className="w-8 h-8 text-green-600" />
            <span className="text-3xl font-bold text-gray-900">
              {result.performance_score ?? result.performance_results?.score ?? 0}
            </span>
          </div>
          <p className="text-sm font-medium text-gray-600">Performance</p>
          <p className="text-xs text-gray-500 mt-1">Lighthouse Mobile Score</p>
        </div>

        <div className="bg-gray-50 rounded-lg shadow p-6 border-l-4 border-blue-500">
          <div className="flex items-center justify-between mb-2">
            <Search className="w-8 h-8 text-blue-600" />
            <span className="text-3xl font-bold text-gray-900">
              {result.seo_score ?? result.performance_results?.lighthouse_scores?.seo ?? 0}
            </span>
          </div>
          <p className="text-sm font-medium text-gray-600">SEO</p>
          <p className="text-xs text-gray-500 mt-1">Overall SEO Score</p>
        </div>

        <div className="bg-gray-50 rounded-lg shadow p-6 border-l-4 border-orange-500">
          <div className="flex items-center justify-between mb-2">
            <Eye className="w-8 h-8 text-orange-600" />
            <span className="text-3xl font-bold text-gray-900">
              {result.accessibility_issue_count ?? result.accessibility_results?.total_issues ?? 0}
            </span>
          </div>
          <p className="text-sm font-medium text-gray-600">Accessibility</p>
          <p className="text-xs text-gray-500 mt-1">Critical & serious issues</p>
        </div>

        <div className="bg-gray-50 rounded-lg shadow p-6 border-l-4 border-red-500">
          <div className="flex items-center justify-between mb-2">
            <Shield className="w-8 h-8 text-red-600" />
            <span className="text-3xl font-bold text-gray-900">
              {result.security_checks_passed ?? (result.security_results?.issues ? (7 - result.security_results.issues.length) : 7)}/{result.security_checks_total || 7}
            </span>
          </div>
          <p className="text-sm font-medium text-gray-600">Security</p>
          <p className="text-xs text-gray-500 mt-1">Security checks passed</p>
        </div>

        <div className="bg-gray-50 rounded-lg shadow p-6 border-l-4 border-purple-500">
          <div className="flex items-center justify-between mb-2">
            <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11-4-5 2m0 0l5 5m-5-5v5m0 0H4m0 0v4" />
            </svg>
            <span className="text-3xl font-bold text-gray-900">
              {result.e2e_results ? ((result.e2e_results.buttons_found || 0) > 0 ? 80 : 50) : 0}
            </span>
          </div>
          <p className="text-sm font-medium text-gray-600">E2E Testing</p>
          <p className="text-xs text-gray-500 mt-1">Interactive elements</p>
        </div>
      </div>

      {result.e2e_results && (
        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg p-6 mb-8 border border-purple-200">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center shadow">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11-4-5 2m0 0l5 5m-5-5v5m0 0H4m0 0v4" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">End-to-End Testing Analysis</h3>
              <p className="text-xs text-gray-600">Interactive elements detected on the page</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg p-4 border border-purple-200 shadow-sm">
              <div className="text-2xl font-bold text-gray-900">{result.e2e_results.buttons_found ?? 0}</div>
              <div className="text-xs font-medium text-gray-600 mt-1">Buttons</div>
              <div className="text-xs text-gray-500 mt-1">Interactive elements</div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-purple-200 shadow-sm">
              <div className="text-2xl font-bold text-gray-900">{result.e2e_results.links_found ?? 0}</div>
              <div className="text-xs font-medium text-gray-600 mt-1">Links</div>
              <div className="text-xs text-gray-500 mt-1">Navigational elements</div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-purple-200 shadow-sm">
              <div className="text-2xl font-bold text-gray-900">{result.e2e_results.forms_found ?? 0}</div>
              <div className="text-xs font-medium text-gray-600 mt-1">Forms</div>
              <div className="text-xs text-gray-500 mt-1">User input elements</div>
            </div>
          </div>
          {result.e2e_results.primary_actions && result.e2e_results.primary_actions.length > 0 && (
            <div className="mt-4 pt-4 border-t border-purple-200">
              <p className="text-xs font-medium text-gray-600 mb-2">Primary Actions Detected:</p>
              <div className="flex flex-wrap gap-2">
                {result.e2e_results.primary_actions.slice(0, 5).map((action, idx) => (
                  <span key={idx} className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-medium border border-purple-300">
                    {action}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {result.performance_results?.core_web_vitals && result.performance_results?.source === 'google-pagespeed' && (
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-6 mb-8 border border-green-200">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center shadow">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Core Web Vitals</h3>
              <p className="text-xs text-gray-600">Powered by Google PageSpeed Insights</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg p-4 border border-green-200 shadow-sm">
              <div className="text-2xl font-bold text-gray-900">{((result.performance_results?.core_web_vitals?.fcp ?? 0) / 1000).toFixed(2)}s</div>
              <div className="text-xs font-medium text-gray-600 mt-1">First Contentful Paint</div>
              <div className="text-xs text-gray-500 mt-1">How quickly content appears</div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-green-200 shadow-sm">
              <div className="text-2xl font-bold text-gray-900">{((result.performance_results?.core_web_vitals?.lcp ?? 0) / 1000).toFixed(2)}s</div>
              <div className="text-xs font-medium text-gray-600 mt-1">Largest Contentful Paint</div>
              <div className="text-xs text-gray-500 mt-1">Main content load time</div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-green-200 shadow-sm">
              <div className="text-2xl font-bold text-gray-900">{result.performance_results?.core_web_vitals?.cls ?? 0}</div>
              <div className="text-xs font-medium text-gray-600 mt-1">Cumulative Layout Shift</div>
              <div className="text-xs text-gray-500 mt-1">Visual stability score</div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-green-200 shadow-sm">
              <div className="text-2xl font-bold text-gray-900">{Math.round(result.performance_results?.core_web_vitals?.tbt ?? 0)}ms</div>
              <div className="text-xs font-medium text-gray-600 mt-1">Total Blocking Time</div>
              <div className="text-xs text-gray-500 mt-1">Interactivity delay</div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-green-200 shadow-sm">
              <div className="text-2xl font-bold text-gray-900">{((result.performance_results?.core_web_vitals?.tti ?? 0) / 1000).toFixed(2)}s</div>
              <div className="text-xs font-medium text-gray-600 mt-1">Time to Interactive</div>
              <div className="text-xs text-gray-500 mt-1">When page is usable</div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-green-200 shadow-sm">
              <div className="text-2xl font-bold text-gray-900">{((result.performance_results?.core_web_vitals?.speedIndex ?? 0) / 1000).toFixed(2)}s</div>
              <div className="text-xs font-medium text-gray-600 mt-1">Speed Index</div>
              <div className="text-xs text-gray-500 mt-1">Visual completion speed</div>
            </div>
          </div>
        </div>
      )}

      {result.performance_results?.lighthouse_scores && result.performance_results?.source === 'google-pagespeed' && (
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-6 mb-8 border border-blue-200">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            Google Lighthouse Scores
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg p-4 border border-blue-200 shadow-sm text-center">
              <div className={`text-3xl font-bold ${getScoreColor(result.performance_results?.lighthouse_scores?.performance ?? 0)}`}>
                {result.performance_results?.lighthouse_scores?.performance ?? 0}
              </div>
              <div className="text-sm font-medium text-gray-600 mt-2">Performance</div>
            </div>
            {result.performance_results?.lighthouse_scores?.accessibility && (
              <div className="bg-white rounded-lg p-4 border border-blue-200 shadow-sm text-center">
                <div className={`text-3xl font-bold ${getScoreColor(result.performance_results?.lighthouse_scores?.accessibility ?? 0)}`}>
                  {result.performance_results?.lighthouse_scores?.accessibility ?? 0}
                </div>
                <div className="text-sm font-medium text-gray-600 mt-2">Accessibility</div>
              </div>
            )}
            {result.performance_results?.lighthouse_scores?.bestPractices && (
              <div className="bg-white rounded-lg p-4 border border-blue-200 shadow-sm text-center">
                <div className={`text-3xl font-bold ${getScoreColor(result.performance_results?.lighthouse_scores?.bestPractices ?? 0)}`}>
                  {result.performance_results?.lighthouse_scores?.bestPractices ?? 0}
                </div>
                <div className="text-sm font-medium text-gray-600 mt-2">Best Practices</div>
              </div>
            )}
            <div className="bg-white rounded-lg p-4 border border-blue-200 shadow-sm text-center">
              <div className={`text-3xl font-bold ${getScoreColor(result.performance_results?.lighthouse_scores?.seo ?? 0)}`}>
                {result.performance_results?.lighthouse_scores?.seo ?? 0}
              </div>
              <div className="text-sm font-medium text-gray-600 mt-2">SEO</div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {result.technologies && result.technologies.length > 0 && (
          <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-600" />
              Technologies Detected
            </h3>
            <div className="flex flex-wrap gap-2">
              {result.technologies.map((tech, idx) => (
                <span key={idx} className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm font-medium border border-blue-200">
                  {tech}
                </span>
              ))}
            </div>
          </div>
        )}

        {result.exposed_endpoints && result.exposed_endpoints.length > 0 && (
          <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Lock className="w-5 h-5 text-orange-600" />
              Exposed API Endpoints
            </h3>
            <div className="space-y-2">
              {result.exposed_endpoints.slice(0, 5).map((endpoint, idx) => (
                <div key={idx} className="px-3 py-2 bg-orange-50 text-orange-800 rounded text-sm font-mono border border-orange-200 break-all">
                  {endpoint}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

        <div>
          <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            Top Issues Found
          </h3>
          <div className="space-y-3">
            {result.top_issues && result.top_issues.length > 0 ? (
              result.top_issues.slice(0, 3).map((issue, idx) => (
                <div
                  key={idx}
                  className={`p-4 rounded-lg border ${getSeverityColor(issue.severity)}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">{getCategoryIcon(issue.category)}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-sm uppercase">{issue.category}</span>
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-white bg-opacity-50">
                          {issue.severity}
                        </span>
                      </div>
                      <p className="text-sm">{issue.description}</p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-4">No critical issues detected</p>
            )}
          </div>
        </div>
      </div>

      {!submitted ? (
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg shadow-lg p-8 border border-blue-200">
          <div className="text-center mb-6">
            <Mail className="w-12 h-12 text-blue-600 mx-auto mb-3" />
            <h3 className="text-2xl font-bold text-gray-900 mb-2">Get Your Full Report</h3>
            <p className="text-gray-700">
              Detailed analysis with actionable recommendations delivered as a PDF
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                disabled={submitting}
              />
              {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={optIn}
                onChange={(e) => setOptIn(e.target.checked)}
                className="mt-1 w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">
                Store my results longer than 30 days for future reference
              </span>
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium text-lg"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="w-5 h-5" />
                  Send Full Report
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-blue-200 text-center">
            <a
              href="https://timerex.net/s/sales_5e77_b801/482a66cf?apiKey=1ufKAEnDi4T0pk5lftqMqjiNmF5SQh8x3Va4pLe5oitNLtgKCuI7BKH5sI0SGLeI"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-blue-700 font-medium hover:text-blue-800 transition-colors"
            >
              <Calendar className="w-5 h-5" />
              Book 12-min QA Consultation →
            </a>
          </div>
        </div>
      ) : (
        <div className="bg-green-50 rounded-lg shadow-lg p-8 border border-green-200">
          <div className="text-center">
            <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
            <h3 className="text-2xl font-bold text-gray-900 mb-2">Report Sent!</h3>
            <p className="text-gray-700 mb-4">
              Check your inbox at <span className="font-medium">{email}</span>
            </p>
            <p className="text-sm text-gray-600 mb-6">
              Don't see it? Check your spam folder or contact support.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={onScanAnother}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Scan Another Website
              </button>
              <a
                href="https://timerex.net/s/sales_5e77_b801/482a66cf?apiKey=1ufKAEnDi4T0pk5lftqMqjiNmF5SQh8x3Va4pLe5oitNLtgKCuI7BKH5sI0SGLeI"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-blue-700 border-2 border-blue-600 rounded-lg hover:bg-blue-50 transition-colors font-medium"
              >
                <Calendar className="w-5 h-5" />
                Book 12-min QA Consultation
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
