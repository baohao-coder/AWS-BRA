import React, { useState, useMemo, useCallback } from 'react';
import { BillingData, ServiceDetail } from '../types';
import { exportToExcel } from '../services/excelUtils';
import { 
  getServiceCategory, 
  CATEGORY_METAS, 
  ALL_CATEGORIES, 
  ServiceCategory 
} from '../services/serviceTaxonomy';
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
  const [selectedCategory, setSelectedCategory] = useState<ServiceCategory | 'ALL'>('ALL');
  const [searchResults, setSearchResults] = useState<(ServiceDetail & { category: ServiceCategory })[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const allDetails = useMemo(() => {
    const details: (ServiceDetail & { category: ServiceCategory })[] = [];
    data.forEach(monthData => {
      monthData.accounts.forEach(account => {
        account.services.forEach(service => {
          const category = getServiceCategory(service.productName);
          service.details.forEach(detail => {
            details.push({
              ...detail,
              category
            });
          });
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
        // Category filter check
        if (selectedCategory !== 'ALL' && detail.category !== selectedCategory) {
          return false;
        }

        const searchText = `${detail.accountId} ${detail.accountName} ${detail.productName} ${detail.category} ${detail.usageType} ${detail.itemDescription}`.toLowerCase();
        
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

        // If category is selected or exclude is used or no terms, match
        return true;
      });

      setSearchResults(filtered);
      setIsSearching(false);
    }, 50);
  }, [includeKeywords, excludeKeywords, includeLogic, excludeLogic, selectedCategory, allDetails]);

  const handleExport = () => {
    const dataToExport = searchResults.map(item => ({
      'Service Category': `${item.category} - ${CATEGORY_METAS[item.category]?.name || ''}`,
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
        <div className="space-y-4 p-4">
          {/* 服務分類快速選擇 */}
          <div>
            <label className="block mb-2 text-sm font-medium text-gray-300">
              服務分類快速篩選 (Service Category Filter)
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedCategory('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  selectedCategory === 'ALL'
                    ? 'bg-blue-600 text-white shadow'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
                }`}
              >
                全部分類 (All)
              </button>
              {ALL_CATEGORIES.map(cat => {
                const meta = CATEGORY_METAS[cat];
                const isSelected = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(prev => prev === cat ? 'ALL' : cat)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 border ${
                      isSelected
                        ? 'text-white shadow ring-2 ring-offset-1 ring-offset-gray-900'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white border-transparent'
                    }`}
                    style={{
                      backgroundColor: isSelected ? meta.color : undefined,
                      borderColor: isSelected ? meta.color : undefined
                    }}
                  >
                    <span>{meta.icon}</span>
                    <span>{meta.id}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            <div>
              <label htmlFor="include-keywords" className="block mb-2 text-sm font-medium text-gray-300">包含關鍵字 (以逗號分隔)</label>
              <div className="flex">
                <input 
                  type="text" 
                  id="include-keywords"
                  value={includeKeywords}
                  onChange={(e) => setIncludeKeywords(e.target.value)}
                  className="bg-gray-700 border border-gray-600 text-white text-sm rounded-l-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5" 
                  placeholder="例如: RDS, Bedrock, 7g, SQL Server"
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
          
          <div className="flex justify-end pt-2">
            <button onClick={handleSearch} disabled={isSearching} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded transition-colors disabled:bg-gray-500 shadow-md">
              {isSearching ? <Spinner /> : '執行查詢'}
            </button>
          </div>
        </div>
      </Card>

      <Card title={`查詢結果 (${searchResults.length} 筆)`} actionButton={searchResults.length > 0 && <button onClick={handleExport} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded text-sm transition-colors shadow">匯出 Excel</button>}>
        {isSearching && <div className="flex justify-center p-8"><Spinner /></div>}
        {!isSearching && hasSearched && searchResults.length === 0 && <p className="p-4 text-center text-gray-400">找不到符合條件的資料。</p>}
        {!isSearching && !hasSearched && <p className="p-4 text-center text-gray-400">請輸入查詢條件並點擊查詢按鈕。</p>}
        {!isSearching && searchResults.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-400">
              <thead className="text-xs text-gray-300 uppercase bg-gray-700 sticky top-0">
                <tr>
                  <th scope="col" className="px-4 py-3">分類</th>
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
                {searchResults.map((item, index) => {
                  const meta = CATEGORY_METAS[item.category];
                  return (
                    <tr key={index} className="bg-gray-800 border-b border-gray-700 hover:bg-gray-700 transition-colors">
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span 
                          className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-xs font-semibold"
                          style={{
                            color: meta.color,
                            backgroundColor: `${meta.color}20`,
                            border: `1px solid ${meta.color}40`
                          }}
                        >
                          <span>{meta.icon}</span>
                          <span>{meta.id}</span>
                        </span>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">{item.accountId}</td>
                      <td className="px-4 py-2">{item.accountName}</td>
                      <td className="px-4 py-2 font-medium text-white">{item.productName}</td>
                      <td className="px-4 py-2 text-xs text-gray-300">{item.usageType}</td>
                      <td className="px-4 py-2 text-xs text-gray-400 max-w-xs truncate" title={item.itemDescription}>{item.itemDescription}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs">{item.unitPrice.toFixed(6)}</td>
                      <td className="px-4 py-2 text-right font-mono">{item.usages.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right font-mono font-semibold text-blue-400">${item.totalCost.toFixed(2)}</td>
                      <td className="px-4 py-2 font-mono text-xs">{item.month}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default QueryTab;