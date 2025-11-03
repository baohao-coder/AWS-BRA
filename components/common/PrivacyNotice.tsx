import React from 'react';

const PrivacyNotice: React.FC = () => {
  return (
    <div className="mt-6 bg-gray-800 border border-blue-900/50 rounded-lg p-4 flex items-start space-x-3">
      <div className="flex-shrink-0">
        {/* Shield Icon */}
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 20.944a11.955 11.955 0 018.618-3.04 12.02 12.02 0 008.382-10.988z" />
        </svg>
      </div>
      <div>
        <h4 className="font-semibold text-white">您的隱私至關重要</h4>
        <p className="text-sm text-gray-400">
          所有檔案處理均在您的瀏覽器本機完成。您的帳單資料絕不會離開您的電腦或上傳至任何伺服器。
        </p>
      </div>
    </div>
  );
};

export default PrivacyNotice;
