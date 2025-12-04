export interface PerformanceResults {
  score?: number;
  load_time_ms?: number;
  page_size_kb?: number;
  image_count?: number;
  images_count?: number;
  scripts_count?: number;
  stylesheets_count?: number;
  lighthouse_scores?: {
    performance?: number;
    accessibility?: number;
    bestPractices?: number;
    seo?: number;
  };
  core_web_vitals?: {
    fcp?: number;
    lcp?: number;
    tti?: number;
    tbt?: number;
    cls?: number;
    speedIndex?: number;
  };
  compression_enabled?: boolean;
  caching_enabled?: boolean;
  opportunities?: Array<{ title: string; description?: string; score?: number; savings?: number }>;
  diagnostics?: Array<{ title: string; description?: string }>;
  source?: string;
  status?: 'pending' | 'completed' | 'failed';
}

export interface SecurityIssue {
  severity: string;
  category?: string;
  description?: string;
  message?: string;
}

export interface SecurityResults {
  issues?: SecurityIssue[];
  checks_performed?: number;
  checks_passed?: number;
  https_enabled?: boolean;
  protocol?: string;
  score?: number;
  security_headers?: Record<string, string>;
  status?: 'pending' | 'completed' | 'failed';
}

export interface AccessibilityIssue {
  severity: string;
  count?: number;
  message?: string;
  wcag?: string;
}

export interface AccessibilityResults {
  issues?: AccessibilityIssue[];
  total_issues?: number;
  score?: number;
  wcag_level?: string;
  status?: 'pending' | 'completed' | 'failed';
}

export interface E2EResults {
  buttons_found?: number;
  links_found?: number;
  forms_found?: number;
  primary_actions?: string[];
  status?: 'pending' | 'completed' | 'failed';
}

export interface APIEndpoint {
  method: string;
  path: string;
  status?: number;
}

export interface APIResults {
  endpoints_detected?: number;
  endpoints?: APIEndpoint[];
  status?: 'pending' | 'completed' | 'failed';
}

export interface TechStackResult {
  detected?: Array<{ name: string; confidence?: string; version?: string; category?: string }>;
  total_detected?: number;
  status?: 'pending' | 'completed' | 'failed';
}

export interface ScanResult {
  id: string;
  target_url: string;
  scan_status: 'pending' | 'processing' | 'completed' | 'failed';
  overall_score?: number;
  ai_summary?: string | null;
  ai_recommendations?: string[];
  performance_score?: number;
  seo_score?: number;
  accessibility_issue_count?: number;
  security_checks_passed?: number;
  security_checks_total?: number;
  technologies?: string[];
  exposed_endpoints?: string[];
  e2e_results?: E2EResults;
  api_results?: APIResults;
  security_results?: SecurityResults;
  performance_results?: PerformanceResults;
  accessibility_results?: AccessibilityResults;
  seo_results?: Record<string, unknown>;
  tech_stack?: TechStackResult;
  top_issues: TopIssue[];
  created_at: string;
  expires_at: string;
}

export interface TopIssue {
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
}

export interface EmailSubmission {
  scan_id: string;
  email: string;
  opted_in_storage: boolean;
}
