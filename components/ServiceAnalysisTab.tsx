
import React, { useMemo, useState } from 'react';
import { BillingData, ServiceDetail } from '../types';
import { exportToExcel } from '../services/excelUtils';
import Card from './common/Card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface ServiceAnalysisTabProps {
  data: BillingData;
}

// Define local interfaces for complex structures to help TypeScript inference
interface ProductAccountSummary {
  accountId: string;
  accountName: string;
  cost: number;
}

interface ProductDetailSummary {
  usageType: string;
  itemDescription: string;
  usage: number;
  cost: number;
}

interface ProductSummary {
  productName: string;
  totalCost: number;
  accounts: Map<string, ProductAccountSummary>;
  details: Map<string, ProductDetailSummary>;
}

const formatNumber = (value: number, decimals: number = 2) => {
    if (typeof value !== 'number' || isNaN(value)) return '0.00';
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
};

type ProductSortKey = 'name' | 'totalCost';
type SortDirection = 'asc' | 'desc';

const ServiceAnalysisTab: React.FC<ServiceAnalysisTabProps> = ({ data }) => {
  const sortedData = useMemo(() => [...data].sort((a, b) => a.month.localeCompare(b.month)), [data]);
  const months = useMemo(() => sortedData.map(d => d.month), [sortedData]);
  
  const [selectedMonth, setSelectedMonth] = useState<string>(months[months.length - 1] || '');
  const [expandedProductName, setExpandedProductName] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: ProductSortKey; direction: SortDirection }>({
    key: 'totalCost',
    direction: 'desc'
  });

  const productAnalysis = useMemo(() => {
    const monthData = sortedData.find(d => d.month === selectedMonth);
    if (!monthData) return [];

    const productMap = new Map<string, ProductSummary>();

    monthData.accounts.forEach(account => {
      account.services.forEach(service => {
        if (!productMap.has(service.productName)) {
          productMap.set(service.productName, {
            productName: service.productName,
            totalCost: 0,
            accounts: new Map<string, ProductAccountSummary>(),
            details: new Map<string, ProductDetailSummary>()
          });
        }
        
        const p = productMap.get(service.productName)!;
        p.totalCost += service.totalCost;

        // 帳號佔比統計
        if (!p.accounts.has(account.accountId)) {
          p.accounts.set(account.accountId, { accountId: account.accountId, accountName: account.accountName, cost: 0 });
        }
        p.accounts.get(account.accountId)!.cost += service.totalCost;

        // 明細彙總 (Usage Type + Item Description 相同則加總)
        service.details.forEach(detail => {
          const detailKey = `${detail.usageType}|||${detail.itemDescription}`;
          if (!p.details.has(detailKey)) {
            p.details.set(detailKey, { 
              usageType: detail.usageType, 
              itemDescription: detail.itemDescription, 
              usage: 0, 
              cost: 0 
            });
          }
          const d = p.details.get(detailKey)!;
          d.usage += detail.usages;
          d.cost += detail.totalCost;
        });
      });
    });

    return Array.from(productMap.values()).sort((a, b) => {
        let valA: any, valB: any;
        if (sortConfig.key === 'name') {
            valA = a.productName; valB = b.productName;
        } else {
            valA = a.totalCost; valB = b.totalCost;
        }
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });
  }, [selectedMonth, sortedData, sortConfig]);

  const top10ChartData = useMemo(() => {
    return [...productAnalysis]
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, 10)
      .map(p => ({
        name: p.productName,
        cost: p.totalCost
      }));
  }, [productAnalysis]);

  const handleExport = () => {
    const exportData = productAnalysis.map(p => ({
      'Product Name': p.productName,
      'Total Cost (USD)': p.totalCost.toFixed(2),
      'Usage Month': selectedMonth
    }));
    exportToExcel(exportData, `service_analysis_${selectedMonth}`);
  };

  const handleSort = (key: ProductSortKey) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const getSortIcon = (key: ProductSortKey) => {
    if (sortConfig.key !== key) return '↕';
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  };

  const COLORS = ['#4299e1', '#48bb78', '#ed8936', '#9f7aea', '#f56565', '#38b2ac', '#ecc94b', '#a0aec0', '#667eea', '#ed64a1'];

  return (
    <div className="space-y-8">
      <Card title="Top 10 服務費用分佈">
        <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={top10ChartData} layout="vertical" margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#4a5568" horizontal={false} />
                    <XAxis type="number" stroke="#a0aec0" />
                    <YAxis dataKey="name" type="category" stroke="#a0aec0" width={90} fontSize={10} />
                    <Tooltip 
                        contentStyle={{ backgroundColor: '#2d3748', border: 'none', borderRadius: '0.5rem' }}
                        labelStyle={{ color: '#e2e8f0' }}
                        formatter={(value: number) => [`$${formatNumber(value)}`, 'Total Cost']}
                    />
                    <Bar dataKey="cost" radius={[0, 4, 4, 0]}>
                        {top10ChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
      </Card>

      <Card 
        title="產品服務清單" 
        actionButton={
            <div className="flex items-center space-x-4">
                <select
                    value={selectedMonth}
                    onChange={(e) => {
                        setSelectedMonth(e.target.value);
                        setExpandedProductName(null);
                    }}
                    className="bg-gray-700 border border-gray-600 text-white text-sm rounded-lg p-2"
                >
                    {months.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <button onClick={handleExport} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded text-sm transition-colors">匯出總表</button>
            </div>
        }
      >
        <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-400">
                <thead className="text-xs text-gray-300 uppercase bg-gray-700 sticky top-0">
                    <tr>
                        <th scope="col" className="px-6 py-3 cursor-pointer hover:bg-gray-600 transition-colors" onClick={() => handleSort('name')}>
                            產品名稱 <span className={sortConfig.key === 'name' ? 'text-blue-400' : 'text-gray-500'}>{getSortIcon('name')}</span>
                        </th>
                        <th scope="col" className="px-6 py-3 text-right cursor-pointer hover:bg-gray-600 transition-colors" onClick={() => handleSort('totalCost')}>
                            總費用 (USD) <span className={sortConfig.key === 'totalCost' ? 'text-blue-400' : 'text-gray-500'}>{getSortIcon('totalCost')}</span>
                        </th>
                        <th scope="col" className="px-6 py-3 text-center">佔比</th>
                    </tr>
                </thead>
                <tbody>
                    {productAnalysis.map(product => {
                        const isExpanded = expandedProductName === product.productName;
                        const totalMonthCost = productAnalysis.reduce((sum, p) => sum + p.totalCost, 0);
                        const percentage = totalMonthCost > 0 ? (product.totalCost / totalMonthCost) * 100 : 0;

                        return (
                            <React.Fragment key={product.productName}>
                                <tr 
                                    className={`bg-gray-800 border-b border-gray-700 hover:bg-gray-700 cursor-pointer transition-colors ${isExpanded ? 'bg-gray-750' : ''}`}
                                    onClick={() => setExpandedProductName(isExpanded ? null : product.productName)}
                                >
                                    <td className="px-6 py-4 font-medium text-white">
                                        <span className={`inline-block w-4 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                                        <span className="ml-2">{product.productName}</span>
                                    </td>
                                    <td className="px-6 py-4 text-right font-bold text-blue-400">{formatNumber(product.totalCost)}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center">
                                            <div className="w-full bg-gray-700 rounded-full h-1.5 mr-2">
                                                <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${percentage}%` }}></div>
                                            </div>
                                            <span className="text-xs w-10 text-right">{percentage.toFixed(1)}%</span>
                                        </div>
                                    </td>
                                </tr>
                                {isExpanded && (
                                    <tr className="bg-gray-900">
                                        <td colSpan={3} className="p-6">
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                                {/* 帳號分佈 */}
                                                <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 shadow-inner">
                                                    <h5 className="text-sm font-bold text-gray-300 mb-3 border-b border-gray-700 pb-2">使用此產品的帳號分佈</h5>
                                                    <div className="space-y-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                                                        {Array.from(product.accounts.values())
                                                            .sort((a: ProductAccountSummary, b: ProductAccountSummary) => b.cost - a.cost)
                                                            .map((acc: ProductAccountSummary) => {
                                                                const accPerc = (acc.cost / product.totalCost) * 100;
                                                                return (
                                                                    <div key={acc.accountId} className="flex flex-col mb-2">
                                                                        <div className="flex justify-between text-xs mb-1">
                                                                            <span className="text-gray-400">{acc.accountName} <span className="text-gray-600">({acc.accountId})</span></span>
                                                                            <span className="text-white font-medium">${formatNumber(acc.cost)}</span>
                                                                        </div>
                                                                        <div className="w-full bg-gray-900 rounded-full h-1">
                                                                            <div className="bg-green-500 h-1 rounded-full" style={{ width: `${accPerc}%` }}></div>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })
                                                        }
                                                    </div>
                                                </div>

                                                {/* 使用明細 */}
                                                <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 shadow-inner">
                                                    <h5 className="text-sm font-bold text-gray-300 mb-3 border-b border-gray-700 pb-2">產品使用明細彙總 (跨帳號)</h5>
                                                    <div className="overflow-x-auto max-h-64 overflow-y-auto custom-scrollbar">
                                                        <table className="w-full text-[11px] text-left">
                                                            <thead className="text-gray-500 uppercase sticky top-0 bg-gray-800">
                                                                <tr>
                                                                    <th className="pb-2">Usage Type / Item Description</th>
                                                                    <th className="pb-2 text-right">彙總用量</th>
                                                                    <th className="pb-2 text-right">彙總費用</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-gray-700">
                                                                {Array.from(product.details.values())
                                                                    .sort((a: ProductDetailSummary, b: ProductDetailSummary) => b.cost - a.cost)
                                                                    .map((detail: ProductDetailSummary, dIdx) => (
                                                                        <tr key={dIdx} className="hover:bg-white/5 transition-colors">
                                                                            <td className="py-2 pr-4">
                                                                                <div className="text-gray-300 font-medium">{detail.usageType}</div>
                                                                                <div className="text-gray-500 italic text-[10px] leading-tight">{detail.itemDescription}</div>
                                                                            </td>
                                                                            <td className="py-2 text-right text-gray-400">{formatNumber(detail.usage, 4)}</td>
                                                                            <td className="py-2 text-right text-blue-300 font-bold">${formatNumber(detail.cost)}</td>
                                                                        </tr>
                                                                    ))
                                                                }
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        );
                    })}
                </tbody>
            </table>
        </div>
      </Card>
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #1a202c;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #4a5568;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #718096;
        }
      `}</style>
    </div>
  );
};

export default ServiceAnalysisTab;
