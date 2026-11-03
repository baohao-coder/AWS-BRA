import React, { useState, useMemo } from 'react';
import { BillingData, AccountData, Service } from '../../types';
import { exportToExcel } from '../../services/excelUtils';
import Card from '../common/Card';

export interface RiSpPlanRates {
  edpDiscount: number; // e.g. 0.25 (75折)
  oneYearNoUpfront: number; // e.g. 0.29 (29%)
  oneYearAllUpfront: number; // e.g. 0.38 (38%)
  threeYearNoUpfront: number; // e.g. 0.52 (52%)
  threeYearAllUpfront: number; // e.g. 0.66 (66%)
}

// AWS Official Benchmarks
// Reference: https://aws.amazon.com/savingsplans/pricing/
// Reference: https://aws.amazon.com/ec2/pricing/reserved-instances/pricing/
export const DEFAULT_COMPUTE_SP_RATES: RiSpPlanRates = {
  edpDiscount: 0.25, // EDP 75折 = 25% discount
  oneYearNoUpfront: 0.29, // ~29% average Compute SP
  oneYearAllUpfront: 0.38, // ~38% average Compute SP
  threeYearNoUpfront: 0.52, // ~52% average Compute SP
  threeYearAllUpfront: 0.66, // ~66% average Compute SP
};

export const DEFAULT_EC2_RI_RATES: RiSpPlanRates = {
  edpDiscount: 0.25,
  oneYearNoUpfront: 0.40, // ~40% EC2 Instance SP / RI
  oneYearAllUpfront: 0.42, // ~42% EC2 Instance SP / RI
  threeYearNoUpfront: 0.60, // ~60% EC2 Instance SP / RI
  threeYearAllUpfront: 0.72, // ~72% EC2 Instance SP / RI
};

export interface ServiceItemCost {
  productName: string;
  cost: number;
  isEligible: boolean;
  categoryName?: string;
}

export interface AccountRiSpEvaluation {
  accountId: string;
  accountName: string;
  totalCost: number; // On-demand original cost
  eligibleCost: number; // Spend on Compute/DB eligible for RI/SP
  nonEligibleCost: number; // Other spend (Storage, Data Transfer, AI, etc.)
  eligibleRatio: number; // % of spend that is eligible
  
  // Cost under EDP (75折 on entire account)
  costEdp: number;
  savingsEdp: number;

  // Cost under each RI/SP scenario (Eligible gets RI/SP discount, Non-eligible stays at 100% on-demand)
  cost1YNoUpfront: number;
  cost1YAllUpfront: number;
  cost3YNoUpfront: number;
  cost3YAllUpfront: number;

  // Savings vs On-Demand
  savings1YNoUpfront: number;
  savings1YAllUpfront: number;
  savings3YNoUpfront: number;
  savings3YAllUpfront: number;

  // Net difference vs EDP (costEdp - costPlan: positive means cheaper than EDP, negative means more expensive than EDP)
  netDiff1YNoUpfront: number;
  netDiff1YAllUpfront: number;
  netDiff3YNoUpfront: number;
  netDiff3YAllUpfront: number;

  // Best Recommendation
  bestPlanKey: 'edp' | '1y_no' | '1y_all' | '3y_no' | '3y_all';
  bestPlanName: string;
  bestCost: number;
  bestSavingsVsOnDemand: number;
  bestSavingsRateVsOnDemand: number;
  netSavingsVsEdp: number; // extra savings beyond EDP
  recommendationType: 'EDP' | 'RISP';
  recommendationReason: string;

  // Best 1-Year Option (EDP vs 1Y No vs 1Y All)
  best1YearPlanName: string;
  best1YearCost: number;

  // Best 3-Year Option (EDP vs 3Y No vs 3Y All)
  best3YearPlanName: string;
  best3YearCost: number;

  services: ServiceItemCost[];
}

interface RiSpAnalysisSectionProps {
  data: BillingData;
  months: string[];
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  analysisMode: 'monthly' | 'cumulative';
  setAnalysisMode: (mode: 'monthly' | 'cumulative') => void;
  accountFilterSummaryText: string;
}

const formatNumber = (value: number, decimals: number = 2) => {
  if (typeof value !== 'number' || isNaN(value)) return '0.00';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
};

const formatPercent = (value: number, decimals: number = 1) => {
  if (typeof value !== 'number' || isNaN(value)) return '0.0%';
  return `${value.toFixed(decimals)}%`;
};

// Check if a service is eligible for Savings Plans / Reserved Instances
export const checkServiceEligibleForRiSp = (productName: string, includeDb: boolean = true): boolean => {
  if (!productName) return false;
  const p = productName.toLowerCase();
  
  // Compute: EC2, Lambda, ECS/Fargate
  if (
    p.includes('elastic compute cloud') || 
    p.includes('ec2') || 
    p.includes('lambda') || 
    p.includes('fargate') ||
    p.includes('compute savings plans')
  ) {
    return true;
  }

  // Database / Analytics instances: RDS, ElastiCache, Redshift, OpenSearch
  if (includeDb) {
    if (
      p.includes('relational database service') || 
      p.includes('rds') || 
      p.includes('elasticache') || 
      p.includes('redshift') || 
      p.includes('opensearch') || 
      p.includes('elasticsearch')
    ) {
      return true;
    }
  }

  return false;
};

