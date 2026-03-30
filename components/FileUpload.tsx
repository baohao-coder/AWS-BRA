import React, { useCallback, useState, useRef } from 'react';
import Spinner from './common/Spinner';
import { sortFiles, getAllFilesFromEntries } from '../services/fileUtils';

interface FileUploadProps {
  onFilesSelected: (files: File[]) => void;
  isLoading: boolean;
  progress: number;
  isAnonymizationEnabled: boolean;
  onAnonymizationChange: (enabled: boolean) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFilesSelected, isLoading, progress, isAnonymizationEnabled, onAnonymizationChange }) => {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discoveredFiles, setDiscoveredFiles] = useState<File[]>([]);
  const [selectedFileIndices, setSelectedFileIndices] = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = useCallback((e: React.DragEvent<HTMLDivElement | HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const filterExcelFiles = (files: FileList | File[]): File[] => {
    const allowedExtensions = ['.xlsx', '.xls'];
    return Array.from(files).filter(file => {
      const fileName = file.name.toLowerCase();
      return allowedExtensions.some(ext => fileName.endsWith(ext));
    });
  };

  const handleFilesDiscovered = (files: FileList | null) => {
    if (!files) return;
    const excelFiles = filterExcelFiles(files);
    if (excelFiles.length === 0) {
      setError("在所選範圍內找不到有效的 Excel 檔案 (.xlsx, .xls)。");
      return;
    }
    
    // 應用自定義排序
    const sortedFiles = sortFiles(excelFiles);
    
    setDiscoveredFiles(sortedFiles);
    setSelectedFileIndices(new Set(sortedFiles.keys())); // 預設全選
    setError(null);
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
        handleFilesDiscovered(allFiles as unknown as FileList); // Casting for compatibility with filterExcelFiles
      }
    } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesDiscovered(e.dataTransfer.files);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFilesDiscovered(e.target.files);
    }
  };

  const handleConfirmSelection = () => {
    const selectedFiles = discoveredFiles.filter((_, idx) => selectedFileIndices.has(idx));
    if (selectedFiles.length === 0) {
      setError("請至少選擇一個檔案進行分析。");
      return;
    }
    onFilesSelected(selectedFiles);
    setDiscoveredFiles([]);
  };

  const toggleFileSelection = (index: number) => {
    const newSelection = new Set(selectedFileIndices);
    if (newSelection.has(index)) {
      newSelection.delete(index);
    } else {
      newSelection.add(index);
    }
    setSelectedFileIndices(newSelection);
  };

  const toggleAll = () => {
    if (selectedFileIndices.size === discoveredFiles.length) {
      setSelectedFileIndices(new Set());
    } else {
      setSelectedFileIndices(new Set(discoveredFiles.keys()));
    }
  };

  if (isLoading) {
    return (
      <div className="bg-gray-800 p-6 rounded-lg border-2 border-gray-600">
        <div className="flex flex-col items-center justify-center text-center">
          <Spinner />
          <p className="mt-4 text-lg font-semibold text-white">正在處理檔案...</p>
          <p className="text-gray-400">請稍候，這可能需要一些時間。</p>
          <div className="w-full bg-gray-700 rounded-full h-2.5 mt-4">
            <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
          </div>
          <p className="mt-1 text-sm text-gray-400">{Math.round(progress)}%</p>
        </div>
      </div>
    );
  }

  if (discoveredFiles.length > 0) {
    return (
      <div className="bg-gray-800 p-6 rounded-lg border-2 border-gray-600">
        <h3 className="text-xl font-bold text-white mb-4">選擇要分析的檔案</h3>
        <div className="max-h-64 overflow-y-auto mb-4 bg-gray-900 rounded-md p-2">
          <div className="flex items-center p-2 border-b border-gray-700 mb-2">
            <input 
              type="checkbox" 
              id="select-all" 
              checked={selectedFileIndices.size === discoveredFiles.length}
              onChange={toggleAll}
              className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
            />
            <label htmlFor="select-all" className="ml-2 text-sm font-medium text-white cursor-pointer">全選 ({discoveredFiles.length} 個檔案)</label>
          </div>
          {discoveredFiles.map((file, idx) => (
            <div key={idx} className="flex items-center p-2 hover:bg-gray-800 rounded transition-colors">
              <input 
                type="checkbox" 
                id={`file-${idx}`} 
                checked={selectedFileIndices.has(idx)}
                onChange={() => toggleFileSelection(idx)}
                className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
              />
              <label htmlFor={`file-${idx}`} className="ml-2 text-sm text-gray-300 cursor-pointer truncate">
                {file.name} <span className="text-gray-500 text-xs">({(file.size / 1024).toFixed(1)} KB)</span>
              </label>
            </div>
          ))}
        </div>
        <div className="flex justify-between items-center">
          <button 
            onClick={() => setDiscoveredFiles([])}
            className="text-gray-400 hover:text-white text-sm font-medium"
          >
            取消並重新選擇
          </button>
          <button 
            onClick={handleConfirmSelection}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition-colors"
          >
            開始分析 ({selectedFileIndices.size} 個檔案)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 p-6 rounded-lg border-2 border-dashed border-gray-600 transition-all duration-300">
      {error && (
        <div className="mb-4 p-3 bg-red-900/50 border border-red-500/50 text-red-300 rounded-md text-sm" role="alert">
          <p className="font-bold">提示</p>
          <p>{error}</p>
        </div>
      )}
      <div className="flex flex-col gap-4">
        <div 
          className={`relative flex flex-col items-center justify-center w-full h-64 border-2 border-gray-500 border-dashed rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors ${dragActive ? "border-blue-500 bg-gray-600" : ""}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <div className="flex flex-col items-center justify-center pt-5 pb-6 px-4 text-center">
            <svg className="w-12 h-12 mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
            <p className="mb-2 text-lg text-gray-300 font-semibold">拖曳檔案或資料夾至此</p>
            <p className="mb-6 text-sm text-gray-400">系統將自動判斷並匯入所有有效的 Excel 檔案 (.xlsx, .xls)</p>
            
            <div className="flex flex-wrap justify-center gap-3">
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition-colors flex items-center shadow-lg"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                選擇檔案
              </button>
              <button 
                onClick={() => folderInputRef.current?.click()}
                className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-6 rounded-lg transition-colors flex items-center shadow-lg"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>
                選擇資料夾
              </button>
            </div>
          </div>
          
          <input 
            id="dropzone-file" 
            type="file" 
            className="hidden" 
            multiple 
            accept=".xlsx, .xls" 
            onChange={handleFileChange} 
            ref={fileInputRef}
          />
          <input 
            type="file" 
            className="hidden" 
            ref={folderInputRef}
            onChange={handleFileChange}
            {...({ webkitdirectory: "", directory: "" } as any)}
          />
        </div>
      </div>
      <div className="mt-4 flex items-center justify-center">
        <input
          type="checkbox"
          id="anonymize-data"
          checked={isAnonymizationEnabled}
          onChange={(e) => onAnonymizationChange(e.target.checked)}
          className="w-4 h-4 text-blue-600 bg-gray-600 border-gray-500 rounded focus:ring-blue-500"
        />
        <label htmlFor="anonymize-data" className="ml-2 text-sm font-medium text-gray-300">
          啟用資料匿名化 (遮蔽帳號、產品與用量等敏感資訊)
        </label>
      </div>
    </div>
  );
};

export default FileUpload;
