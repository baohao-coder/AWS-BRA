import React, { useState, useMemo, useCallback } from 'react';
import { BillingData, ServiceDetail } from '../types';
import { exportToExcel } from '../services/excelUtils';
import Card from './common/Card';
import Spinner from './common/Spinner';

interface QueryTabProps {
  data: BillingData;
}

const QueryTab: React.FC<QueryTabProps> = ({ data }) => {
  const [includeKeywords, setIncludeKeywords] = useState('');
  const [excludeKeywords, setExcludeKeywords] = useState('');
  const [includeLogic, setIncludeLogic] = useState<'AND' | 'OR'>('OR');
  const [excludeLogic, setExcludeLogic] = useState<'AND' | 'OR'>('OR');
  const [searchResults, setSearchResults] = useState<ServiceDetail[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const allDetails = useMemo(() => {
    const details: ServiceDetail[] = [];
    data.forEach(monthData => {
      monthData.accounts.forEach(account => {
        account.services.forEach(service => {
          details.push(...service.details);
        });
      });
    });
    return details;
  }, [data]);

  const handleSearch = useCallback(() => {
    setIsSearching(true);
    setHasSearched(true);
    
    // Simulate async search for better UX on large datasets
    setTimeout(() => {
      const includeTerms = includeKeywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
      const excludeTerms = excludeKeywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);

      const filtered = allDetails.filter(detail => {
        const searchText = `${detail.accountId} ${detail.accountName} ${detail.productName} ${detail.usageType} ${detail.itemDescription}`.toLowerCase();
        
        // Exclude logic
        if (excludeTerms.length > 0) {
          const matchExclude = excludeLogic === 'AND'
            ? excludeTerms.every(term => searchText.includes(term))
            : excludeTerms.some(term => searchText.includes(term));
          if (matchExclude) return false;
        }

        // Include logic
        if (includeTerms.length > 0) {
          const matchInclude = includeLogic === 'AND'
            ? includeTerms.every(term => searchText.includes(term))
            : includeTerms.some(term => searchText.includes(term));
          return matchInclude;
        }

        return excludeTerms.length > 0; // if only exclude is used, return all non-excluded
      });

      setSearchResults(filtered);
      setIsSearching(false);
    }, 50);
  }, [includeKeywords, excludeKeywords, includeLogic, excludeLogic, allDetails]);

  const handleExport = () => {
    const dataToExport = searchResults.map(item => ({
      'Account ID': item.accountId,
      'Account Name': item.accountName,
      'Product Name': item.productName,
      'Usage Type': item.usageType,
      'Item Description': item.itemDescription,
      'Unit Price': item.unitPrice,
      'Usages': item.usages,
      'Total Cost (USD)': item.totalCost,
      'Month': item.month,
    }));
    exportToExcel(dataToExport, 'billing_query_results');
  };

  return (
    <div className="space-y-6">
      <Card title="資料查詢條件">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4">
          <div>
            <label htmlFor="include-keywords" className="block mb-2 text-sm font-medium text-gray-300">包含關鍵字 (以逗號分隔)</label>
            <div className="flex">
              <input 
                type="text" 
                id="include-keywords"
                value={includeKeywords}
                onChange={(e) => setIncludeKeywords(e.target.value)}
                className="bg-gray-700 border border-gray-600 text-white text-sm rounded-l-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5" 
                placeholder="例如: RDS, 7g, SQL Server"
              />
              <div className="flex items-center border border-l-0 border-gray-600 bg-gray-700 rounded-r-lg px-2">
                <input id="include-or" type="radio" value="OR" name="include-logic" checked={includeLogic === 'OR'} onChange={() => setIncludeLogic('OR')} className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 focus:ring-blue-600"/>
                <label htmlFor="include-or" className="ml-1 mr-3 text-sm font-medium text-gray-300">OR</label>
                <input id="include-and" type="radio" value="AND" name="include-logic" checked={includeLogic === 'AND'} onChange={() => setIncludeLogic('AND')} className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 focus:ring-blue-600"/>
                <label htmlFor="include-and" className="ml-1 text-sm font-medium text-gray-300">AND</label>
              </div>
            </div>
          </div>
          <div>
            <label htmlFor="exclude-keywords" className="block mb-2 text-sm font-medium text-gray-300">排除關鍵字 (以逗號分隔)</label>
            <div className="flex">
              <input 
                type="text" 
                id="exclude-keywords"
                value={excludeKeywords}
                onChange={(e) => setExcludeKeywords(e.target.value)}
                className="bg-gray-700 border border-gray-600 text-white text-sm rounded-l-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                placeholder="例如: free tier, trial"
              />
               <div className="flex items-center border border-l-0 border-gray-600 bg-gray-700 rounded-r-lg px-2">
                <input id="exclude-or" type="radio" value="OR" name="exclude-logic" checked={excludeLogic === 'OR'} onChange={() => setExcludeLogic('OR')} className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 focus:ring-blue-600"/>
                <label htmlFor="exclude-or" className="ml-1 mr-3 text-sm font-medium text-gray-300">OR</label>
                <input id="exclude-and" type="radio" value="AND" name="exclude-logic" checked={excludeLogic === 'AND'} onChange={() => setExcludeLogic('AND')} className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 focus:ring-blue-600"/>
                <label htmlFor="exclude-and" className="ml-1 text-sm font-medium text-gray-300">AND</label>
              </div>
            </div>
          </div>
        </div>
        <div className="flex justify-end p-4">
          <button onClick={handleSearch} disabled={isSearching} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded transition-colors disabled:bg-gray-500">
            {isSearching ? <Spinner /> : '查詢'}
          </button>
        </div>
      </Card>

      <Card title={`查詢結果 (${searchResults.length} 筆)`} actionButton={searchResults.length > 0 && <button onClick={handleExport} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded text-sm transition-colors">匯出 Excel</button>}>
        {isSearching && <div className="flex justify-center p-8"><Spinner /></div>}
        {!isSearching && hasSearched && searchResults.length === 0 && <p className="p-4 text-center text-gray-400">找不到符合條件的資料。</p>}
        {!isSearching && !hasSearched && <p className="p-4 text-center text-gray-400">請輸入查詢條件並點擊查詢按鈕。</p>}
        {!isSearching && searchResults.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-400">
              <thead className="text-xs text-gray-300 uppercase bg-gray-700 sticky top-0">
                <tr>
                  <th scope="col" className="px-4 py-3">Account ID</th>
                  <th scope="col" className="px-4 py-3">Account Name</th>
                  <th scope="col" className="px-4 py-3">Product Name</th>
                  <th scope="col" className="px-4 py-3">Usage Type</th>
                  <th scope="col" className="px-4 py-3">Item Description</th>
                  <th scope="col" className="px-4 py-3 text-right">Unit Price (USD)</th>
                  <th scope="col" className="px-4 py-3 text-right">Usages</th>
                  <th scope="col" className="px-4 py-3 text-right">Total Cost (USD)</th>
                  <th scope="col" className="px-4 py-3">Month</th>
                </tr>
              </thead>
              <tbody>
                {searchResults.map((item, index) => (
                  <tr key={index} className="bg-gray-800 border-b border-gray-700 hover:bg-gray-700">
                    <td className="px-4 py-2">{item.accountId}</td>
                    <td className="px-4 py-2">{item.accountName}</td>
                    <td className="px-4 py-2">{item.productName}</td>
                    <td className="px-4 py-2">{item.usageType}</td>
                    <td className="px-4 py-2">{item.itemDescription}</td>
                    <td className="px-4 py-2 text-right">{item.unitPrice.toFixed(6)}</td>
                    <td className="px-4 py-2 text-right">{item.usages.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right font-semibold text-white">{item.totalCost.toFixed(2)}</td>
                    <td className="px-4 py-2">{item.month}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default QueryTab;