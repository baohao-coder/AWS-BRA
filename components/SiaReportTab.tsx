import React, { useMemo, useState } from 'react';
import { BillingData, ServiceDetail } from '../types';
import Card from './common/Card';
import { exportToExcel } from '../services/excelUtils';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Bar, ComposedChart } from 'recharts';

// --- Helper Functions ---

const formatNumber = (value: number, decimals: number = 2) => {
    if (typeof value !== 'number' || isNaN(value)) return '0.00';
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
};

const formatCurrency = (value: number) => `$${formatNumber(value)}`;
const formatInteger = (value: number) => formatNumber(value, 0);

const isGenAiProduct = (productName: string) => {
    if (!productName) return false;
    const lower = productName.toLowerCase();
    const compact = lower.replace(/[\s\-_]+/g, '');
    return compact.includes('amazonq') || compact.includes('bedrock') || compact.includes('kiro');
};

// --- Helper Components ---

const StatusBadge: React.FC<{ status: 'achieved' | 'in-progress' | 'not-achieved' }> = ({ status }) => {
  switch (status) {
    case 'achieved':
      return <span className="px-2 py-1 text-xs font-semibold text-green-200 bg-green-700 rounded-full">已達成</span>;
    case 'in-progress':
       return <span className="px-2 py-1 text-xs font-semibold text-yellow-200 bg-yellow-700 rounded-full">進行中</span>;
    default:
      return <span className="px-2 py-1 text-xs font-semibold text-red-200 bg-red-700 rounded-full">未達成</span>;
  }
};

