import React, { useRef } from 'react';
import { RiSpAnalysisResult } from '../types';
import Card from './common/Card';
import { exportToExcel } from '../services/excelUtils';

interface RiSpAnalysisTabProps {
  result: RiSpAnalysisResult | null;
  isLoading: boolean;
  progress: number;
  error: string | null;
  processFiles: (files: FileList) => Promise<void>;
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
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
        <div className="p-6 border-2 border-dashed border-gray-700 rounded-lg text-center">
          <input
            type="file"
            multiple
            accept=".xlsx, .xls"
            onChange={handleFileChange}
            className="hidden"
            ref={fileInputRef}
          />
          <div className="flex justify-center gap-4">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition-colors disabled:opacity-50"
            >
              {isLoading ? '處理中...' : '選擇多個 Excel 檔案匯入'}
            </button>
            {result && (
              <button
                onClick={clearData}
                className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-6 rounded-lg transition-colors"
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