const RiSpAnalysisSection: React.FC<RiSpAnalysisSectionProps> = ({
  data,
  months,
  selectedMonth,
  setSelectedMonth,
  analysisMode,
  setAnalysisMode,
  accountFilterSummaryText
}) => {
  // Configurable discount rates
  const [rates, setRates] = useState<RiSpPlanRates>(DEFAULT_COMPUTE_SP_RATES);
  const [activePreset, setActivePreset] = useState<'compute_sp' | 'ec2_ri' | 'custom'>('compute_sp');
  const [includeDbInEligible, setIncludeDbInEligible] = useState<boolean>(true);
  
  // Search and filter state for table
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [recommendationFilter, setRecommendationFilter] = useState<'ALL' | 'EDP' | 'RISP'>('ALL');
  const [sortField, setSortField] = useState<'totalCost' | 'eligibleRatio' | 'bestSavings' | 'netDiffEdp' | 'accountName'>('totalCost');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Selected account for deep-dive modal
  const [inspectingAccount, setInspectingAccount] = useState<AccountRiSpEvaluation | null>(null);

  // Preset switch handlers
  const handleApplyPreset = (preset: 'compute_sp' | 'ec2_ri') => {
    setActivePreset(preset);
    if (preset === 'compute_sp') {
      setRates(DEFAULT_COMPUTE_SP_RATES);
    } else {
      setRates(DEFAULT_EC2_RI_RATES);
    }
  };

  const handleCustomRateChange = (field: keyof RiSpPlanRates, value: number) => {
    setActivePreset('custom');
    setRates(prev => ({
      ...prev,
      [field]: Math.max(0, Math.min(1, value))
    }));
  };

  // Perform RI/SP vs EDP Evaluation for all accounts based on current mode and rates
  const evaluationResults = useMemo(() => {
    // 1. Gather all accounts depending on analysisMode
    const accAggregateMap = new Map<string, {
      accountId: string;
      accountName: string;
      servicesMap: Map<string, number>;
      totalAmount: number;
    }>();

    const targetMonthsData = analysisMode === 'monthly'
      ? data.filter(d => d.month === selectedMonth)
      : data;

    targetMonthsData.forEach(m => {
      m.accounts.forEach(acc => {
        if (!accAggregateMap.has(acc.accountId)) {
          accAggregateMap.set(acc.accountId, {
            accountId: acc.accountId,
            accountName: acc.accountName || acc.accountId,
            servicesMap: new Map<string, number>(),
            totalAmount: 0
          });
        }
        const record = accAggregateMap.get(acc.accountId)!;

        // Aggregate services
        if (acc.services && acc.services.length > 0) {
          acc.services.forEach(srv => {
            const cost = srv.totalCost || 0;
            if (cost !== 0) {
              const current = record.servicesMap.get(srv.productName) || 0;
              record.servicesMap.set(srv.productName, current + cost);
              record.totalAmount += cost;
            }
          });
        } else if (typeof acc.totalAmount === 'number' && acc.totalAmount > 0) {
          record.totalAmount += acc.totalAmount;
        }
      });
    });

    // 2. Evaluate each account under the pricing rules
    const evals: AccountRiSpEvaluation[] = [];

    accAggregateMap.forEach(record => {
      const servicesList: ServiceItemCost[] = [];
      let eligibleCost = 0;
      let nonEligibleCost = 0;

      record.servicesMap.forEach((cost, prodName) => {
        const isEligible = checkServiceEligibleForRiSp(prodName, includeDbInEligible);
        if (isEligible) {
          eligibleCost += cost;
        } else {
          nonEligibleCost += cost;
        }
        servicesList.push({
          productName: prodName,
          cost,
          isEligible
        });
      });

      // Sort services by cost descending
      servicesList.sort((a, b) => b.cost - a.cost);

      const totalCost = eligibleCost + nonEligibleCost;
      if (totalCost <= 0) return; // Skip zero-cost accounts

      const eligibleRatio = totalCost > 0 ? (eligibleCost / totalCost) * 100 : 0;

      // Case A: No RI/SP purchased -> Pay EDP discount rate (75折 = 25% discount) across whole account
      const costEdp = totalCost * (1 - rates.edpDiscount);
      const savingsEdp = totalCost - costEdp;

      // Case B: Purchase RI/SP plan -> Eligible services get RI/SP discount, Non-eligible services stay at 100% on-demand
      const cost1YNoUpfront = (eligibleCost * (1 - rates.oneYearNoUpfront)) + (nonEligibleCost * 1.0);
      const cost1YAllUpfront = (eligibleCost * (1 - rates.oneYearAllUpfront)) + (nonEligibleCost * 1.0);
      const cost3YNoUpfront = (eligibleCost * (1 - rates.threeYearNoUpfront)) + (nonEligibleCost * 1.0);
      const cost3YAllUpfront = (eligibleCost * (1 - rates.threeYearAllUpfront)) + (nonEligibleCost * 1.0);

      const savings1YNoUpfront = totalCost - cost1YNoUpfront;
      const savings1YAllUpfront = totalCost - cost1YAllUpfront;
      const savings3YNoUpfront = totalCost - cost3YNoUpfront;
      const savings3YAllUpfront = totalCost - cost3YAllUpfront;

      const netDiff1YNoUpfront = costEdp - cost1YNoUpfront;
      const netDiff1YAllUpfront = costEdp - cost1YAllUpfront;
      const netDiff3YNoUpfront = costEdp - cost3YNoUpfront;
      const netDiff3YAllUpfront = costEdp - cost3YAllUpfront;

      // Candidate options for best recommendation
      const candidatePlans: {
        key: 'edp' | '1y_no' | '1y_all' | '3y_no' | '3y_all';
        name: string;
        cost: number;
        type: 'EDP' | 'RISP';
        term: '1Y' | '3Y' | 'EDP';
      }[] = [
        { key: 'edp', name: `EDP ${(100 - rates.edpDiscount * 100).toFixed(0)}折`, cost: costEdp, type: 'EDP', term: 'EDP' },
        { key: '1y_no', name: 'RI/SP 1年無預付', cost: cost1YNoUpfront, type: 'RISP', term: '1Y' },
        { key: '1y_all', name: 'RI/SP 1年全預付', cost: cost1YAllUpfront, type: 'RISP', term: '1Y' },
        { key: '3y_no', name: 'RI/SP 3年無預付', cost: cost3YNoUpfront, type: 'RISP', term: '3Y' },
        { key: '3y_all', name: 'RI/SP 3年全預付', cost: cost3YAllUpfront, type: 'RISP', term: '3Y' },
      ];

      // Find overall best plan with minimal cost
      candidatePlans.sort((a, b) => a.cost - b.cost);
      const best = candidatePlans[0];

      // Best 1-Year option (EDP vs 1Y No vs 1Y All)
      const oneYearCandidates = candidatePlans.filter(p => p.term === '1Y' || p.key === 'edp');
      oneYearCandidates.sort((a, b) => a.cost - b.cost);
      const best1Year = oneYearCandidates[0];

      // Best 3-Year option (EDP vs 3Y No vs 3Y All)
      const threeYearCandidates = candidatePlans.filter(p => p.term === '3Y' || p.key === 'edp');
      threeYearCandidates.sort((a, b) => a.cost - b.cost);
      const best3Year = threeYearCandidates[0];

      const bestSavingsVsOnDemand = totalCost - best.cost;
      const bestSavingsRateVsOnDemand = totalCost > 0 ? (bestSavingsVsOnDemand / totalCost) * 100 : 0;
      const netSavingsVsEdp = costEdp - best.cost; // > 0 means better than EDP

      // Generate human-friendly decision rationale
      let recommendationReason = '';
      if (best.type === 'EDP') {
        recommendationReason = `非適用服務佔比達 ${(100 - eligibleRatio).toFixed(1)}%。若購買 RI/SP，非適用服務將失去 25% EDP 折扣而需付全額原價，抵扣後全帳號採 EDP 75折更省。`;
      } else {
        recommendationReason = `適用服務佔比達 ${eligibleRatio.toFixed(1)}%，該方案高折扣率節省的金額遠超非適用服務恢復原價之差額，比走 EDP 可再省 $${formatNumber(netSavingsVsEdp)}。`;
      }

      evals.push({
        accountId: record.accountId,
        accountName: record.accountName,
        totalCost,
        eligibleCost,
        nonEligibleCost,
        eligibleRatio,
        costEdp,
        savingsEdp,
        cost1YNoUpfront,
        cost1YAllUpfront,
        cost3YNoUpfront,
        cost3YAllUpfront,
        savings1YNoUpfront,
        savings1YAllUpfront,
        savings3YNoUpfront,
        savings3YAllUpfront,
        netDiff1YNoUpfront,
        netDiff1YAllUpfront,
        netDiff3YNoUpfront,
        netDiff3YAllUpfront,
        bestPlanKey: best.key,
        bestPlanName: best.name,
        bestCost: best.cost,
        bestSavingsVsOnDemand,
        bestSavingsRateVsOnDemand,
        netSavingsVsEdp,
        recommendationType: best.type,
        recommendationReason,
        best1YearPlanName: best1Year.name,
        best1YearCost: best1Year.cost,
        best3YearPlanName: best3Year.name,
        best3YearCost: best3Year.cost,
        services: servicesList
      });
    });

    return evals;
  }, [data, selectedMonth, analysisMode, rates, includeDbInEligible]);

  // Overall KPI aggregates across all evaluated accounts
  const summaryKpis = useMemo(() => {
    let totalOnDemand = 0;
    let totalEligible = 0;
    let totalNonEligible = 0;
    let totalEdpCost = 0;
    let totalOptimalCost = 0;
    let edpRecommendedCount = 0;
    let rispRecommendedCount = 0;

    evaluationResults.forEach(item => {
      totalOnDemand += item.totalCost;
      totalEligible += item.eligibleCost;
      totalNonEligible += item.nonEligibleCost;
      totalEdpCost += item.costEdp;
      totalOptimalCost += item.bestCost;

      if (item.recommendationType === 'EDP') {
        edpRecommendedCount++;
      } else {
        rispRecommendedCount++;
      }
    });

    const totalAccounts = evaluationResults.length;
    const edpSavings = totalOnDemand - totalEdpCost;
    const optimalSavingsVsOnDemand = totalOnDemand - totalOptimalCost;
    const optimalExtraSavingsVsEdp = totalEdpCost - totalOptimalCost;
    const avgEligibleRatio = totalOnDemand > 0 ? (totalEligible / totalOnDemand) * 100 : 0;

    return {
      totalAccounts,
      totalOnDemand,
      totalEligible,
      totalNonEligible,
      avgEligibleRatio,
      totalEdpCost,
      totalOptimalCost,
      edpSavings,
      optimalSavingsVsOnDemand,
      optimalExtraSavingsVsEdp,
      edpRecommendedCount,
      rispRecommendedCount
    };
  }, [evaluationResults]);

  // Filtered and sorted evaluation list for display in table
  const displayedEvaluations = useMemo(() => {
    let list = [...evaluationResults];

    // Filter by recommendation type
    if (recommendationFilter !== 'ALL') {
      list = list.filter(item => item.recommendationType === recommendationFilter);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(item => 
        item.accountName.toLowerCase().includes(q) || 
        item.accountId.toLowerCase().includes(q)
      );
    }

    // Sort
    list.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'totalCost':
          comparison = a.totalCost - b.totalCost;
          break;
        case 'eligibleRatio':
          comparison = a.eligibleRatio - b.eligibleRatio;
          break;
        case 'bestSavings':
          comparison = a.bestSavingsVsOnDemand - b.bestSavingsVsOnDemand;
          break;
        case 'netDiffEdp':
          comparison = a.netSavingsVsEdp - b.netSavingsVsEdp;
          break;
        case 'accountName':
          comparison = a.accountName.localeCompare(b.accountName, undefined, { numeric: true });
          break;
        default:
          comparison = b.totalCost - a.totalCost;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return list;
  }, [evaluationResults, recommendationFilter, searchQuery, sortField, sortDirection]);

  // Handle Excel Export
  const handleExportToExcel = () => {
    if (evaluationResults.length === 0) {
      alert('無可匯出資料');
      return;
    }

    const exportRows = evaluationResults.map(item => ({
      '帳號 ID (Account ID)': item.accountId,
      '帳號名稱 (Account Name)': item.accountName,
      '原幣花費總計 ($USD)': Number(item.totalCost.toFixed(2)),
      'RI/SP 適用服務花費 ($USD)': Number(item.eligibleCost.toFixed(2)),
      '非適用服務花費 ($USD)': Number(item.nonEligibleCost.toFixed(2)),
      '適用服務佔比 (%)': Number(item.eligibleRatio.toFixed(2)),
      'EDP 75折方案費用 ($USD)': Number(item.costEdp.toFixed(2)),
      '1年無預付方案費用 ($USD)': Number(item.cost1YNoUpfront.toFixed(2)),
      '1年全預付方案費用 ($USD)': Number(item.cost1YAllUpfront.toFixed(2)),
      '3年無預付方案費用 ($USD)': Number(item.cost3YNoUpfront.toFixed(2)),
      '3年全預付方案費用 ($USD)': Number(item.cost3YAllUpfront.toFixed(2)),
      '最優推薦方案': item.bestPlanName,
      '推薦方案支出 ($USD)': Number(item.bestCost.toFixed(2)),
      'vs 原價節省金額 ($USD)': Number(item.bestSavingsVsOnDemand.toFixed(2)),
      'vs 原價節省率 (%)': Number(item.bestSavingsRateVsOnDemand.toFixed(2)),
      'vs EDP 額外淨省 ($USD)': Number(item.netSavingsVsEdp.toFixed(2)),
      '1年期最優方案': item.best1YearPlanName,
      '1年期最優費用 ($USD)': Number(item.best1YearCost.toFixed(2)),
      '3年期最優方案': item.best3YearPlanName,
      '3年期最優費用 ($USD)': Number(item.best3YearCost.toFixed(2)),
      '決策建議理由': item.recommendationReason
    }));

    // Add summary row at the bottom
    exportRows.push({
      '帳號 ID (Account ID)': '總計 (TOTAL)',
      '帳號名稱 (Account Name)': `共 ${summaryKpis.totalAccounts} 個帳號`,
      '原幣花費總計 ($USD)': Number(summaryKpis.totalOnDemand.toFixed(2)),
      'RI/SP 適用服務花費 ($USD)': Number(summaryKpis.totalEligible.toFixed(2)),
      '非適用服務花費 ($USD)': Number(summaryKpis.totalNonEligible.toFixed(2)),
      '適用服務佔比 (%)': Number(summaryKpis.avgEligibleRatio.toFixed(2)),
      'EDP 75折方案費用 ($USD)': Number(summaryKpis.totalEdpCost.toFixed(2)),
      '1年無預付方案費用 ($USD)': Number(evaluationResults.reduce((s, i) => s + i.cost1YNoUpfront, 0).toFixed(2)),
      '1年全預付方案費用 ($USD)': Number(evaluationResults.reduce((s, i) => s + i.cost1YAllUpfront, 0).toFixed(2)),
      '3年無預付方案費用 ($USD)': Number(evaluationResults.reduce((s, i) => s + i.cost3YNoUpfront, 0).toFixed(2)),
      '3年全預付方案費用 ($USD)': Number(evaluationResults.reduce((s, i) => s + i.cost3YAllUpfront, 0).toFixed(2)),
      '最優推薦方案': `混合最佳策略 (${summaryKpis.edpRecommendedCount} 個採 EDP, ${summaryKpis.rispRecommendedCount} 個採 RI/SP)`,
      '推薦方案支出 ($USD)': Number(summaryKpis.totalOptimalCost.toFixed(2)),
      'vs 原價節省金額 ($USD)': Number(summaryKpis.optimalSavingsVsOnDemand.toFixed(2)),
      'vs 原價節省率 (%)': Number((summaryKpis.totalOnDemand > 0 ? (summaryKpis.optimalSavingsVsOnDemand / summaryKpis.totalOnDemand) * 100 : 0).toFixed(2)),
      'vs EDP 額外淨省 ($USD)': Number(summaryKpis.optimalExtraSavingsVsEdp.toFixed(2)),
      '1年期最優方案': '-',
      '1年期最優費用 ($USD)': Number(evaluationResults.reduce((s, i) => s + i.best1YearCost, 0).toFixed(2)),
      '3年期最優方案': '-',
      '3年期最優費用 ($USD)': Number(evaluationResults.reduce((s, i) => s + i.best3YearCost, 0).toFixed(2)),
      '決策建議理由': `混合最佳策略可比全採 EDP 再多省 $${formatNumber(summaryKpis.optimalExtraSavingsVsEdp)} USD`
    });

    const filePrefix = analysisMode === 'monthly' ? `AWS_RISP_EDP_Recommendation_${selectedMonth}` : 'AWS_RISP_EDP_Recommendation_AllTime';
    exportToExcel(exportRows, filePrefix);
  };

  const handleSort = (field: 'totalCost' | 'eligibleRatio' | 'bestSavings' | 'netDiffEdp' | 'accountName') => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  return (
    <div className="space-y-6">
      {/* ========================================================================= */}
      {/* 1. 規則說明與官方定價參考橫幅 (Pricing Rules & AWS Docs Banner) */}
      {/* ========================================================================= */}
      <div className="bg-gradient-to-r from-blue-950/60 via-indigo-950/40 to-purple-950/60 border border-blue-800/60 rounded-2xl p-5 shadow-lg">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="p-2 bg-blue-600/30 text-blue-400 rounded-xl text-xl">💡</span>
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  RI / Savings Plans vs. EDP 方案決策評估核心規則
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30">
                    企業財務合約決策模型
                  </span>
                </h3>
                <p className="text-xs text-blue-200/80 mt-0.5">
                  精準分析各 AWS 帳號應採用「全帳號 EDP 75折」或「購買 RI/SP (1年/3年、無預付/全預付)」方案之最適成本組合。
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1">
              <div className="bg-gray-900/70 p-3 rounded-xl border border-gray-800 flex items-start gap-2.5">
                <span className="text-purple-400 font-bold text-sm">方案 A</span>
                <div>
                  <span className="font-semibold text-purple-300">若帳號沒有購買 RI/SP：</span>
                  <p className="text-gray-300 mt-0.5">
                    該帳號全額享有 <span className="text-emerald-400 font-bold">EDP 75折優惠</span> (即全帳號所有服務費用均打 25% 折扣)。
                  </p>
                </div>
              </div>

              <div className="bg-gray-900/70 p-3 rounded-xl border border-gray-800 flex items-start gap-2.5">
                <span className="text-cyan-400 font-bold text-sm">方案 B</span>
                <div>
                  <span className="font-semibold text-cyan-300">若帳號購買任一 RI/SP 方案：</span>
                  <p className="text-gray-300 mt-0.5">
                    僅適用之運算/資料庫服務享有該方案的 RI/SP 折扣；<span className="text-amber-400 font-bold">其餘服務維持 100% 原價不打折</span> (無法享 EDP 75折)。
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row lg:flex-col gap-2 shrink-0">
            <a
              href="https://aws.amazon.com/savingsplans/pricing/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-gray-800 hover:bg-gray-700 text-blue-300 border border-blue-500/40 hover:border-blue-400 transition-all shadow-sm"
            >
              <span>🔗 AWS Savings Plans 官方定價</span>
            </a>
            <a
              href="https://aws.amazon.com/ec2/pricing/reserved-instances/pricing/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-gray-800 hover:bg-gray-700 text-indigo-300 border border-indigo-500/40 hover:border-indigo-400 transition-all shadow-sm"
            >
              <span>🔗 AWS EC2 / RDS RI 官方定價</span>
            </a>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. 控制與參數調整工具列 (Parameters & Scope Setting Bar) */}
      {/* ========================================================================= */}
      <div className="bg-gray-800 rounded-2xl border border-gray-700 p-5 shadow-lg space-y-4">
        {/* 上半部：時間維度與涵蓋範圍 */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-gray-700/80">
          <div className="flex flex-wrap items-center gap-4">
            {/* 時間維度 */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-300">統計維度:</span>
              <div className="inline-flex rounded-lg shadow-sm" role="group">
                <button
                  type="button"
                  onClick={() => setAnalysisMode('monthly')}
                  className={`px-3 py-1.5 text-xs font-medium border border-gray-600 rounded-l-lg transition-all ${
                    analysisMode === 'monthly'
                      ? 'bg-blue-600 text-white border-blue-600 shadow'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  單月評估
                </button>
                <button
                  type="button"
                  onClick={() => setAnalysisMode('cumulative')}
                  className={`px-3 py-1.5 text-xs font-medium border border-gray-600 rounded-r-lg transition-all ${
                    analysisMode === 'cumulative'
                      ? 'bg-blue-600 text-white border-blue-600 shadow'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  全期間累計
                </button>
              </div>
            </div>

            {/* 月份選擇器 (單月模式) */}
            {analysisMode === 'monthly' && (
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-gray-300">月份:</label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="bg-gray-700 border border-gray-600 text-white text-xs rounded-lg px-2.5 py-1.5 font-medium focus:ring-2 focus:ring-blue-500"
                >
                  {months.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            )}

            {/* 適用範圍切換 */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-300">RI/SP 適用範圍:</span>
              <div className="inline-flex rounded-lg shadow-sm">
                <button
                  type="button"
                  onClick={() => setIncludeDbInEligible(true)}
                  className={`px-3 py-1.5 text-xs font-medium border border-gray-600 rounded-l-lg transition-all ${
                    includeDbInEligible
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                  title="Compute (EC2, Lambda, Fargate) + 資料庫 (RDS, ElastiCache, Redshift, OpenSearch)"
                >
                  Compute + 資料庫 (全面推薦)
                </button>
                <button
                  type="button"
                  onClick={() => setIncludeDbInEligible(false)}
                  className={`px-3 py-1.5 text-xs font-medium border border-gray-600 rounded-r-lg transition-all ${
                    !includeDbInEligible
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                  title="僅純 Compute: EC2, Lambda, Fargate"
                >
                  僅純 Compute (Compute SP)
                </button>
              </div>
            </div>
          </div>

          <div className="text-xs text-gray-400">
            篩選範圍: <span className="text-blue-300 font-semibold">{accountFilterSummaryText}</span>
          </div>
        </div>

        {/* 下半部：方案折扣率設定 (可手動自訂或選擇官方基準) */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-300 uppercase tracking-wide">
                方案折扣率基準設定 (Discount Rate Settings):
              </span>
              <span className="text-xs text-gray-400">
                可直接調整百分比，系統即時重新計算各帳號評估結果
              </span>
            </div>

            {/* 快速基準按鈕 */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleApplyPreset('compute_sp')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all ${
                  activePreset === 'compute_sp'
                    ? 'bg-blue-600 text-white border-blue-500 shadow'
                    : 'bg-gray-750 text-gray-300 border-gray-600 hover:bg-gray-700'
                }`}
              >
                AWS Compute SP 基準 (29%/38%/52%/66%)
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('ec2_ri')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all ${
                  activePreset === 'ec2_ri'
                    ? 'bg-indigo-600 text-white border-indigo-500 shadow'
                    : 'bg-gray-750 text-gray-300 border-gray-600 hover:bg-gray-700'
                }`}
              >
                EC2 Instance SP/RI 基準 (40%/42%/60%/72%)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {/* EDP 折扣率 */}
            <div className="bg-gray-900/80 p-3 rounded-xl border border-purple-500/30">
              <div className="flex items-center justify-between text-xs font-bold text-purple-300 mb-1">
                <span>EDP 優惠 (全帳號)</span>
                <span className="bg-purple-900/60 px-1.5 py-0.5 rounded text-[11px]">
                  {(100 - rates.edpDiscount * 100).toFixed(0)}折
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={(rates.edpDiscount * 100).toFixed(1)}
                  onChange={(e) => handleCustomRateChange('edpDiscount', parseFloat(e.target.value) / 100 || 0)}
                  className="w-16 bg-gray-800 border border-gray-600 text-white text-xs rounded px-2 py-1 font-bold text-center"
                />
                <span className="text-xs text-gray-400 font-semibold">% 折扣</span>
              </div>
              <div className="text-[10px] text-gray-400 mt-1">
                費用 = 原價 × {(1 - rates.edpDiscount).toFixed(2)}
              </div>
            </div>

            {/* 1 年無預付 */}
            <div className="bg-gray-900/80 p-3 rounded-xl border border-blue-500/30">
              <div className="flex items-center justify-between text-xs font-bold text-blue-300 mb-1">
                <span>1年無預付 (1Y No)</span>
                <span className="bg-blue-900/60 px-1.5 py-0.5 rounded text-[11px]">
                  省 {(rates.oneYearNoUpfront * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={(rates.oneYearNoUpfront * 100).toFixed(1)}
                  onChange={(e) => handleCustomRateChange('oneYearNoUpfront', parseFloat(e.target.value) / 100 || 0)}
                  className="w-16 bg-gray-800 border border-gray-600 text-white text-xs rounded px-2 py-1 font-bold text-center"
                />
                <span className="text-xs text-gray-400 font-semibold">% 折扣</span>
              </div>
              <div className="text-[10px] text-gray-400 mt-1">
                年約零前期支出
              </div>
            </div>

            {/* 1 年全預付 */}
            <div className="bg-gray-900/80 p-3 rounded-xl border border-blue-500/30">
              <div className="flex items-center justify-between text-xs font-bold text-blue-300 mb-1">
                <span>1年全預付 (1Y All)</span>
                <span className="bg-blue-900/60 px-1.5 py-0.5 rounded text-[11px]">
                  省 {(rates.oneYearAllUpfront * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={(rates.oneYearAllUpfront * 100).toFixed(1)}
                  onChange={(e) => handleCustomRateChange('oneYearAllUpfront', parseFloat(e.target.value) / 100 || 0)}
                  className="w-16 bg-gray-800 border border-gray-600 text-white text-xs rounded px-2 py-1 font-bold text-center"
                />
                <span className="text-xs text-gray-400 font-semibold">% 折扣</span>
              </div>
              <div className="text-[10px] text-gray-400 mt-1">
                年約一次付清
              </div>
            </div>

            {/* 3 年無預付 */}
            <div className="bg-gray-900/80 p-3 rounded-xl border border-indigo-500/30">
              <div className="flex items-center justify-between text-xs font-bold text-indigo-300 mb-1">
                <span>3年無預付 (3Y No)</span>
                <span className="bg-indigo-900/60 px-1.5 py-0.5 rounded text-[11px]">
                  省 {(rates.threeYearNoUpfront * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={(rates.threeYearNoUpfront * 100).toFixed(1)}
                  onChange={(e) => handleCustomRateChange('threeYearNoUpfront', parseFloat(e.target.value) / 100 || 0)}
                  className="w-16 bg-gray-800 border border-gray-600 text-white text-xs rounded px-2 py-1 font-bold text-center"
                />
                <span className="text-xs text-gray-400 font-semibold">% 折扣</span>
              </div>
              <div className="text-[10px] text-gray-400 mt-1">
                長約長期平攤
              </div>
            </div>

            {/* 3 年全預付 */}
            <div className="bg-gray-900/80 p-3 rounded-xl border border-indigo-500/30">
              <div className="flex items-center justify-between text-xs font-bold text-indigo-300 mb-1">
                <span>3年全預付 (3Y All)</span>
                <span className="bg-indigo-900/60 px-1.5 py-0.5 rounded text-[11px]">
                  省 {(rates.threeYearAllUpfront * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={(rates.threeYearAllUpfront * 100).toFixed(1)}
                  onChange={(e) => handleCustomRateChange('threeYearAllUpfront', parseFloat(e.target.value) / 100 || 0)}
                  className="w-16 bg-gray-800 border border-gray-600 text-white text-xs rounded px-2 py-1 font-bold text-center"
                />
                <span className="text-xs text-gray-400 font-semibold">% 折扣</span>
              </div>
              <div className="text-[10px] text-gray-400 mt-1">
                長約最高折扣
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. 企業決策核心看板 (Executive KPI Summary Cards) */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 卡片 1: 帳號推薦分佈 */}
        <div className="bg-gray-800 p-5 rounded-2xl border border-gray-700 shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">
              <span>評估帳號總數</span>
              <span className="text-blue-400">👥 帳號決策分佈</span>
            </div>
            <div className="text-3xl font-extrabold text-white">
              {summaryKpis.totalAccounts} <span className="text-sm font-normal text-gray-400">個帳號</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-700/80 flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-purple-300 font-semibold">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
              建議 EDP: {summaryKpis.edpRecommendedCount} 個
            </span>
            <span className="flex items-center gap-1.5 text-cyan-300 font-semibold">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-500"></span>
              建議 RI/SP: {summaryKpis.rispRecommendedCount} 個
            </span>
          </div>
        </div>

        {/* 卡片 2: 原幣花費與適用佔比 */}
        <div className="bg-gray-800 p-5 rounded-2xl border border-gray-700 shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">
              <span>原幣總花費 (On-Demand)</span>
              <span className="text-amber-400">⚡ 基準支出</span>
            </div>
            <div className="text-2xl font-extrabold text-amber-400">
              ${formatNumber(summaryKpis.totalOnDemand)}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-700/80 text-xs text-gray-400 flex justify-between">
            <span>RI/SP 適用服務:</span>
            <span className="font-semibold text-gray-200">
              ${formatNumber(summaryKpis.totalEligible)} ({formatPercent(summaryKpis.avgEligibleRatio)})
            </span>
          </div>
        </div>

        {/* 卡片 3: 全採 EDP 75折 支出 */}
        <div className="bg-gray-800 p-5 rounded-2xl border border-gray-700 shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">
              <span>全採 EDP 75折 總額</span>
              <span className="text-purple-400">🏛️ 單一合約基準</span>
            </div>
            <div className="text-2xl font-extrabold text-purple-300">
              ${formatNumber(summaryKpis.totalEdpCost)}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-700/80 text-xs text-gray-400 flex justify-between">
            <span>vs 原價省:</span>
            <span className="font-semibold text-purple-300">
              -${formatNumber(summaryKpis.edpSavings)} ({(rates.edpDiscount * 100).toFixed(0)}%)
            </span>
          </div>
        </div>

        {/* 卡片 4: 最佳化混合策略 (Account-Level Optimal Hybrid) */}
        <div className="bg-gradient-to-br from-emerald-950/40 via-gray-800 to-teal-950/40 p-5 rounded-2xl border border-emerald-500/50 shadow-md flex flex-col justify-between ring-1 ring-emerald-500/30">
          <div>
            <div className="flex items-center justify-between text-emerald-400 text-xs font-bold uppercase tracking-wider mb-2">
              <span>各帳號最佳配置策略總額</span>
              <span className="bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full text-[10px] font-bold border border-emerald-400/40">
                ⭐ 最優解
              </span>
            </div>
            <div className="text-2xl font-extrabold text-emerald-400">
              ${formatNumber(summaryKpis.totalOptimalCost)}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-emerald-800/60 text-xs flex items-center justify-between">
            <span className="text-gray-300">比全走 EDP 再多省:</span>
            <span className="font-bold text-emerald-300 text-sm">
              +${formatNumber(summaryKpis.optimalExtraSavingsVsEdp)}
            </span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. 各帳號分析與建議決策表格 (Account Detail & Decision Table) */}
      {/* ========================================================================= */}
      <Card
        title={`全部帳號 RI/SP vs. EDP 方案決策清單 ${analysisMode === 'monthly' ? `(${selectedMonth})` : '(全期間累計)'}`}
        actionButton={
          <button
            type="button"
            onClick={handleExportToExcel}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-xl text-xs transition-all shadow hover:shadow-lg flex items-center gap-2 cursor-pointer"
          >
            <span>📥 匯出 RI/SP 分析建議 Excel</span>
          </button>
        }
      >
        <div className="space-y-4">
          {/* 搜尋與篩選列 */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-900/60 p-3 rounded-xl border border-gray-700/60">
            <div className="flex flex-wrap items-center gap-3">
              {/* 搜尋帳號 */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="搜尋帳號名稱或 ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-64 bg-gray-800 border border-gray-600 text-white text-xs rounded-lg pl-8 pr-3 py-2 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="absolute left-2.5 top-2.5 text-gray-400 text-xs">🔍</span>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-2.5 text-gray-400 hover:text-white text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* 推薦類型篩選 */}
              <div className="inline-flex rounded-lg shadow-sm" role="group">
                <button
                  type="button"
                  onClick={() => setRecommendationFilter('ALL')}
                  className={`px-3 py-1.5 text-xs font-semibold border border-gray-600 rounded-l-lg transition-all ${
                    recommendationFilter === 'ALL'
                      ? 'bg-blue-600 text-white border-blue-600 shadow'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  全部 ({evaluationResults.length})
                </button>
                <button
                  type="button"
                  onClick={() => setRecommendationFilter('EDP')}
                  className={`px-3 py-1.5 text-xs font-semibold border-t border-b border-gray-600 transition-all ${
                    recommendationFilter === 'EDP'
                      ? 'bg-purple-600 text-white border-purple-600 shadow'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  建議 EDP ({summaryKpis.edpRecommendedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setRecommendationFilter('RISP')}
                  className={`px-3 py-1.5 text-xs font-semibold border border-gray-600 rounded-r-lg transition-all ${
                    recommendationFilter === 'RISP'
                      ? 'bg-cyan-600 text-white border-cyan-600 shadow'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  建議 RI/SP ({summaryKpis.rispRecommendedCount})
                </button>
              </div>
            </div>

            <div className="text-xs text-gray-400">
              顯示 <span className="text-white font-bold">{displayedEvaluations.length}</span> / {evaluationResults.length} 個帳號
            </div>
          </div>

          {/* 表格本體 */}
          <div className="overflow-x-auto rounded-xl border border-gray-700">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-gray-900/90 text-gray-300 uppercase tracking-wider text-[11px] sticky top-0 z-10 border-b border-gray-700">
                <tr>
                  <th
                    className="p-3 font-semibold cursor-pointer hover:text-white"
                    onClick={() => handleSort('accountName')}
                  >
                    帳號 (Account) {sortField === 'accountName' && (sortDirection === 'asc' ? '▲' : '▼')}
                  </th>
                  <th
                    className="p-3 font-semibold text-right cursor-pointer hover:text-white"
                    onClick={() => handleSort('totalCost')}
                  >
                    原幣花費 {sortField === 'totalCost' && (sortDirection === 'asc' ? '▲' : '▼')}
                  </th>
                  <th
                    className="p-3 font-semibold text-right cursor-pointer hover:text-white"
                    onClick={() => handleSort('eligibleRatio')}
                    title="適用 RI/SP 服務花費 / 原幣總花費"
                  >
                    適用服務佔比 {sortField === 'eligibleRatio' && (sortDirection === 'asc' ? '▲' : '▼')}
                  </th>
                  <th className="p-3 font-semibold text-right text-purple-300 bg-purple-950/20">
                    EDP 75折
                  </th>
                  <th className="p-3 font-semibold text-right text-blue-300 bg-blue-950/20">
                    1年無預付
                  </th>
                  <th className="p-3 font-semibold text-right text-blue-300 bg-blue-950/20">
                    1年全預付
                  </th>
                  <th className="p-3 font-semibold text-right text-indigo-300 bg-indigo-950/20">
                    3年無預付
                  </th>
                  <th className="p-3 font-semibold text-right text-indigo-300 bg-indigo-950/20">
                    3年全預付
                  </th>
                  <th className="p-3 font-semibold text-center">
                    最佳推薦方案
                  </th>
                  <th
                    className="p-3 font-semibold text-right cursor-pointer hover:text-white text-emerald-300 bg-emerald-950/20"
                    onClick={() => handleSort('bestSavings')}
                  >
                    最優支出 / 節省 {sortField === 'bestSavings' && (sortDirection === 'asc' ? '▲' : '▼')}
                  </th>
                  <th
                    className="p-3 font-semibold text-right cursor-pointer hover:text-white"
                    onClick={() => handleSort('netDiffEdp')}
                    title="最優方案比全採 EDP 75折多省的金額 (正值為更省，負值為不如 EDP)"
                  >
                    vs EDP 淨差額 {sortField === 'netDiffEdp' && (sortDirection === 'asc' ? '▲' : '▼')}
                  </th>
                  <th className="p-3 font-semibold text-center">
                    明細與計算
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/60 font-mono text-gray-200">
                {displayedEvaluations.map((item) => {
                  const isEdpBest = item.recommendationType === 'EDP';
                  return (
                    <tr
                      key={item.accountId}
                      className="hover:bg-gray-750/50 transition-colors"
                    >
                      {/* 帳號名稱與 ID */}
                      <td className="p-3 font-sans">
                        <div className="font-bold text-gray-100 flex items-center gap-1.5">
                          <span>{item.accountName}</span>
                        </div>
                        <div className="text-[11px] text-gray-400 font-mono">
                          ID: {item.accountId}
                        </div>
                      </td>

                      {/* 原幣花費 */}
                      <td className="p-3 text-right font-semibold text-amber-300">
                        ${formatNumber(item.totalCost)}
                      </td>

                      {/* 適用佔比 */}
                      <td className="p-3 text-right">
                        <div className="font-bold text-gray-200">
                          {formatPercent(item.eligibleRatio)}
                        </div>
                        <div className="text-[10px] text-gray-400">
                          ${formatNumber(item.eligibleCost)}
                        </div>
                        {/* 迷你進度條 */}
                        <div className="w-16 h-1 bg-gray-700 rounded-full ml-auto mt-1 overflow-hidden">
                          <div
                            className={`h-full ${item.eligibleRatio >= 50 ? 'bg-cyan-400' : 'bg-gray-400'}`}
                            style={{ width: `${Math.min(100, item.eligibleRatio)}%` }}
                          />
                        </div>
                      </td>

                      {/* EDP 75折費用 */}
                      <td className={`p-3 text-right ${isEdpBest ? 'bg-purple-950/40 text-purple-200 font-bold' : 'text-gray-300'}`}>
                        ${formatNumber(item.costEdp)}
                      </td>

                      {/* 1年無預付 */}
                      <td className={`p-3 text-right ${item.bestPlanKey === '1y_no' ? 'bg-blue-950/40 text-blue-200 font-bold' : 'text-gray-300'}`}>
                        ${formatNumber(item.cost1YNoUpfront)}
                      </td>

                      {/* 1年全預付 */}
                      <td className={`p-3 text-right ${item.bestPlanKey === '1y_all' ? 'bg-blue-950/40 text-blue-200 font-bold' : 'text-gray-300'}`}>
                        ${formatNumber(item.cost1YAllUpfront)}
                      </td>

                      {/* 3年無預付 */}
                      <td className={`p-3 text-right ${item.bestPlanKey === '3y_no' ? 'bg-indigo-950/40 text-indigo-200 font-bold' : 'text-gray-300'}`}>
                        ${formatNumber(item.cost3YNoUpfront)}
                      </td>

                      {/* 3年全預付 */}
                      <td className={`p-3 text-right ${item.bestPlanKey === '3y_all' ? 'bg-indigo-950/40 text-indigo-200 font-bold' : 'text-gray-300'}`}>
                        ${formatNumber(item.cost3YAllUpfront)}
                      </td>

                      {/* 最佳推薦方案 */}
                      <td className="p-3 text-center font-sans">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${
                            isEdpBest
                              ? 'bg-purple-900/40 text-purple-300 border-purple-500/50'
                              : 'bg-cyan-900/40 text-cyan-300 border-cyan-500/50'
                          }`}
                        >
                          {item.bestPlanName}
                        </span>
                      </td>

                      {/* 最優支出 / 節省 */}
                      <td className="p-3 text-right bg-emerald-950/20">
                        <div className="font-extrabold text-emerald-300">
                          ${formatNumber(item.bestCost)}
                        </div>
                        <div className="text-[10px] text-emerald-400/90">
                          省 ${formatNumber(item.bestSavingsVsOnDemand)} ({formatPercent(item.bestSavingsRateVsOnDemand)})
                        </div>
                      </td>

                      {/* vs EDP 淨差額 */}
                      <td className="p-3 text-right">
                        {item.netSavingsVsEdp > 0 ? (
                          <div className="font-bold text-emerald-400">
                            +${formatNumber(item.netSavingsVsEdp)}
                            <div className="text-[10px] text-emerald-500 font-sans">比 EDP 再省</div>
                          </div>
                        ) : (
                          <div className="font-semibold text-gray-400">
                            $0.00
                            <div className="text-[10px] text-purple-400 font-sans">即 EDP 最優</div>
                          </div>
                        )}
                      </td>

                      {/* 操作按鈕 */}
                      <td className="p-3 text-center font-sans">
                        <button
                          type="button"
                          onClick={() => setInspectingAccount(item)}
                          className="px-2.5 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-blue-300 hover:text-white text-xs font-semibold transition-all border border-gray-600 cursor-pointer"
                        >
                          查看計算內容
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {displayedEvaluations.length === 0 && (
                  <tr>
                    <td colSpan={12} className="p-8 text-center text-gray-400 font-sans">
                      沒有符合條件的帳號資料
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {/* ========================================================================= */}
      {/* 5. 帳號詳細計算內容彈窗 (Account Calculation Detail Modal) */}
      {/* ========================================================================= */}
      {inspectingAccount && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-gray-850 border border-gray-700 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-white">
                    帳號成本與 RI/SP 決策計算明細
                  </h3>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                      inspectingAccount.recommendationType === 'EDP'
                        ? 'bg-purple-900/40 text-purple-300 border-purple-500/50'
                        : 'bg-cyan-900/40 text-cyan-300 border-cyan-500/50'
                    }`}
                  >
                    推薦方案: {inspectingAccount.bestPlanName}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {inspectingAccount.accountName} (ID: {inspectingAccount.accountId}) • {analysisMode === 'monthly' ? `統計月份: ${selectedMonth}` : '統計範圍: 全期間累計'}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setInspectingAccount(null)}
                className="text-gray-400 hover:text-white text-xl p-1.5 rounded-lg hover:bg-gray-700 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* 核心金額拆解卡片 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-gray-800/80 p-4 rounded-xl border border-gray-700">
                  <div className="text-xs text-gray-400 font-bold mb-1">原幣總花費 (On-Demand)</div>
                  <div className="text-xl font-extrabold text-amber-400">
                    ${formatNumber(inspectingAccount.totalCost)}
                  </div>
                  <div className="text-[11px] text-gray-400 mt-1">基準 100% 無折扣</div>
                </div>

                <div className="bg-gray-800/80 p-4 rounded-xl border border-cyan-500/30">
                  <div className="text-xs text-cyan-300 font-bold mb-1">RI/SP 適用服務花費</div>
                  <div className="text-xl font-extrabold text-cyan-300">
                    ${formatNumber(inspectingAccount.eligibleCost)}
                  </div>
                  <div className="text-[11px] text-cyan-400 mt-1">
                    佔帳號比重: {formatPercent(inspectingAccount.eligibleRatio)}
                  </div>
                </div>

                <div className="bg-gray-800/80 p-4 rounded-xl border border-gray-700">
                  <div className="text-xs text-gray-400 font-bold mb-1">其他非適用服務花費</div>
                  <div className="text-xl font-extrabold text-gray-300">
                    ${formatNumber(inspectingAccount.nonEligibleCost)}
                  </div>
                  <div className="text-[11px] text-amber-400 mt-1">
                    若買 RI/SP 則維持 100% 原價
                  </div>
                </div>
              </div>

              {/* 決策數學推導解析 */}
              <div className="bg-gradient-to-r from-gray-800 to-gray-850 p-4 rounded-xl border border-gray-700 space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                  <span>📐 決策數學推導說明</span>
                </h4>
                <p className="text-xs text-gray-300 leading-relaxed">
                  {inspectingAccount.recommendationReason}
                </p>
                <div className="text-xs bg-gray-900/80 p-3 rounded-lg border border-gray-800 font-mono text-gray-300 space-y-1">
                  <div>• 走全帳號 EDP: ${formatNumber(inspectingAccount.totalCost)} × {(1 - rates.edpDiscount).toFixed(2)} = <span className="text-purple-300 font-bold">${formatNumber(inspectingAccount.costEdp)}</span></div>
                  <div>• 走最佳推薦方案 ({inspectingAccount.bestPlanName}): 適用折後 + 非適用原價 = <span className="text-emerald-300 font-bold">${formatNumber(inspectingAccount.bestCost)}</span></div>
                  <div>• 兩者相較結果: {inspectingAccount.netSavingsVsEdp > 0 ? `選擇 ${inspectingAccount.bestPlanName} 比 EDP 再省 $${formatNumber(inspectingAccount.netSavingsVsEdp)}` : '走 EDP 方案總額最低，最為划算'}</div>
                </div>
              </div>

              {/* 方案全覽比較對比表 */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-300 mb-2">
                  5 種方案情境對比 (全盤成本試算)
                </h4>
                <div className="overflow-x-auto rounded-xl border border-gray-700">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-gray-900 text-gray-400 uppercase text-[11px]">
                      <tr>
                        <th className="p-2.5">方案名稱</th>
                        <th className="p-2.5 text-center">適用折扣率</th>
                        <th className="p-2.5 text-right">適用服務費用</th>
                        <th className="p-2.5 text-right">非適用服務費用</th>
                        <th className="p-2.5 text-right font-bold text-white">方案總花費</th>
                        <th className="p-2.5 text-right text-emerald-400">vs 原價節省</th>
                        <th className="p-2.5 text-right text-purple-300">vs EDP 差額</th>
                        <th className="p-2.5 text-center">狀態</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700/60 font-mono text-gray-200">
                      {/* EDP 75折 */}
                      <tr className={inspectingAccount.bestPlanKey === 'edp' ? 'bg-purple-950/30' : ''}>
                        <td className="p-2.5 font-sans font-bold text-purple-300">
                          EDP {(100 - rates.edpDiscount * 100).toFixed(0)}折 (不買 RI/SP)
                        </td>
                        <td className="p-2.5 text-center">全額 {formatPercent(rates.edpDiscount * 100)}</td>
                        <td className="p-2.5 text-right">${formatNumber(inspectingAccount.eligibleCost * (1 - rates.edpDiscount))}</td>
                        <td className="p-2.5 text-right">${formatNumber(inspectingAccount.nonEligibleCost * (1 - rates.edpDiscount))}</td>
                        <td className="p-2.5 text-right font-bold text-purple-300">${formatNumber(inspectingAccount.costEdp)}</td>
                        <td className="p-2.5 text-right text-emerald-400">-${formatNumber(inspectingAccount.savingsEdp)}</td>
                        <td className="p-2.5 text-right text-gray-400">$0.00</td>
                        <td className="p-2.5 text-center font-sans">
                          {inspectingAccount.bestPlanKey === 'edp' ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-600 text-white">最佳推薦</span>
                          ) : (
                            <span className="text-gray-400 text-xs">可選</span>
                          )}
                        </td>
                      </tr>

                      {/* 1年無預付 */}
                      <tr className={inspectingAccount.bestPlanKey === '1y_no' ? 'bg-blue-950/30' : ''}>
                        <td className="p-2.5 font-sans font-semibold text-blue-300">RI/SP 1年無預付</td>
                        <td className="p-2.5 text-center">{formatPercent(rates.oneYearNoUpfront * 100)}</td>
                        <td className="p-2.5 text-right">${formatNumber(inspectingAccount.eligibleCost * (1 - rates.oneYearNoUpfront))}</td>
                        <td className="p-2.5 text-right text-amber-300/90">${formatNumber(inspectingAccount.nonEligibleCost)} (原價)</td>
                        <td className="p-2.5 text-right font-bold text-white">${formatNumber(inspectingAccount.cost1YNoUpfront)}</td>
                        <td className="p-2.5 text-right text-emerald-400">-${formatNumber(inspectingAccount.savings1YNoUpfront)}</td>
                        <td className="p-2.5 text-right">
                          <span className={inspectingAccount.netDiff1YNoUpfront > 0 ? 'text-emerald-400 font-bold' : 'text-rose-400'}>
                            {inspectingAccount.netDiff1YNoUpfront > 0 ? `+${formatNumber(inspectingAccount.netDiff1YNoUpfront)}` : formatNumber(inspectingAccount.netDiff1YNoUpfront)}
                          </span>
                        </td>
                        <td className="p-2.5 text-center font-sans">
                          {inspectingAccount.bestPlanKey === '1y_no' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-600 text-white">最佳推薦</span>
                          )}
                        </td>
                      </tr>

                      {/* 1年全預付 */}
                      <tr className={inspectingAccount.bestPlanKey === '1y_all' ? 'bg-blue-950/30' : ''}>
                        <td className="p-2.5 font-sans font-semibold text-blue-300">RI/SP 1年全預付</td>
                        <td className="p-2.5 text-center">{formatPercent(rates.oneYearAllUpfront * 100)}</td>
                        <td className="p-2.5 text-right">${formatNumber(inspectingAccount.eligibleCost * (1 - rates.oneYearAllUpfront))}</td>
                        <td className="p-2.5 text-right text-amber-300/90">${formatNumber(inspectingAccount.nonEligibleCost)} (原價)</td>
                        <td className="p-2.5 text-right font-bold text-white">${formatNumber(inspectingAccount.cost1YAllUpfront)}</td>
                        <td className="p-2.5 text-right text-emerald-400">-${formatNumber(inspectingAccount.savings1YAllUpfront)}</td>
                        <td className="p-2.5 text-right">
                          <span className={inspectingAccount.netDiff1YAllUpfront > 0 ? 'text-emerald-400 font-bold' : 'text-rose-400'}>
                            {inspectingAccount.netDiff1YAllUpfront > 0 ? `+${formatNumber(inspectingAccount.netDiff1YAllUpfront)}` : formatNumber(inspectingAccount.netDiff1YAllUpfront)}
                          </span>
                        </td>
                        <td className="p-2.5 text-center font-sans">
                          {inspectingAccount.bestPlanKey === '1y_all' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-600 text-white">最佳推薦</span>
                          )}
                        </td>
                      </tr>

                      {/* 3年無預付 */}
                      <tr className={inspectingAccount.bestPlanKey === '3y_no' ? 'bg-indigo-950/30' : ''}>
                        <td className="p-2.5 font-sans font-semibold text-indigo-300">RI/SP 3年無預付</td>
                        <td className="p-2.5 text-center">{formatPercent(rates.threeYearNoUpfront * 100)}</td>
                        <td className="p-2.5 text-right">${formatNumber(inspectingAccount.eligibleCost * (1 - rates.threeYearNoUpfront))}</td>
                        <td className="p-2.5 text-right text-amber-300/90">${formatNumber(inspectingAccount.nonEligibleCost)} (原價)</td>
                        <td className="p-2.5 text-right font-bold text-white">${formatNumber(inspectingAccount.cost3YNoUpfront)}</td>
                        <td className="p-2.5 text-right text-emerald-400">-${formatNumber(inspectingAccount.savings3YNoUpfront)}</td>
                        <td className="p-2.5 text-right">
                          <span className={inspectingAccount.netDiff3YNoUpfront > 0 ? 'text-emerald-400 font-bold' : 'text-rose-400'}>
                            {inspectingAccount.netDiff3YNoUpfront > 0 ? `+${formatNumber(inspectingAccount.netDiff3YNoUpfront)}` : formatNumber(inspectingAccount.netDiff3YNoUpfront)}
                          </span>
                        </td>
                        <td className="p-2.5 text-center font-sans">
                          {inspectingAccount.bestPlanKey === '3y_no' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-600 text-white">最佳推薦</span>
                          )}
                        </td>
                      </tr>

                      {/* 3年全預付 */}
                      <tr className={inspectingAccount.bestPlanKey === '3y_all' ? 'bg-indigo-950/30' : ''}>
                        <td className="p-2.5 font-sans font-semibold text-indigo-300">RI/SP 3年全預付</td>
                        <td className="p-2.5 text-center">{formatPercent(rates.threeYearAllUpfront * 100)}</td>
                        <td className="p-2.5 text-right">${formatNumber(inspectingAccount.eligibleCost * (1 - rates.threeYearAllUpfront))}</td>
                        <td className="p-2.5 text-right text-amber-300/90">${formatNumber(inspectingAccount.nonEligibleCost)} (原價)</td>
                        <td className="p-2.5 text-right font-bold text-white">${formatNumber(inspectingAccount.cost3YAllUpfront)}</td>
                        <td className="p-2.5 text-right text-emerald-400">-${formatNumber(inspectingAccount.savings3YAllUpfront)}</td>
                        <td className="p-2.5 text-right">
                          <span className={inspectingAccount.netDiff3YAllUpfront > 0 ? 'text-emerald-400 font-bold' : 'text-rose-400'}>
                            {inspectingAccount.netDiff3YAllUpfront > 0 ? `+${formatNumber(inspectingAccount.netDiff3YAllUpfront)}` : formatNumber(inspectingAccount.netDiff3YAllUpfront)}
                          </span>
                        </td>
                        <td className="p-2.5 text-center font-sans">
                          {inspectingAccount.bestPlanKey === '3y_all' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-600 text-white">最佳推薦</span>
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 該帳號各項服務明細 */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-300 mb-2">
                  服務明細清單 (共 {inspectingAccount.services.length} 項產品)
                </h4>
                <div className="max-h-60 overflow-y-auto rounded-xl border border-gray-700">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-gray-900 text-gray-400 uppercase text-[11px] sticky top-0">
                      <tr>
                        <th className="p-2.5">產品名稱 (Product Name)</th>
                        <th className="p-2.5 text-center">RI/SP 適用性</th>
                        <th className="p-2.5 text-right">原幣花費 ($USD)</th>
                        <th className="p-2.5 text-right">佔比 (%)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700/60 font-mono text-gray-200">
                      {inspectingAccount.services.map((srv, idx) => (
                        <tr key={idx} className="hover:bg-gray-750/50">
                          <td className="p-2.5 font-sans font-medium text-gray-200">
                            {srv.productName}
                          </td>
                          <td className="p-2.5 text-center font-sans">
                            {srv.isEligible ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-900/60 text-cyan-300 border border-cyan-500/40">
                                ✓ 適用 RI/SP
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-gray-800 text-gray-400 border border-gray-700">
                                非適用 (維持原價)
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 text-right font-semibold">
                            ${formatNumber(srv.cost)}
                          </td>
                          <td className="p-2.5 text-right text-gray-400">
                            {formatPercent(inspectingAccount.totalCost > 0 ? (srv.cost / inspectingAccount.totalCost) * 100 : 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 bg-gray-800 border-t border-gray-700 flex justify-end">
              <button
                type="button"
                onClick={() => setInspectingAccount(null)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RiSpAnalysisSection;