const DetailsSection: React.FC<{ title: string; data: ServiceDetail[]; onExport: () => void; }> = ({ title, data, onExport }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mt-6">
      <div className="flex justify-between items-center">
        <h4 className="text-lg font-semibold text-white">{title} ({data.length} 筆)</h4>
        <div className="flex items-center space-x-2">
            {data.length > 0 && (
                <button onClick={onExport} className="bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-3 rounded text-sm transition-colors">匯出 Excel</button>
            )}
            <button onClick={() => setIsOpen(!isOpen)} className="text-blue-400 hover:text-blue-300 text-sm font-medium">
                {isOpen ? '隱藏明細' : '顯示明細'}
            </button>
        </div>
      </div>
      {isOpen && data.length > 0 && (
        <div className="overflow-x-auto mt-4 max-h-96">
            <table className="w-full text-sm text-left text-gray-400">
                <thead className="text-xs text-gray-300 uppercase bg-gray-700 sticky top-0">
                <tr>
                    <th scope="col" className="px-4 py-3">Account ID</th>
                    <th scope="col" className="px-4 py-3">Account Name</th>
                    <th scope="col" className="px-4 py-3">Product Name</th>
                    <th scope="col" className="px-4 py-3">Usage Type</th>
                    <th scope="col" className="px-4 py-3">Item Description</th>
                    <th scope="col" className="px-4 py-3 text-right">Unit Price</th>
                    <th scope="col" className="px-4 py-3 text-right">Usages</th>
                    <th scope="col" className="px-4 py-3 text-right">Total Cost (USD)</th>
                    <th scope="col" className="px-4 py-3">Month</th>
                </tr>
                </thead>
                <tbody>
                {data.map((item, index) => (
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
       {isOpen && data.length === 0 && (
        <p className="mt-4 text-center text-gray-500">無符合條件的資料。</p>
       )}
    </div>
  );
};


// --- Main Analysis Logic ---

const useSiaAnalysis = (data: BillingData) => {
    const sortedData = useMemo(() => [...data].sort((a, b) => a.month.localeCompare(b.month)), [data]);
    
    const allDetails = useMemo(() => {
        const details: ServiceDetail[] = [];
        sortedData.forEach(monthData => {
            monthData.accounts.forEach(account => {
                account.services.forEach(service => {
                    details.push(...service.details);
                });
            });
        });
        return details;
    }, [sortedData]);
    
    const months = useMemo(() => sortedData.map(d => d.month), [sortedData]);

    const analysis = useMemo(() => {
        const analysisByMonth = new Map<string, any>();
        months.forEach(month => {
            analysisByMonth.set(month, {
                totalPayment: sortedData.find(d => d.month === month)?.totalAmount || 0,
                linuxEc2Cost: 0,
                totalEc2Usage: 0,
                gravitonUsage: 0,
                genAiCost: 0,
                rdsCost: 0,
            });
        });

        const USAGE_TYPE_EC2_KEYWORDS = ['heavyusage', 'instanceusage', 'nodeusage', 'boxusage', 'azusage', 'eks-auto'];
        const DESC_LINUX_KEYWORDS = ['linux', 'linux/unix', 'rhel'];
        
        allDetails.forEach(detail => {
            const monthData = analysisByMonth.get(detail.month);
            if (!monthData) return;

            const usageTypeLower = detail.usageType.toLowerCase();
            const descLower = detail.itemDescription.toLowerCase();
            const productLower = detail.productName.toLowerCase();
            
            // 1. Compute OS
            if (USAGE_TYPE_EC2_KEYWORDS.some(kw => usageTypeLower.includes(kw)) && DESC_LINUX_KEYWORDS.some(kw => descLower.includes(kw))) {
                monthData.linuxEc2Cost += detail.totalCost;
            }

            // 2. Graviton
            if (USAGE_TYPE_EC2_KEYWORDS.some(kw => usageTypeLower.includes(kw))) {
                monthData.totalEc2Usage += detail.usages;
                if (usageTypeLower.includes('g.')) {
                    monthData.gravitonUsage += detail.usages;
                }
            }
            
            // 3. Gen AI (Product Name 包含 "AmazonQ", "Bedrock", "Kiro")
            if (isGenAiProduct(detail.productName)) {
                monthData.genAiCost += detail.totalCost;
            }

            // 4. RDS
            if (productLower.includes('amazonrds') || productLower.includes('amazon rds')) {
                monthData.rdsCost += detail.totalCost;
            }
        });
        
        const monthlyResults = Array.from(analysisByMonth.entries()).map(([month, data]) => ({ 
            month, 
            ...data,
            gravitonPercentage: data.totalEc2Usage > 0 ? (data.gravitonUsage / data.totalEc2Usage) * 100 : 0,
            rdsPercentage: data.totalPayment > 0 ? (data.rdsCost / data.totalPayment) * 100 : 0,
        }));

        // Check consecutive months logic
        const checkConsecutive = (data: any[], key: string, threshold: number, count: number) => {
            if (data.length < count) return { achieved: false, progress: 0, required: count };
            let consecutiveCount = 0;
            let maxConsecutive = 0;
            for (let i = 0; i < data.length; i++) {
                if (data[i][key] >= threshold) {
                    consecutiveCount++;
                } else {
                    consecutiveCount = 0;
                }
                if (consecutiveCount >= count) {
                    return { achieved: true, progress: count, required: count };
                }
                maxConsecutive = Math.max(maxConsecutive, consecutiveCount);
            }
            return { achieved: false, progress: maxConsecutive, required: count };
        };

        const cumulativeTotal = monthlyResults.reduce((sum, item) => sum + item.totalPayment, 0);
        const cumulativeRds = monthlyResults.reduce((sum, item) => sum + item.rdsCost, 0);
        const cumulativeGenAiCost = monthlyResults.reduce((sum, item) => sum + item.genAiCost, 0);

        return {
            monthly: monthlyResults,
            cumulativeTotal,
            cumulativeRds,
            cumulativeGenAiCost,
            computeCheck1: checkConsecutive(monthlyResults, 'linuxEc2Cost', 220000, 3),
            computeCheck2: checkConsecutive(monthlyResults, 'linuxEc2Cost', 250000, 3),
            gravitonCheck1: checkConsecutive(monthlyResults, 'gravitonPercentage', 15, 3),
            gravitonCheck2: checkConsecutive(monthlyResults, 'gravitonPercentage', 25, 3),
        };
    }, [allDetails, months, sortedData]);

    const getFilteredDetails = (filterFn: (detail: ServiceDetail) => boolean) => useMemo(() => allDetails.filter(filterFn), [allDetails, filterFn]);

    return { analysis, getFilteredDetails };
};


// --- Main Component ---

const SiaReportTab: React.FC<{ data: BillingData }> = ({ data }) => {

    const { analysis, getFilteredDetails } = useSiaAnalysis(data);

    const computeDetails = getFilteredDetails(d => {
        const USAGE_TYPE_EC2_KEYWORDS = ['heavyusage', 'instanceusage', 'nodeusage', 'boxusage', 'azusage', 'eks-auto'];
        const DESC_LINUX_KEYWORDS = ['linux', 'linux/unix', 'rhel'];
        return USAGE_TYPE_EC2_KEYWORDS.some(kw => d.usageType.toLowerCase().includes(kw)) && DESC_LINUX_KEYWORDS.some(kw => d.itemDescription.toLowerCase().includes(kw));
    });

    const gravitonDetails = getFilteredDetails(d => {
        const USAGE_TYPE_EC2_KEYWORDS = ['heavyusage', 'instanceusage', 'nodeusage', 'boxusage', 'azusage', 'eks-auto'];
        return USAGE_TYPE_EC2_KEYWORDS.some(kw => d.usageType.toLowerCase().includes(kw)) && d.usageType.toLowerCase().includes('g.');
    });

    const genAiDetails = getFilteredDetails(d => isGenAiProduct(d.productName));

    const rdsDetails = getFilteredDetails(d => {
        const productLower = d.productName.toLowerCase();
        return productLower.includes('amazonrds') || productLower.includes('amazon rds');
    });
    
    const rdsCondition1Met = analysis.cumulativeTotal >= 2000000;
    const rdsCondition2Met = analysis.cumulativeTotal > 0 && (analysis.cumulativeRds / analysis.cumulativeTotal) >= 0.1;

    const handleExport = (details: ServiceDetail[], filename: string) => {
        const dataToExport = details.map(item => ({
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
        exportToExcel(dataToExport, filename);
    };

  return (
    <div className="space-y-8">
      <Card title="SIA 總覽">
        <div className="p-4 bg-gray-700 rounded-lg">
            <h4 className="text-lg font-semibold text-white">累計總支付金額 (Total Amount of Payment)</h4>
            <p className="text-3xl font-bold text-blue-400">{formatCurrency(analysis.cumulativeTotal)}</p>
            <p className="text-sm text-gray-400">此數據為所有已上傳帳單月份的加總。</p>
        </div>
      </Card>
      
      {/* 1. Compute Operating System Transformation Credits */}
      <Card title="1. Compute Operating System Transformation Credits">
        <div className="mb-4 text-sm text-gray-400">總計可得 Credits: <span className="font-bold text-white">$450,000</span></div>
        <div className="space-y-4">
            <div className="p-3 bg-gray-700/50 rounded-lg">
                <div className="flex justify-between items-center">
                    <p className="text-gray-300">連續3個月 Linux/RHEL EC2 月費達 <span className="font-bold text-white">$220,000</span> (可得 Credits: <span className="font-semibold text-green-400">$300,000</span>)</p>
                    <StatusBadge status={analysis.computeCheck1.achieved ? 'achieved' : analysis.computeCheck1.progress > 0 ? 'in-progress' : 'not-achieved'} />
                </div>
                <p className="text-xs text-gray-400">目前進度: 連續 {analysis.computeCheck1.progress} / {analysis.computeCheck1.required} 個月</p>
                {analysis.computeCheck1.achieved && (
                    <p className="mt-2 text-sm font-semibold text-green-400">已達成 Credits: <span className="font-bold">{formatCurrency(300000)}</span></p>
                )}
            </div>
             <div className="p-3 bg-gray-700/50 rounded-lg">
                <div className="flex justify-between items-center">
                    <p className="text-gray-300">連續3個月 Linux/RHEL EC2 月費達 <span className="font-bold text-white">$250,000</span> (可得 Credits: <span className="font-semibold text-green-400">$150,000</span>)</p>
                    <StatusBadge status={analysis.computeCheck2.achieved ? 'achieved' : analysis.computeCheck2.progress > 0 ? 'in-progress' : 'not-achieved'} />
                </div>
                 <p className="text-xs text-gray-400">目前進度: 連續 {analysis.computeCheck2.progress} / {analysis.computeCheck2.required} 個月</p>
                 {analysis.computeCheck2.achieved && (
                    <p className="mt-2 text-sm font-semibold text-green-400">已達成 Credits: <span className="font-bold">{formatCurrency(150000)}</span></p>
                )}
            </div>
        </div>
        <div className="mt-6">
            <h4 className="text-lg font-semibold text-white mb-2">月度EC2費用趨勢 (Linux/Red Hat)</h4>
            <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={analysis.monthly} margin={{ top: 5, right: 30, left: 50, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#4a5568" />
                        <XAxis dataKey="month" stroke="#a0aec0" />
                        <YAxis stroke="#a0aec0" tickFormatter={(value) => formatCurrency(Number(value))} />
                        <Tooltip contentStyle={{ backgroundColor: '#2d3748', border: 'none', borderRadius: '0.5rem' }} labelStyle={{ color: '#e2e8f0' }} formatter={(value: number) => [formatCurrency(value), '費用']} />
                        <Legend />
                        <Line type="monotone" dataKey="linuxEc2Cost" name="Linux/RHEL EC2 Cost" stroke="#8884d8" />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
        <DetailsSection title="符合條件的服務列表" data={computeDetails} onExport={() => handleExport(computeDetails, 'sia_compute_os_details')} />
      </Card>

      {/* 2. Graviton Adoption Credits */}
      <Card title="2. Graviton Adoption Credits">
         <div className="mb-4 text-sm text-gray-400">總計可得 Credits: <span className="font-bold text-white">$300,000</span></div>
         <div className="space-y-4">
            <div className="p-3 bg-gray-700/50 rounded-lg">
                <div className="flex justify-between items-center">
                    <p className="text-gray-300">連續3個月 Graviton EC2 使用率達 <span className="font-bold text-white">15%</span> (可得 Credits: <span className="font-semibold text-green-400">$150,000</span>)</p>
                    <StatusBadge status={analysis.gravitonCheck1.achieved ? 'achieved' : analysis.gravitonCheck1.progress > 0 ? 'in-progress' : 'not-achieved'} />
                </div>
                 <p className="text-xs text-gray-400">目前進度: 連續 {analysis.gravitonCheck1.progress} / {analysis.gravitonCheck1.required} 個月</p>
                 {analysis.gravitonCheck1.achieved && (
                    <p className="mt-2 text-sm font-semibold text-green-400">已達成 Credits: <span className="font-bold">{formatCurrency(150000)}</span></p>
                )}
            </div>
             <div className="p-3 bg-gray-700/50 rounded-lg">
                <div className="flex justify-between items-center">
                    <p className="text-gray-300">連續3個月 Graviton EC2 使用率達 <span className="font-bold text-white">25%</span> (可得 Credits: <span className="font-semibold text-green-400">$150,000</span>)</p>
                    <StatusBadge status={analysis.gravitonCheck2.achieved ? 'achieved' : analysis.gravitonCheck2.progress > 0 ? 'in-progress' : 'not-achieved'} />
                </div>
                <p className="text-xs text-gray-400">目前進度: 連續 {analysis.gravitonCheck2.progress} / {analysis.gravitonCheck2.required} 個月</p>
                {analysis.gravitonCheck2.achieved && (
                    <p className="mt-2 text-sm font-semibold text-green-400">已達成 Credits: <span className="font-bold">{formatCurrency(150000)}</span></p>
                )}
            </div>
        </div>
        <div className="mt-6">
            <h4 className="text-lg font-semibold text-white mb-2">月度Graviton使用率趨勢</h4>
             <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={analysis.monthly} margin={{ top: 5, right: 30, left: 60, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#4a5568" />
                        <XAxis dataKey="month" stroke="#a0aec0" />
                        <YAxis yAxisId="left" stroke="#8884d8" label={{ value: 'Usage Hours', angle: -90, position: 'insideLeft', fill: '#8884d8' }} tickFormatter={(value) => formatInteger(Number(value))} />
                        <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" label={{ value: 'Percentage (%)', angle: 90, position: 'insideRight', fill: '#82ca9d' }} />
                        <Tooltip contentStyle={{ backgroundColor: '#2d3748', border: 'none', borderRadius: '0.5rem' }} labelStyle={{ color: '#e2e8f0' }} formatter={(value: number, name: string) => [name.includes('Percentage') ? `${formatNumber(value)}%` : formatInteger(value), name]} />
                        <Legend />
                        <Bar yAxisId="left" dataKey="totalEc2Usage" name="Total EC2 Usage" fill="#4c51bf" />
                        <Bar yAxisId="left" dataKey="gravitonUsage" name="Graviton Usage" fill="#9f7aea" />
                        <Line yAxisId="right" type="monotone" dataKey="gravitonPercentage" name="Graviton Percentage" stroke="#82ca9d" />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
        <DetailsSection title="符合條件的服務列表 (Graviton)" data={gravitonDetails} onExport={() => handleExport(gravitonDetails, 'sia_graviton_details')} />
      </Card>
      
      {/* 3. Generative AI Services Adoption Credits */}
      <Card title="3. Generative AI Services Adoption Credits">
        <div className="mb-4 text-sm text-gray-400">總計可得 Credits: <span className="font-bold text-white">$250,000</span></div>
        <div className="space-y-2 text-sm text-gray-300">
            <p>• <span className="font-semibold text-white">Contract Year 1:</span> 產生費用可獲 50% Credit (上限 <span className="font-semibold text-green-400">$50,000</span>)</p>
            <p>• <span className="font-semibold text-white">Contract Year 2:</span> 產生費用可獲 50% Credit (上限 <span className="font-semibold text-green-400">$100,000</span>)</p>
            <p>• <span className="font-semibold text-white">Contract Year 3 (前10個月):</span> 產生費用可獲 50% Credit (上限 <span className="font-semibold text-green-400">$100,000</span>)</p>
            <p className="text-xs text-gray-400 mt-1">• 判定條件：從 Product Name 搜尋關鍵字，包含 "AmazonQ"、"Bedrock"、"Kiro"。</p>
        </div>
        {analysis.cumulativeGenAiCost > 0 && (
            <div className="mt-4 p-3 bg-green-900/50 border border-green-500/50 text-green-300 rounded-md">
                <p className="font-bold text-white">可得 Credits (依目前帳單計算)</p>
                <p>目前 Gen AI 總花費: {formatCurrency(analysis.cumulativeGenAiCost)}</p>
                <p>預估可得 Credits (50%): <span className="text-lg font-bold">{formatCurrency(analysis.cumulativeGenAiCost * 0.5)}</span></p>
                <p className="text-xs text-green-400 mt-1">注意: 最終金額需依合約年度上限為準。</p>
            </div>
        )}
        <div className="mt-6">
            <h4 className="text-lg font-semibold text-white mb-2">月度Generative AI服務費用趨勢</h4>
             <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={analysis.monthly} margin={{ top: 5, right: 30, left: 50, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#4a5568" />
                        <XAxis dataKey="month" stroke="#a0aec0" />
                        <YAxis stroke="#a0aec0" tickFormatter={(value) => formatCurrency(Number(value))} />
                        <Tooltip contentStyle={{ backgroundColor: '#2d3748', border: 'none', borderRadius: '0.5rem' }} labelStyle={{ color: '#e2e8f0' }} formatter={(value: number) => [formatCurrency(value), '費用']} />
                        <Legend />
                        <Line type="monotone" dataKey="genAiCost" name="Generative AI Cost" stroke="#38b2ac" />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
        <DetailsSection title="符合條件的服務列表" data={genAiDetails} onExport={() => handleExport(genAiDetails, 'sia_gen_ai_details')} />
      </Card>

      {/* 4. RDS Credits */}
      <Card title="4. RDS Credits">
        <div className="mb-4 text-sm text-gray-400">總計可得 Credits: <span className="font-bold text-white">$800,000</span> (需同時滿足以下兩項條件)</div>
        <div className="space-y-4">
            <div className="p-3 bg-gray-700/50 rounded-lg">
                <div className="flex justify-between items-center">
                    <p className="text-gray-300">第一年使用量 (依上傳資料期間計算) 達 <span className="font-bold text-white">$2,000,000</span></p>
                    <StatusBadge status={rdsCondition1Met ? 'achieved' : 'not-achieved'} />
                </div>
                 <p className="text-xs text-gray-400">目前累計: {formatCurrency(analysis.cumulativeTotal)}</p>
            </div>
             <div className="p-3 bg-gray-700/50 rounded-lg">
                <div className="flex justify-between items-center">
                    <p className="text-gray-300">第一年 RDS 使用金額佔比達 <span className="font-bold text-white">10%</span></p>
                    <StatusBadge status={rdsCondition2Met ? 'achieved' : 'not-achieved'} />
                </div>
                <p className="text-xs text-gray-400">目前佔比: {formatNumber(analysis.cumulativeTotal > 0 ? (analysis.cumulativeRds / analysis.cumulativeTotal) * 100 : 0)}%</p>
            </div>
        </div>
        {rdsCondition1Met && rdsCondition2Met && (
            <div className="mt-4 p-4 bg-green-900/50 border border-green-500/50 text-green-300 rounded-lg text-center">
                <h4 className="text-lg font-bold text-white">恭喜！已達成所有條件！</h4>
                <p className="text-2xl font-bold text-green-400 mt-2">可得 Credits: {formatCurrency(800000)}</p>
            </div>
        )}
        <div className="mt-6">
            <h4 className="text-lg font-semibold text-white mb-2">月度RDS費用與佔比趨勢</h4>
             <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                     <ComposedChart data={analysis.monthly} margin={{ top: 5, right: 30, left: 50, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#4a5568" />
                        <XAxis dataKey="month" stroke="#a0aec0" />
                        <YAxis yAxisId="left" stroke="#ed8936" label={{ value: 'Cost (USD)', angle: -90, position: 'insideLeft', fill: '#ed8936' }} tickFormatter={(value) => formatCurrency(Number(value))} />
                        <YAxis yAxisId="right" orientation="right" stroke="#4299e1" label={{ value: 'Percentage (%)', angle: 90, position: 'insideRight', fill: '#4299e1' }} />
                        <Tooltip contentStyle={{ backgroundColor: '#2d3748', border: 'none', borderRadius: '0.5rem' }} labelStyle={{ color: '#e2e8f0' }} formatter={(value: number, name: string) => [name.includes('Percentage') ? `${formatNumber(value)}%` : formatCurrency(value), name]} />
                        <Legend />
                        <Bar yAxisId="left" dataKey="totalPayment" name="Total Payment" fill="#718096" />
                        <Bar yAxisId="left" dataKey="rdsCost" name="RDS Cost" fill="#ed8936" />
                        <Line yAxisId="right" type="monotone" dataKey="rdsPercentage" name="RDS Percentage" stroke="#4299e1" />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
        <DetailsSection title="符合條件的服務列表 (RDS)" data={rdsDetails} onExport={() => handleExport(rdsDetails, 'sia_rds_details')} />
      </Card>
    </div>
  );
};

export default SiaReportTab;