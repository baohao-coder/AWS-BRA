import React, { useState, useCallback } from 'react';
import { BillingData } from './types';
import FileUpload from './components/FileUpload';
import DashboardTab from './components/DashboardTab';
import QueryTab from './components/QueryTab';
import Top20Tab from './components/Top20Tab';
import SiaReportTab from './components/SiaReportTab';
import TabButton from './components/common/TabButton';
import { useExcelProcessor } from './hooks/useExcelProcessor';
import PrivacyNotice from './components/common/PrivacyNotice';

type Tab = 'dashboard' | 'query' | 'top20' | 'sia';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [isAnonymizationEnabled, setIsAnonymizationEnabled] = useState(false);
  const { 
    billingData, 
    isLoading, 
    progress, 
    error, 
    processFiles 
  } = useExcelProcessor();

  const handleFilesSelected = useCallback(async (files: FileList | null) => {
    if (files) {
      await processFiles(files, { anonymize: isAnonymizationEnabled });
      setActiveTab('dashboard');
    }
  }, [processFiles, isAnonymizationEnabled]);

  const renderContent = () => {
    if (isLoading) {
      return null; // FileUpload component shows loading state
    }

    if (error) {
      return <div className="text-red-400 text-center p-4">{error}</div>;
    }

    if (billingData.length === 0) {
      return (
        <div className="text-center text-gray-400 mt-10">
          <h2 className="text-2xl font-semibold">歡迎使用 AWS 帳單分析工具</h2>
          <p className="mt-2">請上傳您的 AWS 月度帳單 Excel 檔案以開始分析。</p>
        </div>
      );
    }
    
    return (
      <>
        <div className="border-b border-gray-700 mb-6">
          <nav className="-mb-px flex space-x-6" aria-label="Tabs">
            <TabButton 
              label="資料分析儀表板" 
              isActive={activeTab === 'dashboard'} 
              onClick={() => setActiveTab('dashboard')} 
            />
            <TabButton 
              label="明細資料查詢" 
              isActive={activeTab === 'query'} 
              onClick={() => setActiveTab('query')} 
            />
            <TabButton
              label="Top 20 用量分析"
              isActive={activeTab === 'top20'}
              onClick={() => setActiveTab('top20')}
            />
             <TabButton
              label="SIA Report"
              isActive={activeTab === 'sia'}
              onClick={() => setActiveTab('sia')}
            />
          </nav>
        </div>
        <div>
          {activeTab === 'dashboard' && <DashboardTab data={billingData} />}
          {activeTab === 'query' && <QueryTab data={billingData} />}
          {activeTab === 'top20' && <Top20Tab data={billingData} />}
          {activeTab === 'sia' && <SiaReportTab data={billingData} />}
        </div>
      </>
    );
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 font-sans">
      <div className="container mx-auto p-4 md:p-8">
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-white tracking-tight">AWS Billing Report Analyzer</h1>
          <p className="text-gray-400 mt-2">上傳、分析並查詢您的 AWS 帳單資料</p>
        </header>
        
        <FileUpload 
          onFilesSelected={handleFilesSelected} 
          isLoading={isLoading} 
          progress={progress}
          isAnonymizationEnabled={isAnonymizationEnabled}
          onAnonymizationChange={setIsAnonymizationEnabled}
        />
        
        <PrivacyNotice />

        <main className="mt-8">
          {renderContent()}
        </main>
      </div>
    </div>
  );
};

export default App;