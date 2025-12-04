import { useState, useEffect } from 'react';
import { Calendar, Loader2 } from 'lucide-react';
import { LegalBanner } from './components/LegalBanner';
import { ScanForm } from './components/ScanForm';
import ResultsPreview from './components/ResultsPreview';
import { ConsultationModal } from './components/ConsultationModal';
import { supabase } from './lib/supabase';
import type { ScanResult } from './types/scan';

function App() {
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [showConsultationModal, setShowConsultationModal] = useState(false);

  useEffect(() => {
    if (!scanResult || scanResult.scan_status === 'completed' || scanResult.scan_status === 'failed') {
      return;
    }

    const pollInterval = setInterval(async () => {
      const { data } = await supabase
        .from('scan_results')
        .select('*')
        .eq('id', scanResult.id)
        .maybeSingle();

      if (data) {
        setScanResult(data as ScanResult);
        if (data.scan_status === 'completed' || data.scan_status === 'failed') {
          setScanning(false);
        }
      }
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [scanResult]);

  const handleScan = async (url: string) => {
    setScanning(true);
    setScanResult(null);
    setErrorMessage('');

    try {
      const { data, error } = await supabase
        .from('scan_results')
        .insert({
          target_url: url,
          scan_status: 'pending'
        })
        .select()
        .single();

      if (error) throw error;

      setScanResult(data as ScanResult);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/web-scanner`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ scanId: data.id, url }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Scan initiation failed');
      }
    } catch (error) {
      console.error('Scan error:', error);
      setScanning(false);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to start scan. Please try again.');
    }
  };

  const handleNewScan = () => {
    setScanResult(null);
    setScanning(false);
    setErrorMessage('');
  };

  const handleEmailSubmit = async (email: string, optIn: boolean) => {
    if (!scanResult) return;

    const { error: insertError } = await supabase
      .from('email_submissions')
      .insert({
        scan_id: scanResult.id,
        email,
        opted_in_storage: optIn
      });

    if (insertError) throw insertError;

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-report`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ scanId: scanResult.id, email }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || errorData.message || 'Failed to send report');
    }

    const result = await response.json();
    console.log('Report sent:', result);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <header className="sticky top-0 z-50 bg-white shadow-sm border-b border-gray-200">
        <div className="container mx-auto px-6 py-4">
          <div className="flex justify-between items-center max-w-7xl mx-auto">
            <button onClick={handleNewScan} className="cursor-pointer bg-transparent border-none p-0">
              <img src="/image copy.png" alt="RoboLab Logo" className="h-8 md:h-10 hover:opacity-80 transition-opacity" />
            </button>
            <button
              onClick={() => setShowConsultationModal(true)}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 font-medium text-sm md:text-base"
            >
              <Calendar className="w-4 h-4 md:w-5 md:h-5" />
              <span className="hidden sm:inline">Book Consultation</span>
              <span className="sm:hidden">Book</span>
            </button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {!scanResult && (
          <div className="text-center mt-8 mb-16 px-4">
            <h1 className="text-3xl md:text-5xl font-bold text-gray-900 mb-4">
              Robo-Lab Web Scanner
            </h1>
            <p className="text-lg md:text-xl text-gray-600 max-w-2xl mx-auto">
              Comprehensive automated analysis for E2E, API, Security, Performance & Accessibility
            </p>
          </div>
        )}

        <ConsultationModal
          isOpen={showConsultationModal}
          onClose={() => setShowConsultationModal(false)}
        />

        <div className="flex flex-col items-center gap-8">
          {!scanResult && (
            <>
              <LegalBanner />
              <ScanForm onScan={handleScan} loading={scanning} />
              {errorMessage && (
                <div className="w-full max-w-3xl bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-red-800 text-center">{errorMessage}</p>
                </div>
              )}
            </>
          )}

          {scanResult && scanResult.scan_status === 'pending' && (
            <div className="w-full max-w-3xl bg-white rounded-xl shadow-lg border border-gray-200 p-12">
              <div className="flex flex-col items-center justify-center text-center">
                <Loader2 className="w-16 h-16 text-blue-600 animate-spin mb-6" />
                <h3 className="text-2xl font-bold text-gray-900 mb-3">Starting Scan...</h3>
                <p className="text-gray-600 mb-2">Initializing website analysis</p>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
                  <span>This usually takes less than a second</span>
                </div>
              </div>
            </div>
          )}

          {scanResult && scanResult.scan_status === 'processing' && (
            <div className="w-full max-w-3xl bg-white rounded-xl shadow-lg border border-gray-200 p-12">
              <div className="flex flex-col items-center justify-center text-center">
                <Loader2 className="w-16 h-16 text-blue-600 animate-spin mb-6" />
                <h3 className="text-2xl font-bold text-gray-900 mb-3">Analyzing Your Website</h3>
                <p className="text-gray-600 mb-6">Running comprehensive scans...</p>
                
                <div className="w-full max-w-md space-y-3 text-left">
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-gray-700">Security scan</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-gray-700">Accessibility check</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-gray-700">E2E testing analysis</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0 animate-pulse">
                      <Loader2 className="w-3 h-3 text-white animate-spin" />
                    </div>
                    <span className="text-gray-700 font-medium">Performance analysis (Google PageSpeed)</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-5 h-5 rounded-full bg-gray-300 flex items-center justify-center flex-shrink-0"></div>
                    <span className="text-gray-500">AI recommendations</span>
                  </div>
                </div>

                <p className="text-sm text-gray-500 mt-6">This may take 30-60 seconds</p>
              </div>
            </div>
          )}

          {scanResult && (
            <ResultsPreview
              result={scanResult}
              onEmailSubmit={handleEmailSubmit}
              onScanAnother={handleNewScan}
            />
          )}

          {scanning && (
            <div className="flex flex-col items-center">
              <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
              <p className="text-gray-700 text-sm">Scanning in progress... Please wait.</p>
            </div>
          )}

          {!scanResult && !scanning && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 w-full max-w-5xl mt-8">
              <FeatureCard
                icon="🔒"
                title="Security"
                description="TLS, HSTS, headers, cookie flags"
              />
              <FeatureCard
                icon="⚡"
                title="Performance"
                description="Lighthouse metrics, LCP, CLS, TBT"
              />
              <FeatureCard
                icon="👁️"
                title="Accessibility"
                description="WCAG compliance via axe-core"
              />
              <FeatureCard
                icon="🔌"
                title="API Analysis"
                description="Endpoints, status codes, hygiene"
              />
            </div>
          )}
        </div>

        <footer className="text-center mt-16 text-sm text-gray-500">
          <p>Non-intrusive scans only • Respects robots.txt • Results stored 30 days</p>
        </footer>
      </div>
    </div>
  );
}

interface FeatureCardProps {
  icon: string;
  title: string;
  description: string;
}

function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
      <div className="text-4xl mb-3">{icon}</div>
      <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-600">{description}</p>
    </div>
  );
}

export default App;
