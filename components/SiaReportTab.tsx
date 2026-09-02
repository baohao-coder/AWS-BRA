import React, { useMemo, useState } from 'react';
import { BillingData, ServiceDetail } from '../types';
import Card from './common/Card';
import { exportToExcel } from '../services/excelUtils';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer, 
  Bar, 
  ComposedChart,
  ReferenceLine 
} from 'recharts';

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

// Check if a service/product is GenAI related (Bedrock, Amazon Q, Kiro, etc.)
const isGenAiProduct = (productName: string, usageType: string = '', itemDescription: string = '') => {
  if (!productName && !usageType && !itemDescription) return false;
  const combined = `${productName} ${usageType} ${itemDescription}`.toLowerCase().replace(/[\s\-_]+/g, '');
  return combined.includes('amazonq') || 
         combined.includes('bedrock') || 
         combined.includes('kiro') || 
         combined.includes('generativeai') ||
         combined.includes('claud') ||
         combined.includes('titan');
};

// Check if an EC2 item is Linux / Red Hat
const isLinuxOrRhelEc2 = (productName: string, usageType: string, itemDescription: string) => {
  const productLower = (productName || '').toLowerCase();
  const usageLower = (usageType || '').toLowerCase();
  const descLower = (itemDescription || '').toLowerCase();

  const isEc2 = productLower.includes('elastic compute cloud') || 
                productLower.includes('amazon ec2') || 
                productLower.includes('amazonec2');
  
  const isInstanceUsage = ['heavyusage', 'instanceusage', 'nodeusage', 'boxusage', 'azusage', 'eks-auto', 'running-hour']
    .some(kw => usageLower.includes(kw));

  // Must be Linux or Red Hat (exclude pure Windows if specified)
  const isLinuxOrRhel = descLower.includes('linux') || 
                        descLower.includes('red hat') || 
                        descLower.includes('rhel') || 
                        descLower.includes('unix') ||
                        (!descLower.includes('windows') && !descLower.includes('sql server'));

  return (isEc2 || isInstanceUsage) && isLinuxOrRhel;
};

// Check if an EC2 item is Graviton powered
const isGravitonUsage = (productName: string, usageType: string, itemDescription: string) => {
  const usageLower = (usageType || '').toLowerCase();
  const descLower = (itemDescription || '').toLowerCase();
  
  // Instance families with 'g' (e.g. c6g, c7g, m6g, r6g, t4g, etc.)
  const isGravitonInstance = /([a-z]\d+g[a-z]*\.)|(graviton)|(\bgraviton\b)/i.test(usageLower) || 
                             /graviton/i.test(descLower);
  
  return isGravitonInstance;
};

// Check if a service item is RDS (Amazon Relational Database Service)
// 4-3: 從 "Product Name" 找尋關鍵字包含 "AmazonRDS"
const isRdsProduct = (productName: string, usageType: string = '', itemDescription: string = '') => {
  const pRaw = (productName || '').trim();
  const pLower = pRaw.toLowerCase().replace(/[\s\-_]+/g, '');
  
  return pLower.includes('amazonrds') || 
         pLower.includes('relationaldatabaseservice') ||
         pRaw === 'Amazon RDS' ||
         pRaw === 'AmazonRDS' ||
         pLower.startsWith('rds');
};

// --- Helper Components ---

const StatusBadge: React.FC<{ status: 'achieved' | 'in-progress' | 'not-achieved' }> = ({ status }) => {
  switch (status) {
    case 'achieved':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-emerald-300 bg-emerald-950/80 border border-emerald-500/40 rounded-full shadow-sm">
          <span>✓</span>
          <span>已達成</span>
        </span>
      );
    case 'in-progress':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-amber-300 bg-amber-950/80 border border-amber-500/40 rounded-full shadow-sm">
          <span>⏳</span>
          <span>進行中</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-rose-300 bg-rose-950/80 border border-rose-500/40 rounded-full">
          <span>✕</span>
          <span>未達成</span>
        </span>
      );
  }
};

