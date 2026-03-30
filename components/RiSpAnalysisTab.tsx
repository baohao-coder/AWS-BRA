import React, { useRef, useState, useCallback } from 'react';
import { RiSpAnalysisResult } from '../types';
import Card from './common/Card';
import { exportToExcel } from '../services/excelUtils';
import { sortFiles, getAllFilesFromEntries } from '../services/fileUtils';

interface RiSpAnalysisTabProps {
  result: RiSpAnalysisResult | null;
  isLoading: boolean;
  progress: number;
  error: string | null;
  processFiles: (files: File[]) => Promise<void>;
  clearData: () => void;
}

const RiSpAnalysisTab: React.FC<RiSpAnalysisTabProps> = ({
  result,
  isLoading,
  progress,
  error,
  processFiles,
  clearData
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const [dragActive, setDragActive] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleFilesDiscovered = (files: File[] | FileList) => {
    const allowedExtensions = ['.xlsx', '.xls'];
    const excelFiles = Array.from(files).filter((file: any) => {
      const fileName = file.name.toLowerCase();
      return allowedExtensions.some(ext => fileName.endsWith(ext));
    }) as File[];
    
    if (excelFiles.length > 0) {
      const sortedFiles = sortFiles(excelFiles);
      processFiles(sortedFiles);
    }
  };

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.items) {
      const entries = Array.from(e.dataTransfer.items as any)
        .filter((item: any) => item.kind === 'file')
        .map((item: any) => item.webkitGetAsEntry())
        .filter(entry => entry !== null);
      
      if (entries.length > 0) {
        const allFiles = await getAllFilesFromEntries(entries);
        handleFilesDiscovered(allFiles);
      }
    } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesDiscovered(e.dataTransfer.files);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFilesDiscovered(e.target.files);
    }
  };

  const handleExport = () => {
    if (!result) return;
    
    const exportData = result.monthlyData.map(d => ({
      '計費月份': d.month,
      '原幣總計($USD)': formatNum(d.originalPriceTotal),
      'RI/SP總計($USD)': formatNum(d.riSpTotal),
      'RI/SP比率(%)': d.ratio.toFixed(2)
    }));

    exportData.push({
      '計費月份': '總計',
      '原幣總計($USD)': formatNum(result.grandTotalOriginalPrice),
      'RI/SP總計($USD)': formatNum(result.grandTotalRiSp),
      'RI/SP比率(%)': result.overallRatio.toFixed(2)
    });

    exportToExcel(exportData, 'RI_SP_Analysis_Report');
  };

  const formatNum = (num: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(num);
  };

  return (
    <div className="space-y-6">
      <Card title="RI/SP 分析資料匯入">
        <div 
          className={`p-8 border-2 border-dashed rounded-lg text-center transition-all duration-300 ${dragActive ? "border-blue-500 bg-blue-900/20" : "border-gray-700 bg-gray-800/50"}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <div className="flex flex-col items-center justify-center mb-4">
            <svg className="w-12 h-12 mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
            <p className="text-lg font-semibold text-gray-300">拖曳檔案或資料夾至此</p>
            <p className="text-sm text-gray-400 mt-1">系統將自動判斷並匯入所有有效的 Excel 檔案</p>
          </div>

          <div className="flex justify-center gap-4 flex-wrap mt-6">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-8 rounded-lg transition-colors disabled:opacity-50 shadow-lg flex items-center"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
              選擇檔案
            </button>
            <button
              onClick={() => folderInputRef.current?.click()}
              disabled={isLoading}
              className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-8 rounded-lg transition-colors disabled:opacity-50 shadow-lg flex items-center"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>
              選擇資料夾
            </button>
            
            <input
              type="file"
              multiple
              accept=".xlsx, .xls"
              onChange={handleFileChange}
              className="hidden"
              ref={fileInputRef}
            />
            <input 
              type="file" 
              className="hidden" 
              ref={folderInputRef}
              onChange={handleFileChange}
              {...({ webkitdirectory: "", directory: "" } as any)}
            />
            
            {result && (
              <button
                onClick={clearData}
                className="bg-red-900/50 hover:bg-red-900 text-red-200 font-bold py-2 px-8 rounded-lg transition-colors shadow-lg"
              >
                清除資料
              </button>
            )}
          </div>
          <p className="mt-2 text-sm text-gray-400">
            支援同時選取多個月份的 Excel 檔案。匯入新檔案將清除舊資料。
          </p>
          
          {isLoading && (
            <div className="mt-4">
              <div className="w-full bg-gray-700 rounded-full h-2.5 mb-2">
                <div 
                  className="bg-blue-500 h-2.5 rounded-full transition-all duration-300" 
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <p className="text-xs text-gray-400">{Math.round(progress)}% 已完成</p>
            </div>
          )}
        </div>
      </Card>

      {error && (
        <div className="bg-red-900/50 border border-red-500 text-red-200 p-4 rounded-lg">
          {error}
        </div>
      )}

      {result && result.monthlyData.length === 0 && (
        <div className="bg-yellow-900/50 border border-yellow-500 text-yellow-200 p-4 rounded-lg text-center">
          未在匯入的檔案中找到符合條件的資料。請確認檔案內容與分頁名稱是否正確。
        </div>
      )}

      {result && result.monthlyData.length > 0 && (
        <Card title="RI/SP 分析報表">
          <div className="mb-4 flex justify-end">
            <button
              onClick={handleExport}
              className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded transition-colors text-sm"
            >
              匯出 Excel 報表
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-400">
              <thead className="text-xs text-gray-300 uppercase bg-gray-800">
                <tr>
                  <th className="px-6 py-3">計費月份</th>
                  <th className="px-6 py-3 text-right">原幣總計($USD)</th>
                  <th className="px-6 py-3 text-right">RI/SP總計($USD)</th>
                  <th className="px-6 py-3 text-right">RI/SP比率(%)</th>
                </tr>
              </thead>
              <tbody>
                {result.monthlyData.map((row, idx) => (
                  <tr key={idx} className="bg-gray-900 border-b border-gray-800 hover:bg-gray-800">
                    <td className="px-6 py-4 font-medium text-white">{row.month}</td>
                    <td className="px-6 py-4 text-right">{formatNum(row.originalPriceTotal)}</td>
                    <td className="px-6 py-4 text-right">{formatNum(row.riSpTotal)}</td>
                    <td className="px-6 py-4 text-right text-blue-400 font-semibold">{row.ratio.toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-800 font-bold text-white">
                <tr>
                  <td className="px-6 py-4">總計</td>
                  <td className="px-6 py-4 text-right">{formatNum(result.grandTotalOriginalPrice)}</td>
                  <td className="px-6 py-4 text-right">{formatNum(result.grandTotalRiSp)}</td>
                  <td className="px-6 py-4 text-right text-green-400">{result.overallRatio.toFixed(2)}%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};

export default RiSpAnalysisTab;
