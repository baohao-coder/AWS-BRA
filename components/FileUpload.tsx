import React, { useCallback, useState } from 'react';
import Spinner from './common/Spinner';

interface FileUploadProps {
  onFilesSelected: (files: FileList) => void;
  isLoading: boolean;
  progress: number;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFilesSelected, isLoading, progress }) => {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDrag = useCallback((e: React.DragEvent<HTMLDivElement | HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const validateAndProcessFiles = useCallback((files: FileList) => {
    const allowedExtensions = ['.xlsx', '.xls'];
    const invalidFiles = Array.from(files).filter(file => {
      const fileName = file.name.toLowerCase();
      return !allowedExtensions.some(ext => fileName.endsWith(ext));
    });

    if (invalidFiles.length > 0) {
      const invalidFileNames = invalidFiles.map(f => f.name).join(', ');
      setError(`偵測到不支援的檔案類型: ${invalidFileNames}。僅接受 .xlsx 和 .xls 檔案。`);
      const input = document.getElementById('dropzone-file') as HTMLInputElement;
      if (input) {
        input.value = '';
      }
      return;
    }
    
    setError(null);
    onFilesSelected(files);
  }, [onFilesSelected]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndProcessFiles(e.dataTransfer.files);
    }
  }, [validateAndProcessFiles]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files.length > 0) {
      validateAndProcessFiles(e.target.files);
    }
  };

  return (
    <div className="bg-gray-800 p-6 rounded-lg border-2 border-dashed border-gray-600 transition-all duration-300">
      {isLoading ? (
        <div className="flex flex-col items-center justify-center text-center">
            <Spinner />
            <p className="mt-4 text-lg font-semibold text-white">正在處理檔案...</p>
            <p className="text-gray-400">請稍候，這可能需要一些時間。</p>
            <div className="w-full bg-gray-700 rounded-full h-2.5 mt-4">
              <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${progress}%` }}></div>
            </div>
            <p className="mt-1 text-sm text-gray-400">{Math.round(progress)}%</p>
        </div>
      ) : (
        <>
          {error && (
            <div className="mb-4 p-3 bg-red-900/50 border border-red-500/50 text-red-300 rounded-md text-sm" role="alert">
              <p className="font-bold">上傳失敗</p>
              <p>{error}</p>
            </div>
          )}
          <form onDragEnter={handleDrag} onSubmit={(e) => e.preventDefault()}>
            <label 
              htmlFor="dropzone-file" 
              className={`relative flex flex-col items-center justify-center w-full h-48 border-2 border-gray-500 border-dashed rounded-lg cursor-pointer bg-gray-700 hover:bg-gray-600 transition-colors ${dragActive ? "border-blue-500 bg-gray-600" : ""}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <svg className="w-10 h-10 mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                <p className="mb-2 text-sm text-gray-400"><span className="font-semibold text-blue-400">點擊上傳</span> 或拖曳檔案至此</p>
                <p className="text-xs text-gray-500">選擇多個月份的 AWS 帳單 Excel 檔案 (.xlsx, .xls)</p>
              </div>
              <input id="dropzone-file" type="file" className="hidden" multiple accept=".xlsx, .xls" onChange={handleChange} />
            </label>
          </form>
        </>
      )}
    </div>
  );
};

export default FileUpload;