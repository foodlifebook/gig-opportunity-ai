import { useState, useEffect } from 'react';
import {
  IconUpload,
  IconChartBar,
  IconFileReport,
  IconBrain,
  IconHistory,
} from '@tabler/icons-react';
import axios from 'axios';
import API_BASE_URL from './utils/api';
import UploadTab from './components/UploadTab.jsx';
import DashboardTab from './components/DashboardTab.jsx';
import ReportTab from './components/ReportTab.jsx';
import AIInsightsTab from './components/AIInsightsTab.jsx';
import HistoryTab from './components/HistoryTab.jsx';

const FRONTEND_VERSION = '1.2.1'; // Updated for new tab behavior, screenshot exports, and keyword headlines

const TABS = [
  { id: 'upload', label: 'Upload & Clean', icon: IconUpload },
  { id: 'dashboard', label: 'Live Dashboard', icon: IconChartBar },
  { id: 'report', label: 'Opportunity Report', icon: IconFileReport },
  { id: 'insights', label: 'AI Insights', icon: IconBrain },
  { id: 'history', label: 'History', icon: IconHistory },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('upload');
  const [analysisData, setAnalysisData] = useState(null);
  const [backendVersion, setBackendVersion] = useState('—');

  // Fetch backend version on mount
  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const { data } = await axios.get(`${API_BASE_URL}/version`);
        setBackendVersion(data.backend);
      } catch (err) {
        console.warn('Could not fetch backend version:', err.message);
      }
    };
    fetchVersion();
  }, []);

  // Load a saved history entry when the page is opened with ?historyId=123
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const historyId = params.get('historyId');
    if (!historyId) return;

    const fetchHistoryItem = async () => {
      try {
        const { data } = await axios.get(`${API_BASE_URL}/history/${historyId}`);
        const loaded = {
          ...data.data,
          rowCount: data.data.rowCount,
          cleanedRows: data.data.cleanedRows,
          scoreResult: data.data.scoreResult,
          dates: data.data.dates,
          seriesFields: data.data.seriesFields,
          repairStats: data.data.repairStats,
          savedInsights: data.data.savedInsights || {},
        };
        setAnalysisData(loaded);
        setActiveTab('dashboard');
      } catch (err) {
        console.warn('Could not load history item:', err.message);
      }
    };

    fetchHistoryItem();
  }, []);

  // Called after fresh upload OR loading from history
  const handleAnalysisComplete = (data, options = {}) => {
    setAnalysisData(data);
    if (options.mode !== 'clean' && options.mode !== 'batch') {
      setActiveTab('dashboard');
    }
  };

  // Called from HistoryTab when user clicks "Load & View" on a saved upload
  const handleLoadFromHistory = (data) => {
    setAnalysisData(data);
    setActiveTab('dashboard');
  };

  const canAccessTab = (tabId) => {
    if (tabId === 'upload' || tabId === 'history') return true;
    return analysisData !== null;
  };

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-sky-500 rounded-xl flex items-center justify-center text-lg">
              📊
            </div>
            <div>
              <h1 className="text-lg font-bold text-white leading-tight">GigOpportunity AI</h1>
              <p className="text-xs text-gray-500 leading-tight">
                Fiverr Niche Intelligence 
                <span className="text-sky-400"> v{FRONTEND_VERSION}</span> 
                <span className="text-gray-600"> · </span>
                <span className="text-emerald-400">API v{backendVersion}</span>
              </p>
            </div>
          </div>
          {analysisData && (
            <div className="hidden sm:flex items-center gap-2 text-xs text-gray-400">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              {analysisData.filename && (
                <span className="truncate max-w-[160px]" title={analysisData.filename}>
                  {analysisData.filename}
                </span>
              )}
              <span>·</span>
              <span>{analysisData.rowCount} gigs</span>
            </div>
          )}
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="border-b border-gray-800 bg-gray-900/50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-1 py-2 overflow-x-auto scrollbar-hide">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              const accessible = canAccessTab(tab.id);
              return (
                <button
                  key={tab.id}
                  onClick={() => accessible && setActiveTab(tab.id)}
                  className={`tab-btn whitespace-nowrap ${active ? 'active' : ''} ${
                    !accessible ? 'opacity-40 cursor-not-allowed' : ''
                  }`}
                  title={!accessible ? 'Upload a file first' : ''}
                >
                  <Icon size={16} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Tab Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'upload' && (
          <UploadTab onAnalysisComplete={handleAnalysisComplete} />
        )}
        {activeTab === 'dashboard' && analysisData && (
          <DashboardTab data={analysisData} />
        )}
        {activeTab === 'report' && analysisData && (
          <ReportTab data={analysisData} />
        )}
        {activeTab === 'insights' && analysisData && (
          <AIInsightsTab data={analysisData} />
        )}
        {activeTab === 'history' && (
          <HistoryTab onLoadAnalysis={handleLoadFromHistory} />
        )}
      </main>
    </div>
  );
}
