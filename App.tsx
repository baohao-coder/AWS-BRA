import React, { useState, useCallback } from 'react';
import { BillingData } from './types';
import FileUpload from './components/FileUpload';
import DashboardTab from './components/DashboardTab';
import QueryTab from './components/QueryTab';
import Top20Tab from './components/Top20Tab';
import SiaReportTab from './components/SiaReportTab';
import ServiceAnalysisTab from './components/ServiceAnalysisTab';
import RiSpAnalysisTab from './components/RiSpAnalysisTab';
import TabButton from './components/common/TabButton';
import { useExcelProcessor } from './hooks/useExcelProcessor';
import { useRiSpProcessor } from './hooks/useRiSpProcessor';
import PrivacyNotice from './components/common/PrivacyNotice';

type MainFunction = 'billing' | 'risp';
type Tab = 'dashboard' | 'query' | 'top20' | 'serviceAnalysis' | 'sia';

const App: React.FC = () => {
  const [mainFunction, setMainFunction] = useState<MainFunction>('billing');
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [isAnonymizationEnabled, setIsAnonymizationEnabled] = useState(false);
  
  const { 
    billingData, 
    isLoading: isBillingLoading, 
    progress: billingProgress, 
    error: billingError, 
    processFiles: processBillingFiles,
    clearData: clearBillingData
  } = useExcelProcessor();

  const {
    result: rispResult,
    isLoading: isRispLoading,
    progress: rispProgress,
    error: rispError,
    processFiles: processRispFiles,
    clearData: clearRispData
  } = useRiSpProcessor();

  const handleFunctionChange = (func: MainFunction) => {
    if (func !== mainFunction) {
      if (func === 'risp') {
        clearBillingData();
      } else {
        clearRispData();
      }
      setMainFunction(func);
    }
  };

  const handleFilesSelected = useCallback(async (files: File[]) => {
    if (files && files.length > 0) {
      await processBillingFiles(files, { anonymize: isAnonymizationEnabled });
      setActiveTab('dashboard');
    }
  }, [processBillingFiles, isAnonymizationEnabled]);

  const renderContent = () => {
    if (isBillingLoading) {
      return null; // FileUpload component shows loading state
    }

    if (billingError) {
      return <div className="text-red-400 text-center p-4">{billingError}</div>;
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
          <nav className="-mb-px flex space-x-6 overflow-x-auto" aria-label="Tabs">
            <TabButton 
              label="資料分析儀表板" 
              isActive={activeTab === 'dashboard'} 
              onClick={() => setActiveTab('dashboard')} 
            />
             <TabButton
              label="服務使用分析"
              isActive={activeTab === 'serviceAnalysis'}
              onClick={() => setActiveTab('serviceAnalysis')}
            />
            <TabButton
              label="Top 20 用量分析"
              isActive={activeTab === 'top20'}
              onClick={() => setActiveTab('top20')}
            />
            <TabButton 
              label="明細資料查詢" 
              isActive={activeTab === 'query'} 
              onClick={() => setActiveTab('query')} 
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
          {activeTab === 'serviceAnalysis' && <ServiceAnalysisTab data={billingData} />}
          {activeTab === 'sia' && <SiaReportTab data={billingData} />}
        </div>
      </>
    );
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 font-sans">
      <div className="container mx-auto p-4 md:p-8">
        <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold text-white tracking-tight">AWS Billing Report Analyzer</h1>
            <p className="text-gray-400 mt-2">上傳、分析並查詢您的 AWS 帳單資料</p>
          </div>
          
          <div className="flex bg-gray-800 p-1 rounded-lg">
            <button
              onClick={() => handleFunctionChange('billing')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                mainFunction === 'billing' 
                  ? 'bg-blue-600 text-white shadow-lg' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              1. 帳單明細分析
            </button>
            <button
              onClick={() => handleFunctionChange('risp')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                mainFunction === 'risp' 
                  ? 'bg-blue-600 text-white shadow-lg' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              2. RI/SP 比例分析
            </button>
          </div>
        </header>
        
        {mainFunction === 'billing' ? (
          <>
            <FileUpload 
              onFilesSelected={handleFilesSelected} 
              isLoading={isBillingLoading} 
              progress={billingProgress}
              isAnonymizationEnabled={isAnonymizationEnabled}
              onAnonymizationChange={setIsAnonymizationEnabled}
            />
            
            <PrivacyNotice />

            <main className="mt-8">
              {renderContent()}
            </main>
          </>
        ) : (
          <main>
            <RiSpAnalysisTab 
              result={rispResult}
              isLoading={isRispLoading}
              progress={rispProgress}
              error={rispError}
              processFiles={processRispFiles}
              clearData={clearRispData}
            />
          </main>
        )}
      </div>
    </div>
  );
};

export default App;