const DetailsSection: React.FC<{ title: string; data: ServiceDetail[]; onExport: () => void }> = ({ title, data, onExport }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mt-6 border-t border-gray-700/60 pt-4">
      <div className="flex justify-between items-center">
        <h4 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
          <span>📋</span>
          <span>{title}</span>
          <span className="text-xs font-mono text-gray-400 bg-gray-700 px-2 py-0.5 rounded">
            {data.length} 筆明細
          </span>
        </h4>
        <div className="flex items-center space-x-2">
          {data.length > 0 && (
            <button 
              onClick={onExport} 
              className="bg-emerald-700 hover:bg-emerald-600 text-white font-semibold py-1 px-3 rounded text-xs transition-colors flex items-center gap-1 shadow"
            >
              <span>📥</span>
              <span>匯出 Excel</span>
            </button>
          )}
          <button 
            onClick={() => setIsOpen(!isOpen)} 
            className="text-indigo-400 hover:text-indigo-300 text-xs font-medium bg-gray-800 hover:bg-gray-700 px-2.5 py-1 rounded transition"
          >
            {isOpen ? '收合明細 ▲' : '展開明細 ▼'}
          </button>
        </div>
      </div>

      {isOpen && data.length > 0 && (
        <div className="overflow-x-auto mt-3 max-h-96 rounded-lg border border-gray-700">
          <table className="w-full text-xs text-left text-gray-400">
            <thead className="text-xs text-gray-300 uppercase bg-gray-800 sticky top-0 border-b border-gray-700">
              <tr>
                <th scope="col" className="px-3 py-2.5">月份</th>
                <th scope="col" className="px-3 py-2.5">Account ID</th>
                <th scope="col" className="px-3 py-2.5">Account Name</th>
                <th scope="col" className="px-3 py-2.5">Product Name</th>
                <th scope="col" className="px-3 py-2.5">Usage Type</th>
                <th scope="col" className="px-3 py-2.5">Item Description</th>
                <th scope="col" className="px-3 py-2.5 text-right">Unit Price</th>
                <th scope="col" className="px-3 py-2.5 text-right">Usages</th>
                <th scope="col" className="px-3 py-2.5 text-right text-emerald-400">Total Cost (USD)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 font-mono">
              {data.map((item, index) => (
                <tr key={index} className="bg-gray-900/70 hover:bg-gray-800/80 transition-colors">
                  <td className="px-3 py-1.5 whitespace-nowrap text-gray-300">{item.month}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{item.accountId}</td>
                  <td className="px-3 py-1.5 font-sans truncate max-w-[150px]" title={item.accountName}>{item.accountName}</td>
                  <td className="px-3 py-1.5 font-sans text-white">{item.productName}</td>
                  <td className="px-3 py-1.5 text-[11px] text-gray-300">{item.usageType}</td>
                  <td className="px-3 py-1.5 font-sans text-gray-400 truncate max-w-[200px]" title={item.itemDescription}>{item.itemDescription}</td>
                  <td className="px-3 py-1.5 text-right">{item.unitPrice.toFixed(6)}</td>
                  <td className="px-3 py-1.5 text-right">{item.usages.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right font-bold text-white">${item.totalCost.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {isOpen && data.length === 0 && (
        <p className="mt-3 text-center text-gray-500 text-xs py-4">無符合條件的資料。</p>
      )}
    </div>
  );
};


// --- Main Analysis Hook ---

const useSiaAnalysis = (data: BillingData) => {
  const sortedData = useMemo(() => [...data].sort((a, b) => a.month.localeCompare(b.month)), [data]);
  
  const allDetails = useMemo(() => {
    const details: ServiceDetail[] = [];
    sortedData.forEach(monthData => {
      monthData.accounts.forEach(account => {
        // Exclude excluded master account if present
        if (account.accountId === '927845210633') return;
        account.services.forEach(service => {
          if (service.details && service.details.length > 0) {
            details.push(...service.details);
          }
        });
      });
    });
    return details;
  }, [sortedData]);
  
  const months = useMemo(() => sortedData.map(d => d.month), [sortedData]);

  const analysis = useMemo(() => {
    const analysisByMonth = new Map<string, {
      totalPayment: number;
      linuxEc2Cost: number;
      totalEc2Usage: number;
      gravitonUsage: number;
      genAiCost: number;
      rdsCost: number;
    }>();

    months.forEach(month => {
      const monthObj = sortedData.find(d => d.month === month);
      // Clean total payment excluding 927845210633
      const validAccounts = monthObj?.accounts.filter(a => a.accountId !== '927845210633') || [];
      const totalPayment = validAccounts.reduce((sum, a) => sum + (a.totalAmount || 0), 0);

      analysisByMonth.set(month, {
        totalPayment,
        linuxEc2Cost: 0,
        totalEc2Usage: 0,
        gravitonUsage: 0,
        genAiCost: 0,
        rdsCost: 0,
      });
    });

    const USAGE_TYPE_EC2_KEYWORDS = ['heavyusage', 'instanceusage', 'nodeusage', 'boxusage', 'azusage', 'eks-auto', 'running-hour'];
    
    allDetails.forEach(detail => {
      const monthData = analysisByMonth.get(detail.month);
      if (!monthData) return;

      const usageTypeLower = (detail.usageType || '').toLowerCase();
      const descLower = (detail.itemDescription || '').toLowerCase();
      const productLower = (detail.productName || '').toLowerCase();
      
      const isEc2 = productLower.includes('elastic compute cloud') || 
                    productLower.includes('amazon ec2') || 
                    productLower.includes('amazonec2') ||
                    USAGE_TYPE_EC2_KEYWORDS.some(kw => usageTypeLower.includes(kw));

      // 1. Table 1: Compute OS Transformation (Linux and Red Hat only on Amazon EC2)
      if (isLinuxOrRhelEc2(detail.productName, detail.usageType, detail.itemDescription)) {
        monthData.linuxEc2Cost += detail.totalCost;
      }

      // 2. Table 2: Graviton Adoption (Normalized Instance Hours / Instance Usage Hours on EC2)
      if (isEc2 && USAGE_TYPE_EC2_KEYWORDS.some(kw => usageTypeLower.includes(kw))) {
        monthData.totalEc2Usage += detail.usages;
        if (isGravitonUsage(detail.productName, detail.usageType, detail.itemDescription)) {
          monthData.gravitonUsage += detail.usages;
        }
      }
      
      // 3. Table 3: Generative AI Adoption (Amazon Bedrock and/or Amazon Q)
      if (isGenAiProduct(detail.productName, detail.usageType, detail.itemDescription)) {
        monthData.genAiCost += detail.totalCost;
      }

      // 4. Table 4: RDS Credits (Amazon Relational Database Service - AmazonRDS)
      if (isRdsProduct(detail.productName, detail.usageType, detail.itemDescription)) {
        monthData.rdsCost += detail.totalCost;
      }
    });
    
    const monthlyResults = Array.from(analysisByMonth.entries()).map(([month, d]) => ({ 
      month, 
      ...d,
      gravitonPercentage: d.totalEc2Usage > 0 ? (d.gravitonUsage / d.totalEc2Usage) * 100 : 0,
      rdsPercentage: d.totalPayment > 0 ? (d.rdsCost / d.totalPayment) * 100 : 0,
    }));

    // Check consecutive months logic for a specific window
    const checkConsecutiveInWindow = (
      dataList: typeof monthlyResults, 
      key: 'linuxEc2Cost' | 'gravitonPercentage', 
      threshold: number, 
      count: number,
      startMonth?: string,
      endMonth?: string
    ) => {
      const filtered = dataList.filter(item => {
        if (startMonth && item.month < startMonth) return false;
        if (endMonth && item.month > endMonth) return false;
        return true;
      });

      if (filtered.length === 0) {
        return { achieved: false, progress: 0, required: count, currentConsecutive: 0, totalMonthsInWindow: 0, qualifyingMonths: [] as string[] };
      }

      let consecutiveCount = 0;
      let maxConsecutive = 0;
      let isAchieved = false;
      const qualifyingMonths: string[] = [];

      for (let i = 0; i < filtered.length; i++) {
        const val = filtered[i][key];
        if (val >= threshold) {
          consecutiveCount++;
          qualifyingMonths.push(filtered[i].month);
        } else {
          consecutiveCount = 0;
        }
        if (consecutiveCount >= count) {
          isAchieved = true;
        }
        maxConsecutive = Math.max(maxConsecutive, consecutiveCount);
      }

      return { 
        achieved: isAchieved, 
        progress: Math.min(maxConsecutive, count), 
        required: count,
        currentConsecutive: consecutiveCount,
        totalMonthsInWindow: filtered.length,
        qualifyingMonths
      };
    };

    // Table 1: Compute OS Checks
    // Clause 1: First 24 months (2025-07 to 2027-06), consecutive 3 months >= $220,000 -> $300,000
    const computeCheck1 = checkConsecutiveInWindow(monthlyResults, 'linuxEc2Cost', 220000, 3, '2025-07', '2027-06');
    // Clause 2: Month 25 to 34 (2027-07 to 2028-04), consecutive 3 months >= $250,000 -> $150,000
    const computeCheck2 = checkConsecutiveInWindow(monthlyResults, 'linuxEc2Cost', 250000, 3, '2027-07', '2028-04');

    // Table 2: Graviton Checks
    // Clause 1: Contract Year 1-2 (2025-07 to 2027-06), consecutive 3 months >= 15% -> $150,000
    const gravitonCheck1 = checkConsecutiveInWindow(monthlyResults, 'gravitonPercentage', 15, 3, '2025-07', '2027-06');
    // Clause 2: Contract Year 3 (2025-07 to 2028-04), consecutive 3 months >= 25% -> $150,000
    const gravitonCheck2 = checkConsecutiveInWindow(monthlyResults, 'gravitonPercentage', 25, 3, '2025-07', '2028-04');

    // Table 3: GenAI Calculations
    // Year 1 (Month 1-12: 2025-07 to 2026-06): 50% of Commitment-Eligible Fees, cap $50,000
    const genAiYear1Months = monthlyResults.filter(m => m.month >= '2025-07' && m.month <= '2026-06');
    const genAiYear1Cost = genAiYear1Months.reduce((sum, m) => sum + m.genAiCost, 0);
    const genAiYear1Credit = Math.min(genAiYear1Cost * 0.5, 50000);

    // Year 2 (Month 13-24: 2026-07 to 2027-06): 50% of Commitment-Eligible Fees, cap $100,000
    const genAiYear2Months = monthlyResults.filter(m => m.month >= '2026-07' && m.month <= '2027-06');
    const genAiYear2Cost = genAiYear2Months.reduce((sum, m) => sum + m.genAiCost, 0);
    const genAiYear2Credit = Math.min(genAiYear2Cost * 0.5, 100000);

    const cumulativeTotal = monthlyResults.reduce((sum, item) => sum + item.totalPayment, 0);
    const cumulativeGenAiCost = monthlyResults.reduce((sum, item) => sum + item.genAiCost, 0);
    const cumulativeRdsCost = monthlyResults.reduce((sum, item) => sum + item.rdsCost, 0);
    const totalGenAiCredit = genAiYear1Credit + genAiYear2Credit;

    // 4. Table 4: RDS Credits Calculations
    // 4-1: 第一年 (2025-07 ~ 2026-06) 使用量必須達到 $2,000,000 美元 (含) 以上（不含營業稅）
    // 4-2: 第一年使用量中，資料庫服務 (AmazonRDS) 使用金額佔比須達 10% 以上
    const year1Months = monthlyResults.filter(m => m.month >= '2025-07' && m.month <= '2026-06');
    const rdsYear1TotalSpend = year1Months.reduce((sum, m) => sum + m.totalPayment, 0);
    const rdsYear1RdsSpend = year1Months.reduce((sum, m) => sum + m.rdsCost, 0);
    const rdsYear1Ratio = rdsYear1TotalSpend > 0 ? (rdsYear1RdsSpend / rdsYear1TotalSpend) * 100 : 0;
    
    const rdsCondition1Achieved = rdsYear1TotalSpend >= 2000000;
    const rdsCondition2Achieved = rdsYear1Ratio >= 10;
    const rdsFullyAchieved = rdsCondition1Achieved && rdsCondition2Achieved;
    const rdsCreditEarned = rdsFullyAchieved ? 800000 : 0;

    // Total SIA Potential and Achieved Calculation
    // Total Cap: $450k (OS) + $300k (Graviton) + $150k (GenAI) + $800k (RDS) = $1,700,000
    let earnedCreditsTotal = 0;
    if (computeCheck1.achieved) earnedCreditsTotal += 300000;
    if (computeCheck2.achieved) earnedCreditsTotal += 150000;
    if (gravitonCheck1.achieved) earnedCreditsTotal += 150000;
    if (gravitonCheck2.achieved) earnedCreditsTotal += 150000;
    earnedCreditsTotal += totalGenAiCredit;
    earnedCreditsTotal += rdsCreditEarned;

    return {
      monthly: monthlyResults,
      cumulativeTotal,
      cumulativeGenAiCost,
      cumulativeRdsCost,
      computeCheck1,
      computeCheck2,
      gravitonCheck1,
      gravitonCheck2,
      genAiYear1Cost,
      genAiYear1Credit,
      genAiYear2Cost,
      genAiYear2Credit,
      totalGenAiCredit,
      rdsYear1TotalSpend,
      rdsYear1RdsSpend,
      rdsYear1Ratio,
      rdsCondition1Achieved,
      rdsCondition2Achieved,
      rdsFullyAchieved,
      rdsCreditEarned,
      earnedCreditsTotal,
    };
  }, [allDetails, months, sortedData]);

  const getFilteredDetails = (filterFn: (detail: ServiceDetail) => boolean) => useMemo(() => allDetails.filter(filterFn), [allDetails, filterFn]);

  return { analysis, getFilteredDetails };
};


// --- Main Component ---

const SiaReportTab: React.FC<{ data: BillingData }> = ({ data }) => {
  const { analysis, getFilteredDetails } = useSiaAnalysis(data);

  // Filtered lists for details section
  const computeDetails = getFilteredDetails(d => isLinuxOrRhelEc2(d.productName, d.usageType, d.itemDescription));
  const gravitonDetails = getFilteredDetails(d => isGravitonUsage(d.productName, d.usageType, d.itemDescription));
  const genAiDetails = getFilteredDetails(d => isGenAiProduct(d.productName, d.usageType, d.itemDescription));
  const rdsDetails = getFilteredDetails(d => isRdsProduct(d.productName, d.usageType, d.itemDescription));

  const handleExport = (details: ServiceDetail[], filename: string) => {
    const dataToExport = details.map(item => ({
      '月份': item.month,
      'Account ID': item.accountId,
      'Account Name': item.accountName,
      '產品名稱': item.productName,
      'Usage Type': item.usageType,
      '項目描述': item.itemDescription,
      '單價': item.unitPrice,
      '使用量 (Usages)': item.usages,
      '費用 Total Cost (USD)': item.totalCost,
    }));
    exportToExcel(dataToExport, filename);
  };

  return (
    <div className="space-y-8 font-sans">
      {/* SIA Executive Summary Dashboard */}
      <Card title="SIA 專案投資協議總覽 (Strategic Investment Agreement Overview)">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="p-4 bg-gradient-to-br from-indigo-900/60 to-gray-800 rounded-xl border border-indigo-500/30">
            <span className="text-xs font-semibold text-indigo-300 uppercase tracking-wider block mb-1">
              SIA 總回饋金額上限
            </span>
            <p className="text-3xl font-extrabold text-white font-mono">$1,700,000</p>
            <p className="text-xs text-indigo-200/80 mt-1.5">包含四大核心轉型與 RDS 投資方案總額</p>
          </div>

          <div className="p-4 bg-gradient-to-br from-emerald-900/60 to-gray-800 rounded-xl border border-emerald-500/30">
            <span className="text-xs font-semibold text-emerald-300 uppercase tracking-wider block mb-1">
              目前已達成 / 預估獲得
            </span>
            <p className="text-3xl font-extrabold text-emerald-400 font-mono">
              {formatCurrency(analysis.earnedCreditsTotal)}
            </p>
            <p className="text-xs text-emerald-200/80 mt-1.5">
              達成率: {formatNumber((analysis.earnedCreditsTotal / 1700000) * 100, 1)}%
            </p>
          </div>

          <div className="p-4 bg-gradient-to-br from-purple-900/60 to-gray-800 rounded-xl border border-purple-500/30">
            <span className="text-xs font-semibold text-purple-300 uppercase tracking-wider block mb-1">
              SIA 合約總有效期間
            </span>
            <p className="text-xl font-bold text-white font-mono mt-1">2025/07 - 2028/04</p>
            <p className="text-xs text-purple-200/80 mt-1.5">共 34 個月 (前24月 / 第25-34月分段)</p>
          </div>

          <div className="p-4 bg-gradient-to-br from-sky-900/60 to-gray-800 rounded-xl border border-sky-500/30">
            <span className="text-xs font-semibold text-sky-300 uppercase tracking-wider block mb-1">
              目前已上傳帳單累計花費
            </span>
            <p className="text-2xl font-bold text-white font-mono mt-1">
              {formatCurrency(analysis.cumulativeTotal)}
            </p>
            <p className="text-xs text-sky-200/80 mt-1.5">共 {analysis.monthly.length} 個月實際帳單記錄</p>
          </div>
        </div>

        {/* 條款對照與驗證摘要表 (SIA Terms Matrix) */}
        <div className="overflow-x-auto rounded-xl border border-gray-700/80 bg-gray-900/60">
          <table className="w-full text-xs text-left text-gray-300">
            <thead className="bg-gray-800 text-gray-200 uppercase font-semibold border-b border-gray-700">
              <tr>
                <th className="px-3.5 py-3 text-indigo-300">投資類別</th>
                <th className="px-3.5 py-3">英文條件說明 (English Terms)</th>
                <th className="px-3.5 py-3">中文條件說明 (Criteria)</th>
                <th className="px-3.5 py-3 text-center whitespace-nowrap">驗證期間</th>
                <th className="px-3.5 py-3 text-right text-emerald-400 whitespace-nowrap">回饋金額 (USD)</th>
                <th className="px-3.5 py-3 text-center whitespace-nowrap">達成狀態</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/60">
              {/* Table 1 - Row 1 */}
              <tr className="hover:bg-gray-800/50 transition">
                <td className="px-3.5 py-3 font-bold text-indigo-400 whitespace-nowrap" rowSpan={2}>
                  Table 1: Compute OS<br/>
                  <span className="text-[11px] text-gray-400 font-normal">作業系統轉換</span>
                </td>
                <td className="px-3.5 py-3 text-gray-300 max-w-xs leading-relaxed">
                  End customer incurs Commitment-Eligible Fees on Amazon EC2, running on Linux and Red Hat operating systems only, of at least $220,000 per month, for 3 consecutive months, during the first 24 months of the SIA Term.
                </td>
                <td className="px-3.5 py-3 text-gray-200 space-y-0.5">
                  <div>1. 前 24 個月內</div>
                  <div>2. 連續 3 個月</div>
                  <div>3. 使用 Linux 和 Red Hat 於 EC2</div>
                  <div className="font-semibold text-white">4. 每月至少 $220,000 美元 (220k)</div>
                </td>
                <td className="px-3.5 py-3 text-center font-mono whitespace-nowrap text-gray-300">
                  2025/07/01 - 2027/06/30
                </td>
                <td className="px-3.5 py-3 text-right font-mono font-bold text-emerald-400 whitespace-nowrap">
                  $300,000
                </td>
                <td className="px-3.5 py-3 text-center whitespace-nowrap">
                  <StatusBadge status={analysis.computeCheck1.achieved ? 'achieved' : analysis.computeCheck1.progress > 0 ? 'in-progress' : 'not-achieved'} />
                </td>
              </tr>

              {/* Table 1 - Row 2 */}
              <tr className="hover:bg-gray-800/50 transition bg-gray-900/30">
                <td className="px-3.5 py-3 text-gray-300 max-w-xs leading-relaxed">
                  End Customer incurs Commitment-Eligible on Amazon EC2, running on Linux and Red Hat operating systems only, of at least $250,000 per month, for 3 consecutive months, during the 25th to 34th month of the SIA Term.
                </td>
                <td className="px-3.5 py-3 text-gray-200 space-y-0.5">
                  <div>1. 第 25 至 34 個月內</div>
                  <div>2. 連續 3 個月</div>
                  <div>3. 使用 Linux 和 Red Hat 於 EC2</div>
                  <div className="font-semibold text-white">4. 每月至少 $250,000 美元 (250k)</div>
                </td>
                <td className="px-3.5 py-3 text-center font-mono whitespace-nowrap text-gray-300">
                  2027/07/01 - 2028/04/30
                </td>
                <td className="px-3.5 py-3 text-right font-mono font-bold text-emerald-400 whitespace-nowrap">
                  $150,000
                </td>
                <td className="px-3.5 py-3 text-center whitespace-nowrap">
                  <StatusBadge status={analysis.computeCheck2.achieved ? 'achieved' : analysis.computeCheck2.progress > 0 ? 'in-progress' : 'not-achieved'} />
                </td>
              </tr>

              {/* Table 2 - Row 1 */}
              <tr className="hover:bg-gray-800/50 transition">
                <td className="px-3.5 py-3 font-bold text-purple-400 whitespace-nowrap" rowSpan={2}>
                  Table 2: Graviton<br/>
                  <span className="text-[11px] text-gray-400 font-normal">Graviton 採用</span>
                </td>
                <td className="px-3.5 py-3 text-gray-300 max-w-xs leading-relaxed">
                  Before the end of Contract Year 2, at least 15% of End Customer's combined total hours of usage (measured in Normalized Instance Hours) of Amazon EC2 instances under Eligible Account(s) for a period of three consecutive months was on AWS Graviton-powered Amazon EC2 instances.
                </td>
                <td className="px-3.5 py-3 text-gray-200 space-y-0.5">
                  <div>1. 合約第 2 年結束前</div>
                  <div>2. 連續 3 個月</div>
                  <div className="font-semibold text-white">3. 至少 15% 用於 Graviton 實例</div>
                  <div>4. 以 EC2 合計總使用小時 (NIH) 計算</div>
                </td>
                <td className="px-3.5 py-3 text-center font-mono whitespace-nowrap text-gray-300">
                  2025/07/01 - 2027/06/30
                </td>
                <td className="px-3.5 py-3 text-right font-mono font-bold text-emerald-400 whitespace-nowrap">
                  $150,000
                </td>
                <td className="px-3.5 py-3 text-center whitespace-nowrap">
                  <StatusBadge status={analysis.gravitonCheck1.achieved ? 'achieved' : analysis.gravitonCheck1.progress > 0 ? 'in-progress' : 'not-achieved'} />
                </td>
              </tr>

              {/* Table 2 - Row 2 */}
              <tr className="hover:bg-gray-800/50 transition bg-gray-900/30">
                <td className="px-3.5 py-3 text-gray-300 max-w-xs leading-relaxed">
                  Before the end of Contract Year 3, at least 25% of End Customer's combined total hours of usage (measured in Normalized Instance Hours) of Amazon EC2 instances under Eligible Account(s) for a period of three consecutive months was on AWS Graviton-powered Amazon EC2 instances.
                </td>
                <td className="px-3.5 py-3 text-gray-200 space-y-0.5">
                  <div>1. 合約第 3 年結束前</div>
                  <div>2. 連續 3 個月</div>
                  <div className="font-semibold text-white">3. 至少 25% 用於 Graviton 實例</div>
                  <div>4. 以 EC2 合計總使用小時 (NIH) 計算</div>
                </td>
                <td className="px-3.5 py-3 text-center font-mono whitespace-nowrap text-gray-300">
                  2025/07/01 - 2028/04/30
                </td>
                <td className="px-3.5 py-3 text-right font-mono font-bold text-emerald-400 whitespace-nowrap">
                  $150,000
                </td>
                <td className="px-3.5 py-3 text-center whitespace-nowrap">
                  <StatusBadge status={analysis.gravitonCheck2.achieved ? 'achieved' : analysis.gravitonCheck2.progress > 0 ? 'in-progress' : 'not-achieved'} />
                </td>
              </tr>

              {/* Table 3 - Row 1 */}
              <tr className="hover:bg-gray-800/50 transition">
                <td className="px-3.5 py-3 font-bold text-teal-400 whitespace-nowrap" rowSpan={2}>
                  Table 3: GenAI<br/>
                  <span className="text-[11px] text-gray-400 font-normal">生成式 AI 採用</span>
                </td>
                <td className="px-3.5 py-3 text-gray-300 max-w-xs leading-relaxed">
                  Receive investments in an amount up to 50% of Commitment-Eligible Fees incurred by End Customer for using Amazon Bedrock and/or Amazon Q Services during the first 12 months of Discount Term.
                </td>
                <td className="px-3.5 py-3 text-gray-200 space-y-0.5">
                  <div>1. 前 12 個月內 (Year 1)</div>
                  <div>2. Amazon Bedrock 和/或 Amazon Q</div>
                  <div className="font-semibold text-white">3. 最終產生費用可獲最高 50% 投資</div>
                </td>
                <td className="px-3.5 py-3 text-center font-mono whitespace-nowrap text-gray-300">
                  2025/07/01 - 2026/06/30
                </td>
                <td className="px-3.5 py-3 text-right font-mono font-bold text-emerald-400 whitespace-nowrap">
                  上限 $50,000
                </td>
                <td className="px-3.5 py-3 text-center whitespace-nowrap">
                  <span className="text-emerald-400 font-mono font-bold">
                    {formatCurrency(analysis.genAiYear1Credit)}
                  </span>
                </td>
              </tr>

              {/* Table 3 - Row 2 */}
              <tr className="hover:bg-gray-800/50 transition bg-gray-900/30">
                <td className="px-3.5 py-3 text-gray-300 max-w-xs leading-relaxed">
                  Receive investments in an amount up to 50% of Commitment-Eligible Fees incurred by End Customer for using Amazon Bedrock and/or Amazon Q Services during period from 13th to the 24th month.
                </td>
                <td className="px-3.5 py-3 text-gray-200 space-y-0.5">
                  <div>1. 第 13 至 24 個月內 (Year 2)</div>
                  <div>2. Amazon Bedrock 和/或 Amazon Q</div>
                  <div className="font-semibold text-white">3. 最終產生費用可獲最高 50% 投資</div>
                </td>
                <td className="px-3.5 py-3 text-center font-mono whitespace-nowrap text-gray-300">
                  2026/07/01 - 2027/06/30
                </td>
                <td className="px-3.5 py-3 text-right font-mono font-bold text-emerald-400 whitespace-nowrap">
                  上限 $100,000
                </td>
                <td className="px-3.5 py-3 text-center whitespace-nowrap">
                  <span className="text-emerald-400 font-mono font-bold">
                    {formatCurrency(analysis.genAiYear2Credit)}
                  </span>
                </td>
              </tr>

              {/* Table 4: RDS Credits */}
              <tr className="hover:bg-gray-800/50 transition bg-amber-950/20">
                <td className="px-3.5 py-3 font-bold text-amber-400 whitespace-nowrap">
                  Table 4: RDS Credits<br/>
                  <span className="text-[11px] text-gray-400 font-normal">資料庫服務一次性 Credit</span>
                </td>
                <td className="px-3.5 py-3 text-gray-300 max-w-xs leading-relaxed">
                  Upon satisfying both conditions in Year 1, apply to AWS for an $800,000 one-time credit. After AWS internal approval, credit will be issued the following month to offset future usage.
                </td>
                <td className="px-3.5 py-3 text-gray-200 space-y-0.5">
                  <div>4-1. 第 1 年使用量達 <span className="font-bold text-amber-300">$2,000,000 USD</span> (含) 以上</div>
                  <div>4-2. Amazon RDS 使用金額佔比須達 <span className="font-bold text-amber-300">10%</span> 以上</div>
                  <div className="text-[11px] text-gray-400">4-3. 依 Product Name 包含 "AmazonRDS" 之金額計算</div>
                </td>
                <td className="px-3.5 py-3 text-center font-mono whitespace-nowrap text-gray-300">
                  2025/07/01 - 2026/06/30
                </td>
                <td className="px-3.5 py-3 text-right font-mono font-bold text-emerald-400 whitespace-nowrap">
                  $800,000
                </td>
                <td className="px-3.5 py-3 text-center whitespace-nowrap">
                  <StatusBadge status={analysis.rdsFullyAchieved ? 'achieved' : (analysis.rdsCondition1Achieved || analysis.rdsCondition2Achieved) ? 'in-progress' : 'not-achieved'} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
      
      {/* 1. Table 1 : Compute OS Transformation Investment (作業系統) */}
      <Card title="Table 1 : Compute OS Transformation Investment ( 作業系統 )">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4">
          <div className="text-xs text-gray-300">
            總計可得 Credits: <span className="font-bold text-emerald-400 text-sm font-mono">$450,000 USD</span>
            <span className="text-gray-400 ml-2">(前24月 $300k + 第25-34月 $150k)</span>
          </div>
          <span className="text-xs text-indigo-300 bg-indigo-950/60 border border-indigo-500/40 px-3 py-1 rounded-full">
            條件：Amazon EC2 運行於 Linux / Red Hat 作業系統之 Commitment-Eligible 費用
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Item 1 */}
          <div className="p-4 bg-gray-800/80 border border-gray-700/80 rounded-xl space-y-2">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider block">
                  第一階段：前 24 個月內 (2025/07/01 - 2027/06/30)
                </span>
                <p className="text-sm font-semibold text-white mt-1">
                  連續 3 個月 Linux/Red Hat EC2 費用達 <span className="text-amber-300 font-mono font-bold">$220,000</span>
                </p>
              </div>
              <StatusBadge status={analysis.computeCheck1.achieved ? 'achieved' : analysis.computeCheck1.progress > 0 ? 'in-progress' : 'not-achieved'} />
            </div>

            <div className="pt-2">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>達成進度: 連續 {analysis.computeCheck1.progress} / {analysis.computeCheck1.required} 個月</span>
                <span className="font-mono">{analysis.computeCheck1.achieved ? '已達成' : `${Math.round((analysis.computeCheck1.progress / 3) * 100)}%`}</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full transition-all duration-500 ${analysis.computeCheck1.achieved ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                  style={{ width: `${Math.min(100, (analysis.computeCheck1.progress / 3) * 100)}%` }}
                ></div>
              </div>
            </div>

            <div className="flex justify-between items-center text-xs pt-1 border-t border-gray-700/50">
              <span className="text-gray-400">回饋金額 (Credit):</span>
              <span className="font-mono font-bold text-emerald-400 text-sm">$300,000</span>
            </div>
          </div>

          {/* Item 2 */}
          <div className="p-4 bg-gray-800/80 border border-gray-700/80 rounded-xl space-y-2">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider block">
                  第二階段：第 25 至 34 個月內 (2027/07/01 - 2028/04/30)
                </span>
                <p className="text-sm font-semibold text-white mt-1">
                  連續 3 個月 Linux/Red Hat EC2 費用達 <span className="text-amber-300 font-mono font-bold">$250,000</span>
                </p>
              </div>
              <StatusBadge status={analysis.computeCheck2.achieved ? 'achieved' : analysis.computeCheck2.progress > 0 ? 'in-progress' : 'not-achieved'} />
            </div>

            <div className="pt-2">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>達成進度: 連續 {analysis.computeCheck2.progress} / {analysis.computeCheck2.required} 個月</span>
                <span className="font-mono">{analysis.computeCheck2.achieved ? '已達成' : `${Math.round((analysis.computeCheck2.progress / 3) * 100)}%`}</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full transition-all duration-500 ${analysis.computeCheck2.achieved ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                  style={{ width: `${Math.min(100, (analysis.computeCheck2.progress / 3) * 100)}%` }}
                ></div>
              </div>
            </div>

            <div className="flex justify-between items-center text-xs pt-1 border-t border-gray-700/50">
              <span className="text-gray-400">回饋金額 (Credit):</span>
              <span className="font-mono font-bold text-emerald-400 text-sm">$150,000</span>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="mt-6">
          <div className="flex justify-between items-center mb-2">
            <h4 className="text-sm font-semibold text-white">月度 EC2 費用趨勢 (Linux & Red Hat) 與門檻參考線</h4>
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-amber-400 inline-block"></span> 門檻1: $220k (前24月)</span>
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-rose-400 inline-block"></span> 門檻2: $250k (第25-34月)</span>
            </div>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={analysis.monthly} margin={{ top: 20, right: 30, left: 60, bottom: 15 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="month" stroke="#9ca3af" tick={{ fill: '#f3f4f6', fontSize: 11, fontWeight: 'bold' }} />
                <YAxis stroke="#9ca3af" tick={{ fill: '#f3f4f6', fontSize: 11 }} tickFormatter={(value) => formatCurrency(Number(value))} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#111827', border: '1px solid #4b5563', borderRadius: '0.75rem', color: '#ffffff', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' }} 
                  itemStyle={{ color: '#ffffff', fontWeight: 500 }}
                  labelStyle={{ color: '#ffffff', fontWeight: 'bold', marginBottom: '4px' }} 
                  labelFormatter={(label) => `計費月份: ${label}`}
                  formatter={(value: number) => [formatCurrency(value), 'Linux / Red Hat EC2 費用']} 
                />
                <Legend wrapperStyle={{ color: '#f3f4f6', paddingTop: '6px' }} />
                <ReferenceLine y={220000} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: '$220k 門檻', fill: '#f59e0b', fontSize: 11, position: 'insideTopRight' }} />
                <ReferenceLine y={250000} stroke="#f43f5e" strokeDasharray="4 4" label={{ value: '$250k 門檻', fill: '#f43f5e', fontSize: 11, position: 'insideTopRight' }} />
                <Line type="monotone" dataKey="linuxEc2Cost" name="Linux/Red Hat EC2 費用" stroke="#818cf8" strokeWidth={3} activeDot={{ r: 7 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <DetailsSection 
          title="符合條件的 Linux / Red Hat EC2 服務明細" 
          data={computeDetails} 
          onExport={() => handleExport(computeDetails, 'sia_compute_os_details')} 
        />
      </Card>

      {/* 2. Table 2 : Graviton Adoption Investment ( Graviton ) */}
      <Card title="Table 2 : Graviton Adoption Investment ( Graviton )">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4">
          <div className="text-xs text-gray-300">
            總計可得 Credits: <span className="font-bold text-emerald-400 text-sm font-mono">$300,000 USD</span>
            <span className="text-gray-400 ml-2">(合約第2年結束前 $150k + 合約第3年結束前 $150k)</span>
          </div>
          <span className="text-xs text-purple-300 bg-purple-950/60 border border-purple-500/40 px-3 py-1 rounded-full">
            條件：以 Amazon EC2 合計總使用小時 (Normalized Instance Hours, NIH) 中 Graviton 佔比計算
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Graviton Item 1 */}
          <div className="p-4 bg-gray-800/80 border border-gray-700/80 rounded-xl space-y-2">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs font-bold text-purple-300 uppercase tracking-wider block">
                  第一階段：合約第 2 年結束前 (2025/07/01 - 2027/06/30)
                </span>
                <p className="text-sm font-semibold text-white mt-1">
                  連續 3 個月 Graviton EC2 時數佔比達 <span className="text-amber-300 font-mono font-bold">15%</span>
                </p>
              </div>
              <StatusBadge status={analysis.gravitonCheck1.achieved ? 'achieved' : analysis.gravitonCheck1.progress > 0 ? 'in-progress' : 'not-achieved'} />
            </div>

            <div className="pt-2">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>達成進度: 連續 {analysis.gravitonCheck1.progress} / {analysis.gravitonCheck1.required} 個月</span>
                <span className="font-mono">{analysis.gravitonCheck1.achieved ? '已達成' : `${Math.round((analysis.gravitonCheck1.progress / 3) * 100)}%`}</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full transition-all duration-500 ${analysis.gravitonCheck1.achieved ? 'bg-emerald-500' : 'bg-purple-500'}`}
                  style={{ width: `${Math.min(100, (analysis.gravitonCheck1.progress / 3) * 100)}%` }}
                ></div>
              </div>
            </div>

            <div className="flex justify-between items-center text-xs pt-1 border-t border-gray-700/50">
              <span className="text-gray-400">回饋金額 (Credit):</span>
              <span className="font-mono font-bold text-emerald-400 text-sm">$150,000</span>
            </div>
          </div>

          {/* Graviton Item 2 */}
          <div className="p-4 bg-gray-800/80 border border-gray-700/80 rounded-xl space-y-2">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs font-bold text-purple-300 uppercase tracking-wider block">
                  第二階段：合約第 3 年結束前 (2025/07/01 - 2028/04/30)
                </span>
                <p className="text-sm font-semibold text-white mt-1">
                  連續 3 個月 Graviton EC2 時數佔比達 <span className="text-amber-300 font-mono font-bold">25%</span>
                </p>
              </div>
              <StatusBadge status={analysis.gravitonCheck2.achieved ? 'achieved' : analysis.gravitonCheck2.progress > 0 ? 'in-progress' : 'not-achieved'} />
            </div>

            <div className="pt-2">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>達成進度: 連續 {analysis.gravitonCheck2.progress} / {analysis.gravitonCheck2.required} 個月</span>
                <span className="font-mono">{analysis.gravitonCheck2.achieved ? '已達成' : `${Math.round((analysis.gravitonCheck2.progress / 3) * 100)}%`}</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full transition-all duration-500 ${analysis.gravitonCheck2.achieved ? 'bg-emerald-500' : 'bg-purple-500'}`}
                  style={{ width: `${Math.min(100, (analysis.gravitonCheck2.progress / 3) * 100)}%` }}
                ></div>
              </div>
            </div>

            <div className="flex justify-between items-center text-xs pt-1 border-t border-gray-700/50">
              <span className="text-gray-400">回饋金額 (Credit):</span>
              <span className="font-mono font-bold text-emerald-400 text-sm">$150,000</span>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="mt-6">
          <div className="flex justify-between items-center mb-2">
            <h4 className="text-sm font-semibold text-white">月度 EC2 總時數 vs Graviton 時數與使用率佔比</h4>
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-amber-400 inline-block"></span> 15% 門檻 (Year 2)</span>
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-emerald-400 inline-block"></span> 25% 門檻 (Year 3)</span>
            </div>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={analysis.monthly} margin={{ top: 20, right: 35, left: 60, bottom: 15 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="month" stroke="#9ca3af" tick={{ fill: '#f3f4f6', fontSize: 11, fontWeight: 'bold' }} />
                <YAxis 
                  yAxisId="left" 
                  stroke="#c084fc" 
                  tick={{ fill: '#f3f4f6', fontSize: 11 }} 
                  label={{ value: '使用小時 (Hours)', angle: -90, position: 'insideLeft', fill: '#c084fc' }} 
                  tickFormatter={(value) => formatInteger(Number(value))} 
                />
                <YAxis 
                  yAxisId="right" 
                  orientation="right" 
                  stroke="#4ade80" 
                  tick={{ fill: '#f3f4f6', fontSize: 11 }} 
                  label={{ value: 'Graviton 佔比 (%)', angle: 90, position: 'insideRight', fill: '#4ade80' }} 
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#111827', border: '1px solid #4b5563', borderRadius: '0.75rem', color: '#ffffff', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' }} 
                  itemStyle={{ color: '#ffffff', fontWeight: 500 }}
                  labelStyle={{ color: '#ffffff', fontWeight: 'bold', marginBottom: '4px' }} 
                  labelFormatter={(label) => `計費月份: ${label}`}
                  formatter={(value: number, name: string) => [
                    name.includes('佔比') ? `${formatNumber(value, 2)}%` : `${formatInteger(value)} 小時 (hrs)`, 
                    name
                  ]} 
                />
                <Legend wrapperStyle={{ color: '#f3f4f6', paddingTop: '6px' }} />
                <ReferenceLine yAxisId="right" y={15} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: '15% 門檻', fill: '#f59e0b', fontSize: 11, position: 'insideTopRight' }} />
                <ReferenceLine yAxisId="right" y={25} stroke="#10b981" strokeDasharray="4 4" label={{ value: '25% 門檻', fill: '#10b981', fontSize: 11, position: 'insideTopRight' }} />
                <Bar yAxisId="left" dataKey="totalEc2Usage" name="EC2 總使用小時" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="left" dataKey="gravitonUsage" name="Graviton 實例時數" fill="#c084fc" radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="gravitonPercentage" name="Graviton 佔比 (%)" stroke="#4ade80" strokeWidth={3} activeDot={{ r: 6 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <DetailsSection 
          title="符合條件的 Graviton 實例服務明細" 
          data={gravitonDetails} 
          onExport={() => handleExport(gravitonDetails, 'sia_graviton_details')} 
        />
      </Card>
      
      {/* 3. Table 3 : Generative AI Adoption Investment ( 生成式AI ) */}
      <Card title="Table 3 : Generative AI Adoption Investment ( 生成式AI )">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4">
          <div className="text-xs text-gray-300">
            總計可得 Credits: <span className="font-bold text-emerald-400 text-sm font-mono">$150,000 USD</span>
            <span className="text-gray-400 ml-2">(前12月上限 $50k + 第13-24月上限 $100k)</span>
          </div>
          <span className="text-xs text-teal-300 bg-teal-950/60 border border-teal-500/40 px-3 py-1 rounded-full">
            條件：Amazon Bedrock 和/或 Amazon Q Services 最終產生費用可獲最高 50% 投資回饋
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* GenAI Item 1 */}
          <div className="p-4 bg-gray-800/80 border border-gray-700/80 rounded-xl space-y-2">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs font-bold text-teal-300 uppercase tracking-wider block">
                  第 1 年度：前 12 個月內 (2025/07/01 - 2026/06/30)
                </span>
                <p className="text-sm font-semibold text-white mt-1">
                  Amazon Bedrock / Amazon Q 費用之 <span className="text-emerald-400 font-bold">50% 投資</span> (上限 $50,000)
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-emerald-300 bg-emerald-950/80 px-2 py-1 rounded border border-emerald-500/40">
                上限 $50,000
              </span>
            </div>

            <div className="pt-2 bg-gray-900/60 p-3 rounded-lg space-y-1.5 font-mono text-xs">
              <div className="flex justify-between text-gray-400">
                <span>期間累計 GenAI 費用:</span>
                <span className="text-white font-bold">{formatCurrency(analysis.genAiYear1Cost)}</span>
              </div>
              <div className="flex justify-between text-emerald-400">
                <span>50% 投資試算 (未達上限以 50% 計):</span>
                <span className="font-bold">{formatCurrency(analysis.genAiYear1Cost * 0.5)}</span>
              </div>
              <div className="flex justify-between text-teal-300 border-t border-gray-700/60 pt-1 font-sans">
                <span className="font-semibold">此階段預估可獲 Credits:</span>
                <span className="font-mono font-extrabold text-sm">{formatCurrency(analysis.genAiYear1Credit)}</span>
              </div>
            </div>
          </div>

          {/* GenAI Item 2 */}
          <div className="p-4 bg-gray-800/80 border border-gray-700/80 rounded-xl space-y-2">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs font-bold text-teal-300 uppercase tracking-wider block">
                  第 2 年度：第 13 至 24 個月內 (2026/07/01 - 2027/06/30)
                </span>
                <p className="text-sm font-semibold text-white mt-1">
                  Amazon Bedrock / Amazon Q 費用之 <span className="text-emerald-400 font-bold">50% 投資</span> (上限 $100,000)
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-emerald-300 bg-emerald-950/80 px-2 py-1 rounded border border-emerald-500/40">
                上限 $100,000
              </span>
            </div>

            <div className="pt-2 bg-gray-900/60 p-3 rounded-lg space-y-1.5 font-mono text-xs">
              <div className="flex justify-between text-gray-400">
                <span>期間累計 GenAI 費用:</span>
                <span className="text-white font-bold">{formatCurrency(analysis.genAiYear2Cost)}</span>
              </div>
              <div className="flex justify-between text-emerald-400">
                <span>50% 投資試算 (未達上限以 50% 計):</span>
                <span className="font-bold">{formatCurrency(analysis.genAiYear2Cost * 0.5)}</span>
              </div>
              <div className="flex justify-between text-teal-300 border-t border-gray-700/60 pt-1 font-sans">
                <span className="font-semibold">此階段預估可獲 Credits:</span>
                <span className="font-mono font-extrabold text-sm">{formatCurrency(analysis.genAiYear2Credit)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="mt-6">
          <div className="flex justify-between items-center mb-2">
            <h4 className="text-sm font-semibold text-white">月度 Generative AI (Bedrock / Amazon Q) 服務費用趨勢</h4>
            <div className="text-xs text-emerald-300 font-mono">
              全期累計費用: {formatCurrency(analysis.cumulativeGenAiCost)} (累計 Credits: {formatCurrency(analysis.totalGenAiCredit)})
            </div>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={analysis.monthly} margin={{ top: 20, right: 30, left: 60, bottom: 15 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="month" stroke="#9ca3af" tick={{ fill: '#f3f4f6', fontSize: 11, fontWeight: 'bold' }} />
                <YAxis stroke="#9ca3af" tick={{ fill: '#f3f4f6', fontSize: 11 }} tickFormatter={(value) => formatCurrency(Number(value))} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#111827', border: '1px solid #4b5563', borderRadius: '0.75rem', color: '#ffffff', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' }} 
                  itemStyle={{ color: '#ffffff', fontWeight: 500 }}
                  labelStyle={{ color: '#ffffff', fontWeight: 'bold', marginBottom: '4px' }} 
                  labelFormatter={(label) => `計費月份: ${label}`}
                  formatter={(value: number) => [formatCurrency(value), 'Generative AI (Bedrock / Amazon Q) 費用']} 
                />
                <Legend wrapperStyle={{ color: '#f3f4f6', paddingTop: '6px' }} />
                <Line type="monotone" dataKey="genAiCost" name="Generative AI (Bedrock / Amazon Q) 費用" stroke="#2dd4bf" strokeWidth={3} activeDot={{ r: 7 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <DetailsSection 
          title="符合條件的 Generative AI (Bedrock / Amazon Q) 服務明細" 
          data={genAiDetails} 
          onExport={() => handleExport(genAiDetails, 'sia_gen_ai_details')} 
        />
      </Card>

      {/* 4. Table 4 : RDS Credits ( 資料庫服務 ) */}
      <Card title="4、RDS Credits ( Amazon Relational Database Service )">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4">
          <div className="text-xs text-gray-300">
            一次性回饋金額: <span className="font-bold text-emerald-400 text-sm font-mono">$800,000 USD (捌拾萬美元)</span>
            <span className="text-gray-400 ml-2">（通過 AWS 內部審查後，於審核次月核發 Credit 扣抵後續用量）</span>
          </div>
          <span className="text-xs text-amber-300 bg-amber-950/60 border border-amber-500/40 px-3 py-1 rounded-full">
            條件：第一年總使用量達 $2,000,000 且 Amazon RDS 佔比達 10% 以上
          </span>
        </div>

        {/* 雙條件達成檢核卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Condition 4-1 */}
          <div className="p-4 bg-gray-800/80 border border-gray-700/80 rounded-xl space-y-2.5">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs font-bold text-amber-300 uppercase tracking-wider block">
                  條件 4-1：第一年總使用量門檻
                </span>
                <p className="text-sm font-semibold text-white mt-1">
                  第 1 年使用量達 <span className="text-amber-300 font-mono font-bold">$2,000,000 USD</span> (含) 以上
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  不含營業稅，驗證期：2025/07/01 - 2026/06/30 (如超過簽約日起至第1年止則無法符合)
                </p>
              </div>
              <StatusBadge status={analysis.rdsCondition1Achieved ? 'achieved' : analysis.rdsYear1TotalSpend > 0 ? 'in-progress' : 'not-achieved'} />
            </div>

            <div className="pt-2 bg-gray-900/60 p-3 rounded-lg space-y-1.5 font-mono text-xs">
              <div className="flex justify-between text-gray-400">
                <span>第 1 年累計總花費:</span>
                <span className="text-white font-bold">{formatCurrency(analysis.rdsYear1TotalSpend)}</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>目標門檻金額:</span>
                <span className="text-amber-400 font-bold">$2,000,000.00</span>
              </div>
              <div className="flex justify-between text-gray-300 border-t border-gray-700/60 pt-1 font-sans">
                <span>達成率:</span>
                <span className="font-mono font-bold text-white">
                  {formatNumber((analysis.rdsYear1TotalSpend / 2000000) * 100, 1)}%
                </span>
              </div>
            </div>

            <div className="w-full bg-gray-700 rounded-full h-2 mt-1">
              <div 
                className={`h-2 rounded-full transition-all duration-500 ${analysis.rdsCondition1Achieved ? 'bg-emerald-500' : 'bg-amber-500'}`}
                style={{ width: `${Math.min(100, (analysis.rdsYear1TotalSpend / 2000000) * 100)}%` }}
              ></div>
            </div>
          </div>

          {/* Condition 4-2 */}
          <div className="p-4 bg-gray-800/80 border border-gray-700/80 rounded-xl space-y-2.5">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs font-bold text-amber-300 uppercase tracking-wider block">
                  條件 4-2：Amazon RDS 資料庫使用佔比
                </span>
                <p className="text-sm font-semibold text-white mt-1">
                  第 1 年 Amazon RDS 使用金額佔比達 <span className="text-amber-300 font-mono font-bold">10%</span> 以上
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  依 Product Name 包含 "AmazonRDS" 服務金額 (E10 Product Cost) 計算
                </p>
              </div>
              <StatusBadge status={analysis.rdsCondition2Achieved ? 'achieved' : analysis.rdsYear1RdsSpend > 0 ? 'in-progress' : 'not-achieved'} />
            </div>

            <div className="pt-2 bg-gray-900/60 p-3 rounded-lg space-y-1.5 font-mono text-xs">
              <div className="flex justify-between text-gray-400">
                <span>第 1 年累計 RDS 費用:</span>
                <span className="text-white font-bold">{formatCurrency(analysis.rdsYear1RdsSpend)}</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>第 1 年 RDS 實際佔比:</span>
                <span className={`font-bold ${analysis.rdsCondition2Achieved ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {formatNumber(analysis.rdsYear1Ratio, 2)}%
                </span>
              </div>
              <div className="flex justify-between text-gray-300 border-t border-gray-700/60 pt-1 font-sans">
                <span>門檻要求:</span>
                <span className="font-mono font-bold text-white">≥ 10.00%</span>
              </div>
            </div>

            <div className="w-full bg-gray-700 rounded-full h-2 mt-1">
              <div 
                className={`h-2 rounded-full transition-all duration-500 ${analysis.rdsCondition2Achieved ? 'bg-emerald-500' : 'bg-amber-500'}`}
                style={{ width: `${Math.min(100, (analysis.rdsYear1Ratio / 10) * 100)}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* 4-4: 月度總金額、當月 RDS 金額以及 RDS 佔比圖表 */}
        <div className="mt-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-2">
            <h4 className="text-sm font-semibold text-white">
              月度總金額 (Total Amount)、當月 RDS 金額 (RDS Cost) 與 RDS 佔比 (%)
            </h4>
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-indigo-500 inline-block rounded-sm"></span> 當月總金額</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-amber-500 inline-block rounded-sm"></span> 當月 RDS 金額</span>
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-emerald-400 inline-block"></span> RDS 佔比 (%)</span>
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-rose-400 inline-block"></span> 10% 門檻</span>
            </div>
          </div>

          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={analysis.monthly} margin={{ top: 20, right: 35, left: 60, bottom: 15 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="month" stroke="#9ca3af" tick={{ fill: '#f3f4f6', fontSize: 11, fontWeight: 'bold' }} />
                <YAxis 
                  yAxisId="left" 
                  stroke="#9ca3af" 
                  tick={{ fill: '#f3f4f6', fontSize: 11 }} 
                  tickFormatter={(value) => formatCurrency(Number(value))} 
                />
                <YAxis 
                  yAxisId="right" 
                  orientation="right" 
                  stroke="#4ade80" 
                  tick={{ fill: '#f3f4f6', fontSize: 11 }} 
                  label={{ value: 'RDS 佔比 (%)', angle: 90, position: 'insideRight', fill: '#4ade80' }} 
                  tickFormatter={(value) => `${formatNumber(Number(value), 1)}%`}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#111827', border: '1px solid #4b5563', borderRadius: '0.75rem', color: '#ffffff', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' }} 
                  itemStyle={{ color: '#ffffff', fontWeight: 500 }}
                  labelStyle={{ color: '#ffffff', fontWeight: 'bold', marginBottom: '4px' }} 
                  labelFormatter={(label) => `計費月份: ${label}`}
                  formatter={(value: number, name: string) => [
                    name.includes('佔比') ? `${formatNumber(value, 2)}%` : formatCurrency(value), 
                    name
                  ]} 
                />
                <Legend wrapperStyle={{ color: '#f3f4f6', paddingTop: '6px' }} />
                <ReferenceLine yAxisId="right" y={10} stroke="#f43f5e" strokeDasharray="4 4" label={{ value: '10% 門檻', fill: '#f43f5e', fontSize: 11, position: 'insideTopRight' }} />
                <Bar yAxisId="left" dataKey="totalPayment" name="當月總金額 (Total Amount)" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="left" dataKey="rdsCost" name="當月 RDS 金額 (RDS Cost)" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="rdsPercentage" name="RDS 佔比 (%)" stroke="#4ade80" strokeWidth={3} activeDot={{ r: 6 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 符合條件明細表 */}
        <DetailsSection 
          title="符合條件的 Amazon RDS (Relational Database Service) 服務明細" 
          data={rdsDetails} 
          onExport={() => handleExport(rdsDetails, 'sia_rds_details')} 
        />
      </Card>
    </div>
  );
};

export default SiaReportTab;
