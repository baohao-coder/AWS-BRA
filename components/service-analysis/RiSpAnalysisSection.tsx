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

export type RiSpPlanKey = '1y_no' | '1y_all' | '3y_no' | '3y_all';

export const PLAN_NAMES: Record<RiSpPlanKey | 'edp' | 'none', string> = {
  '1y_no': 'RI/SP 1年無預付',
  '1y_all': 'RI/SP 1年全預付',
  '3y_no': 'RI/SP 3年無預付',
  '3y_all': 'RI/SP 3年全預付',
  'edp': 'EDP 75折',
  'none': '未購買 RI/SP'
};

export interface ServiceItemCost {
  productName: string;
  cost: number;
  isEligible: boolean;
  categoryName?: string;
}

export type AdjustmentActionType = 
  | 'UPGRADE_3Y'       // 建議升級至 3 年全預付
  | 'EXIT_TO_EDP'      // 建議到期轉 EDP 75折，不再續約 RI/SP
  | 'EXPAND_COVERAGE'  // 建議追加承諾量提高覆蓋率
  | 'KEEP_CURRENT'     // 現況配置良好，建議維持
  | 'NEW_PURCHASE'     // 尚未購買，建議新購 RI/SP
  | 'KEEP_EDP';        // 尚未購買，維持 EDP 75折最划算

export interface ExistingRiSpDiagnosis {
  hasPurchased: boolean;
  isAutoDetected: boolean;
  detectedFeatures: string[];
  detectedFee: number;
  currentPlanKey: RiSpPlanKey | 'none';
  currentPlanName: string;
  currentCost: number; // Spend under current configuration
  
  // Adjustment Advice
  needsAdjustment: boolean;
  adjustmentAction: AdjustmentActionType;
  badgeLabel: string;
  badgeColorClass: string;
  summaryText: string;
  detailReason: string;
  actionSteps: string[];
  potentialMonthlySavingsVsCurrent: number; // Potential savings compared to current cost
}

export interface AccountRiSpEvaluation {
  accountId: string;
  accountName: string;
  totalCost: number; // On-demand original cost
  eligibleCost: number; // Spend on Compute/DB eligible for RI/SP
  nonEligibleCost: number; // Other spend (Storage, Data Transfer, AI, etc.)
  eligibleRatio: number; // % of spend that is eligible
  
  // Existing RI/SP status & adjustment recommendation
  existingDiagnosis: ExistingRiSpDiagnosis;

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

  // Net difference vs EDP (costEdp - costPlan: positive means cheaper than EDP)
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

interface AccountOverride {
  hasPurchased: boolean;
  planKey: RiSpPlanKey;
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

// Detect whether an account's services/details show evidence of active RI or Savings Plans
const detectAccountRiSpFeatures = (accountServices: { productName: string; totalCost: number; details?: any[] }[]): {
  hasPurchased: boolean;
  features: string[];
  detectedFee: number;
  inferredPlan: RiSpPlanKey;
} => {
  const features: string[] = [];
  let detectedFee = 0;
  let inferredPlan: RiSpPlanKey = '1y_no';

  accountServices.forEach(srv => {
    const pName = (srv.productName || '').toLowerCase();
    
    // Check product names
    if (
      pName.includes('savings plan') || 
      pName.includes('savingsplans') || 
      pName.includes('compute savings') || 
      pName.includes('ec2 instance savings')
    ) {
      features.push(`產品含【${srv.productName}】`);
      detectedFee += Math.abs(srv.totalCost || 0);
    } else if (pName.includes('reserved instance') || pName.includes('heavyusage')) {
      features.push(`產品含【${srv.productName}】預留項目`);
      detectedFee += Math.abs(srv.totalCost || 0);
    }

    // Check detail lines if present
    if (srv.details && Array.isArray(srv.details)) {
      srv.details.forEach(det => {
        const uType = (det.usageType || '').toLowerCase();
        const desc = (det.itemDescription || '').toLowerCase();

        if (
          uType.includes('savingsplan') || 
          uType.includes('savings plan') || 
          desc.includes('savings plan') ||
          uType.includes('coveredusage')
        ) {
          if (!features.some(f => f.includes('Savings Plan 抵扣'))) {
            features.push('計費明細含 Savings Plan 抵扣/承諾紀錄');
          }
          if (det.totalCost < 0) {
            detectedFee += Math.abs(det.totalCost);
          }
        }

        if (
          uType.includes('heavyusage') || 
          desc.includes('reserved instance') || 
          desc.includes('ri fee') || 
          uType.includes('reservation')
        ) {
          if (!features.some(f => f.includes('Reserved Instance 訂閱'))) {
            features.push('計費明細含 Reserved Instance 訂閱紀錄');
          }
        }

        // Infer plan duration from line item text
        if (desc.includes('3 yr') || desc.includes('3 year') || desc.includes('3年')) {
          inferredPlan = (desc.includes('all upfront') || desc.includes('全預付')) ? '3y_all' : '3y_no';
        } else if (desc.includes('all upfront') || desc.includes('全預付')) {
          inferredPlan = '1y_all';
        }
      });
    }
  });

  return {
    hasPurchased: features.length > 0,
    features,
    detectedFee,
    inferredPlan
  };
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
  
  // User overrides for account RI/SP status (allows manual adjustment & simulation)
  const [accountOverrides, setAccountOverrides] = useState<Record<string, AccountOverride>>({});

  // Search and filter state for table
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PURCHASED_ALL' | 'PURCHASED_NEED_ADJUST' | 'PURCHASED_KEEP' | 'NOT_PURCHASED' | 'EDP' | 'RISP'>('ALL');
  const [sortField, setSortField] = useState<'totalCost' | 'eligibleRatio' | 'bestSavings' | 'netDiffEdp' | 'accountName' | 'status'>('totalCost');
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

  // Toggle account purchased status manually
  const handleToggleAccountPurchased = (accountId: string, currentlyPurchased: boolean, defaultPlan: RiSpPlanKey = '1y_no') => {
    setAccountOverrides(prev => ({
      ...prev,
      [accountId]: {
        hasPurchased: !currentlyPurchased,
        planKey: defaultPlan
      }
    }));
  };

  // Change account plan manually
  const handleChangeAccountPlan = (accountId: string, planKey: RiSpPlanKey) => {
    setAccountOverrides(prev => ({
      ...prev,
      [accountId]: {
        hasPurchased: true,
        planKey
      }
    }));
  };

  // Reset all overrides back to auto-detection
  const handleResetOverrides = () => {
    setAccountOverrides({});
  };

  // Batch simulate: set all to purchased 1Y No-Upfront
  const handleBatchSetAllPurchased = (planKey: RiSpPlanKey = '1y_no') => {
    const newOverrides: Record<string, AccountOverride> = {};
    evaluationResults.forEach(acc => {
      newOverrides[acc.accountId] = {
        hasPurchased: true,
        planKey
      };
    });
    setAccountOverrides(newOverrides);
  };

  // Perform RI/SP vs EDP Evaluation for all accounts based on current mode, rates, and existing status
  const evaluationResults = useMemo(() => {
    // 1. Gather all accounts depending on analysisMode
    const accAggregateMap = new Map<string, {
      accountId: string;
      accountName: string;
      servicesMap: Map<string, number>;
      rawServicesList: { productName: string; totalCost: number; details?: any[] }[];
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
            rawServicesList: [],
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
              record.rawServicesList.push(srv);
            }
          });
        } else if (typeof acc.totalAmount === 'number' && acc.totalAmount > 0) {
          record.totalAmount += acc.totalAmount;
        }
      });
    });

    // 2. Evaluate each account under pricing rules & existing contract diagnosis
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

      // Candidate options for theoretical best plan
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
      const netSavingsVsEdp = costEdp - best.cost;

      // Theoretical recommendation reason
      let recommendationReason = '';
      if (best.type === 'EDP') {
        recommendationReason = `非適用服務佔比達 ${(100 - eligibleRatio).toFixed(1)}%。若購買 RI/SP，非適用服務將失去 25% EDP 折扣而需付全額原價，抵扣後全帳號採 EDP 75折更省。`;
      } else {
        recommendationReason = `適用服務佔比達 ${eligibleRatio.toFixed(1)}%，該方案高折扣率節省的金額遠超非適用服務恢復原價之差額，比走 EDP 可再省 $${formatNumber(netSavingsVsEdp)}。`;
      }

      // =========================================================================
      // 3. 檢查該帳號是否已經有買 RI/SP，並進行具體調整分析建議
      // =========================================================================
      const autoDetection = detectAccountRiSpFeatures(record.rawServicesList);
      const manualOverride = accountOverrides[record.accountId];

      const hasPurchased = manualOverride !== undefined ? manualOverride.hasPurchased : autoDetection.hasPurchased;
      const isAutoDetected = manualOverride === undefined;
      const currentPlanKey: RiSpPlanKey | 'none' = hasPurchased 
        ? (manualOverride?.planKey || autoDetection.inferredPlan || '1y_no')
        : 'none';
      const currentPlanName = hasPurchased ? PLAN_NAMES[currentPlanKey] : '未購買 (全帳號採 EDP 75折)';

      // Calculate current actual spend
      let currentCost = totalCost;
      if (hasPurchased) {
        if (currentPlanKey === '1y_no') currentCost = cost1YNoUpfront;
        else if (currentPlanKey === '1y_all') currentCost = cost1YAllUpfront;
        else if (currentPlanKey === '3y_no') currentCost = cost3YNoUpfront;
        else if (currentPlanKey === '3y_all') currentCost = cost3YAllUpfront;
        else currentCost = cost1YNoUpfront;
      } else {
        currentCost = costEdp; // Not purchased -> pay EDP
      }

      // Determine Adjustment Action & Rationale
      let needsAdjustment = false;
      let adjustmentAction: AdjustmentActionType = 'KEEP_CURRENT';
      let badgeLabel = '✅ 維持現狀';
      let badgeColorClass = 'bg-emerald-900/40 text-emerald-300 border-emerald-500/50';
      let summaryText = '現行方案配置健康，與工作負載高度匹配，建議維持現狀。';
      let detailReason = '';
      let actionSteps: string[] = [];
      let potentialMonthlySavingsVsCurrent = 0;

      if (hasPurchased) {
        // --- 帳號【已有購買 RI/SP】的情境診斷 ---
        
        // 情況 1: 買了 RI/SP 反而比走 EDP 75折貴！(因為非適用服務被懲罰支付 100% 原價)
        const lossVsEdp = currentCost - costEdp;
        if (lossVsEdp > 1.0) {
          needsAdjustment = true;
          adjustmentAction = 'EXIT_TO_EDP';
          badgeLabel = '⚠️ 建議到期轉 EDP 75折';
          badgeColorClass = 'bg-rose-900/50 text-rose-300 border-rose-500/60 animate-pulse';
          potentialMonthlySavingsVsCurrent = lossVsEdp;
          summaryText = `非適用服務龐大(佔 ${(100 - eligibleRatio).toFixed(1)}%)，目前走 RI/SP 每月比 EDP 多花 $${formatNumber(lossVsEdp)}，建議合約到期後停止續約改走全帳號 EDP 75折。`;
          detailReason = `【退場調整診斷】此帳號目前持有 ${currentPlanName}。由於非適用服務（如 S3、CloudFront、資料傳輸等）費用高達 $${formatNumber(nonEligibleCost)} USD，佔全帳號比重 ${(100 - eligibleRatio).toFixed(1)}%。根據計費規則，購買 RI/SP 後該些非適用服務無法享有 EDP 75折（需付 100% 原價），導致 RI/SP 省下的運算折扣不足以彌補非適用服務的原價差額，每月整體多付了 $${formatNumber(lossVsEdp)} USD。`;
          actionSteps = [
            `1. 進入 AWS Cost Management 盤點現有 RI / Savings Plans 之到期日 (Expiration Date)。`,
            `2. 關閉或設定到期後「不自動續約 (Do not renew)」。`,
            `3. 合約到期日起，全帳號所有服務自動回歸享有 EDP 75折優惠，預估每月立即節省 $${formatNumber(lossVsEdp)} USD。`
          ];
        } 
        // 情況 2: 目前持有 1年期或無預付，但負載穩定且 3年全預付能帶來巨大效益
        else if (best.key === '3y_all' && currentPlanKey !== '3y_all' && (currentCost - cost3YAllUpfront) > 5.0) {
          const upgradeSavings = currentCost - cost3YAllUpfront;
          needsAdjustment = true;
          adjustmentAction = 'UPGRADE_3Y';
          badgeLabel = '💡 建議升級 3年全預付';
          badgeColorClass = 'bg-cyan-900/50 text-cyan-300 border-cyan-500/60';
          potentialMonthlySavingsVsCurrent = upgradeSavings;
          summaryText = `運算負載佔比達 ${eligibleRatio.toFixed(1)}% 具高長期穩定度，建議現有方案到期後更換為【3年全預付】，每月可再額外淨省 $${formatNumber(upgradeSavings)}。`;
          detailReason = `【期程升級診斷】此帳號目前持有 ${currentPlanName}，核心運算/資料庫月花費達 $${formatNumber(eligibleCost)} USD (佔比 ${eligibleRatio.toFixed(1)}%)。目前 1年期或無預付之平均折扣率僅約 ${(rates[currentPlanKey === '1y_all' ? 'oneYearAllUpfront' : currentPlanKey === '3y_no' ? 'threeYearNoUpfront' : 'oneYearNoUpfront'] * 100).toFixed(0)}%。若將合約期程拉長為 3 年並改為全預付，折扣率將提升至 ${(rates.threeYearAllUpfront * 100).toFixed(0)}%，每月可由現況再多省 $${formatNumber(upgradeSavings)} USD。`;
          actionSteps = [
            `1. 確認此帳號承載之業務系統為中長期核心基礎架構（未來 2~3 年持續運作）。`,
            `2. 於目前 1 年期合約到期前 30 天，向財務申請 3 年全預付資本支出 (CapEx) 預算。`,
            `3. 轉換購買 Compute Savings Plans 3年全預付，每月可再降低成本 $${formatNumber(upgradeSavings)} USD。`
          ];
        }
        // 情況 3: 適用用量龐大但覆蓋率偏低
        else if (eligibleCost > 1000 && autoDetection.detectedFee > 0 && (autoDetection.detectedFee / eligibleCost) < 0.6) {
          needsAdjustment = true;
          adjustmentAction = 'EXPAND_COVERAGE';
          badgeLabel = '📈 建議加購提高覆蓋';
          badgeColorClass = 'bg-blue-900/50 text-blue-300 border-blue-500/60';
          potentialMonthlySavingsVsCurrent = (eligibleCost * 0.85 - autoDetection.detectedFee) * (rates.oneYearNoUpfront);
          summaryText = `適用服務月花費達 $${formatNumber(eligibleCost)}，但現有承諾量覆蓋偏低，建議追加每小時承諾額度將覆蓋率推升至 80%~90%。`;
          detailReason = `【承諾擴充診斷】該帳號已購 RI/SP，但現有承諾覆蓋率估算低於 60%，仍有大量運算負載以 On-Demand 原價溢流計費。建議適度追加承諾量，將覆蓋率提高至 85% 最佳甜蜜點。`;
          actionSteps = [
            `1. 開啟 AWS Cost Explorer 中的 Savings Plans Utilization & Coverage 報表。`,
            `2. 檢視過去 30 天 On-Demand 運算基準線 (Baseline)。`,
            `3. 追加每小時小額承諾量，將覆蓋率由現況提升至 85%，避免原價費用浪費。`
          ];
        }
        // 情況 4: 現況已經最優或差異極小
        else {
          needsAdjustment = false;
          adjustmentAction = 'KEEP_CURRENT';
          badgeLabel = '✅ 維持現狀 (配置健康)';
          badgeColorClass = 'bg-emerald-900/40 text-emerald-300 border-emerald-500/50';
          potentialMonthlySavingsVsCurrent = 0;
          summaryText = `現行 ${currentPlanName} 方案與用量模式契合度優良，比走 EDP 方案每月多省 $${formatNumber(Math.max(0, costEdp - currentCost))}，建議維持現行配置。`;
          detailReason = `【維持現況診斷】該帳號已購之 ${currentPlanName} 運作良好，適用運算佔比適中 (${eligibleRatio.toFixed(1)}%)，且比全帳號 EDP 方案更具經濟優勢。現階段無須調整，建議持續於每季監控負載波動即可。`;
          actionSteps = [
            `1. 維持目前方案與續約週期。`,
            `2. 建立 CloudWatch 成本預算警報，當用量波動超過 15% 時再重新評估。`
          ];
        }
      } else {
        // --- 帳號【尚未購買 RI/SP】的情境診斷 ---
        if (best.type === 'RISP' && netSavingsVsEdp > 5.0) {
          needsAdjustment = true;
          adjustmentAction = 'NEW_PURCHASE';
          badgeLabel = '🚀 建議新購 RI/SP';
          badgeColorClass = 'bg-indigo-900/50 text-indigo-300 border-indigo-500/60';
          potentialMonthlySavingsVsCurrent = netSavingsVsEdp;
          summaryText = `尚未購買 RI/SP，核心適用運算高達 ${eligibleRatio.toFixed(1)}%，建議新購【${best.name}】，可比目前 EDP 方案再多省 $${formatNumber(netSavingsVsEdp)}。`;
          detailReason = `【新購建議】目前尚未購買任何 RI/SP（享受 EDP 75折）。經精算，此帳號適用服務佔比達 ${eligibleRatio.toFixed(1)}% ($${formatNumber(eligibleCost)} USD)，購買【${best.name}】後，即便非適用服務恢復原價，整體全帳號支出仍比 EDP 75折每月再省 $${formatNumber(netSavingsVsEdp)} USD。`;
          actionSteps = [
            `1. 推薦優先採購方案：${best.name}。`,
            `2. 預計每月比目前支出多節省 $${formatNumber(netSavingsVsEdp)} USD (年省約 $${formatNumber(netSavingsVsEdp * 12)} USD)。`,
            `3. 評估採用 Compute Savings Plans 以維持靈活性。`
          ];
        } else {
          needsAdjustment = false;
          adjustmentAction = 'KEEP_EDP';
          badgeLabel = '🛡️ 維持 EDP 75折';
          badgeColorClass = 'bg-purple-900/40 text-purple-300 border-purple-500/50';
          potentialMonthlySavingsVsCurrent = 0;
          summaryText = `尚未購買 RI/SP，非適用服務佔比達 ${(100 - eligibleRatio).toFixed(1)}%，維持全帳號 EDP 75折最為划算，不需購買 RI/SP。`;
          detailReason = `【維持 EDP 診斷】該帳號目前未買 RI/SP，由於非適用服務高達 $${formatNumber(nonEligibleCost)} USD (${(100 - eligibleRatio).toFixed(1)}%)，若購買 RI/SP 該些服務失去 EDP 75折後整體花費反而增加。因此維持現狀享受全帳號 EDP 75折為最優策略。`;
          actionSteps = [
            `1. 維持不購買 RI/SP 狀態。`,
            `2. 確保帳號已綁定在公司 EDP 主約涵蓋範圍內享有全額 75 折。`
          ];
        }
      }

      evals.push({
        accountId: record.accountId,
        accountName: record.accountName,
        totalCost,
        eligibleCost,
        nonEligibleCost,
        eligibleRatio,
        existingDiagnosis: {
          hasPurchased,
          isAutoDetected,
          detectedFeatures: autoDetection.features,
          detectedFee: autoDetection.detectedFee,
          currentPlanKey,
          currentPlanName,
          currentCost,
          needsAdjustment,
          adjustmentAction,
          badgeLabel,
          badgeColorClass,
          summaryText,
          detailReason,
          actionSteps,
          potentialMonthlySavingsVsCurrent
        },
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
  }, [data, selectedMonth, analysisMode, rates, includeDbInEligible, accountOverrides]);

  // Overall KPI aggregates across all evaluated accounts
  const summaryKpis = useMemo(() => {
    let totalOnDemand = 0;
    let totalEligible = 0;
    let totalNonEligible = 0;
    let totalEdpCost = 0;
    let totalOptimalCost = 0;
    let totalCurrentSpend = 0;
    let totalPotentialAdjustmentSavings = 0;

    let purchasedCount = 0;
    let notPurchasedCount = 0;
    let purchasedNeedAdjustCount = 0;
    let purchasedKeepCount = 0;
    let exitToEdpCount = 0;
    let upgrade3YCount = 0;
    let expandCoverageCount = 0;
    let newPurchaseRispCount = 0;

    evaluationResults.forEach(item => {
      totalOnDemand += item.totalCost;
      totalEligible += item.eligibleCost;
      totalNonEligible += item.nonEligibleCost;
      totalEdpCost += item.costEdp;
      totalOptimalCost += item.bestCost;
      totalCurrentSpend += item.existingDiagnosis.currentCost;
      totalPotentialAdjustmentSavings += item.existingDiagnosis.potentialMonthlySavingsVsCurrent;

      if (item.existingDiagnosis.hasPurchased) {
        purchasedCount++;
        if (item.existingDiagnosis.needsAdjustment) {
          purchasedNeedAdjustCount++;
          if (item.existingDiagnosis.adjustmentAction === 'EXIT_TO_EDP') exitToEdpCount++;
          else if (item.existingDiagnosis.adjustmentAction === 'UPGRADE_3Y') upgrade3YCount++;
          else if (item.existingDiagnosis.adjustmentAction === 'EXPAND_COVERAGE') expandCoverageCount++;
        } else {
          purchasedKeepCount++;
        }
      } else {
        notPurchasedCount++;
        if (item.existingDiagnosis.adjustmentAction === 'NEW_PURCHASE') newPurchaseRispCount++;
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
      totalCurrentSpend,
      totalPotentialAdjustmentSavings,
      edpSavings,
      optimalSavingsVsOnDemand,
      optimalExtraSavingsVsEdp,
      purchasedCount,
      notPurchasedCount,
      purchasedNeedAdjustCount,
      purchasedKeepCount,
      exitToEdpCount,
      upgrade3YCount,
      expandCoverageCount,
      newPurchaseRispCount
    };
  }, [evaluationResults]);

  // Filtered and sorted evaluation list for display in table
  const displayedEvaluations = useMemo(() => {
    let list = [...evaluationResults];

    // Filter by status filter
    if (statusFilter === 'PURCHASED_ALL') {
      list = list.filter(item => item.existingDiagnosis.hasPurchased);
    } else if (statusFilter === 'PURCHASED_NEED_ADJUST') {
      list = list.filter(item => item.existingDiagnosis.hasPurchased && item.existingDiagnosis.needsAdjustment);
    } else if (statusFilter === 'PURCHASED_KEEP') {
      list = list.filter(item => item.existingDiagnosis.hasPurchased && !item.existingDiagnosis.needsAdjustment);
    } else if (statusFilter === 'NOT_PURCHASED') {
      list = list.filter(item => !item.existingDiagnosis.hasPurchased);
    } else if (statusFilter === 'EDP') {
      list = list.filter(item => item.recommendationType === 'EDP');
    } else if (statusFilter === 'RISP') {
      list = list.filter(item => item.recommendationType === 'RISP');
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(item => 
        item.accountName.toLowerCase().includes(q) || 
        item.accountId.toLowerCase().includes(q) ||
        item.existingDiagnosis.summaryText.toLowerCase().includes(q)
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
        case 'status':
          comparison = (a.existingDiagnosis.hasPurchased ? 1 : 0) - (b.existingDiagnosis.hasPurchased ? 1 : 0);
          break;
        default:
          comparison = b.totalCost - a.totalCost;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return list;
  }, [evaluationResults, statusFilter, searchQuery, sortField, sortDirection]);

  // Handle Excel Export
  const handleExportToExcel = () => {
    if (evaluationResults.length === 0) {
      alert('無可匯出資料');
      return;
    }

    const exportRows = evaluationResults.map(item => ({
      '帳號 ID (Account ID)': item.accountId,
      '帳號名稱 (Account Name)': item.accountName,
      '是否已購 RI/SP': item.existingDiagnosis.hasPurchased ? '是 (已購買)' : '否 (未購買)',
      '既有 RI/SP 方案': item.existingDiagnosis.currentPlanName,
      '是否建議調整': item.existingDiagnosis.needsAdjustment ? '是 (建議調整)' : '否 (維持現狀)',
      '調整建議標籤': item.existingDiagnosis.badgeLabel,
      '調整建議摘要': item.existingDiagnosis.summaryText,
      '現況預估支出 ($USD)': Number(item.existingDiagnosis.currentCost.toFixed(2)),
      '調整後預估效益 ($USD/月)': Number(item.existingDiagnosis.potentialMonthlySavingsVsCurrent.toFixed(2)),
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
      '是否已購 RI/SP': `已購: ${summaryKpis.purchasedCount} 個 / 未購: ${summaryKpis.notPurchasedCount} 個`,
      '既有 RI/SP 方案': '-',
      '是否建議調整': `需調整: ${summaryKpis.purchasedNeedAdjustCount + summaryKpis.newPurchaseRispCount} 個`,
      '調整建議標籤': `到期轉EDP: ${summaryKpis.exitToEdpCount} | 升級3Y: ${summaryKpis.upgrade3YCount} | 新購: ${summaryKpis.newPurchaseRispCount}`,
      '調整建議摘要': `調整後每月預估可再省 $${formatNumber(summaryKpis.totalPotentialAdjustmentSavings)} USD`,
      '現況預估支出 ($USD)': Number(summaryKpis.totalCurrentSpend.toFixed(2)),
      '調整後預估效益 ($USD/月)': Number(summaryKpis.totalPotentialAdjustmentSavings.toFixed(2)),
      '原幣花費總計 ($USD)': Number(summaryKpis.totalOnDemand.toFixed(2)),
      'RI/SP 適用服務花費 ($USD)': Number(summaryKpis.totalEligible.toFixed(2)),
      '非適用服務花費 ($USD)': Number(summaryKpis.totalNonEligible.toFixed(2)),
      '適用服務佔比 (%)': Number(summaryKpis.avgEligibleRatio.toFixed(2)),
      'EDP 75折方案費用 ($USD)': Number(summaryKpis.totalEdpCost.toFixed(2)),
      '1年無預付方案費用 ($USD)': Number(evaluationResults.reduce((s, i) => s + i.cost1YNoUpfront, 0).toFixed(2)),
      '1年全預付方案費用 ($USD)': Number(evaluationResults.reduce((s, i) => s + i.cost1YAllUpfront, 0).toFixed(2)),
      '3年無預付方案費用 ($USD)': Number(evaluationResults.reduce((s, i) => s + i.cost3YNoUpfront, 0).toFixed(2)),
      '3年全預付方案費用 ($USD)': Number(evaluationResults.reduce((s, i) => s + i.cost3YAllUpfront, 0).toFixed(2)),
      '最優推薦方案': '各帳號最適配置混合策略',
      '推薦方案支出 ($USD)': Number(summaryKpis.totalOptimalCost.toFixed(2)),
      'vs 原價節省金額 ($USD)': Number(summaryKpis.optimalSavingsVsOnDemand.toFixed(2)),
      'vs 原價節省率 (%)': Number((summaryKpis.totalOnDemand > 0 ? (summaryKpis.optimalSavingsVsOnDemand / summaryKpis.totalOnDemand) * 100 : 0).toFixed(2)),
      'vs EDP 額外淨省 ($USD)': Number(summaryKpis.optimalExtraSavingsVsEdp.toFixed(2)),
      '1年期最優方案': '-',
      '1年期最優費用 ($USD)': Number(evaluationResults.reduce((s, i) => s + i.best1YearCost, 0).toFixed(2)),
      '3年期最優方案': '-',
      '3年期最優費用 ($USD)': Number(evaluationResults.reduce((s, i) => s + i.best3YearCost, 0).toFixed(2)),
      '決策建議理由': `依各帳號已購診斷調整後，相較現況每月可再創造 $${formatNumber(summaryKpis.totalPotentialAdjustmentSavings)} USD 節省效益`
    });

    const filePrefix = analysisMode === 'monthly' ? `AWS_RISP_Existing_Adjustment_Report_${selectedMonth}` : 'AWS_RISP_Existing_Adjustment_Report_AllTime';
    exportToExcel(exportRows, filePrefix);
  };

  const handleSort = (field: 'totalCost' | 'eligibleRatio' | 'bestSavings' | 'netDiffEdp' | 'accountName' | 'status') => {
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
              <span className="p-2 bg-blue-600/30 text-blue-400 rounded-xl text-xl">🎯</span>
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  RI / Savings Plans 既有合約檢查與調整建議分析
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-400/30">
                    現況檢查 ➔ 是否要調整 ➔ 最佳行動路徑
                  </span>
                </h3>
                <p className="text-xs text-blue-200/80 mt-0.5">
                  自動辨識各帳號是否已購買 RI/SP，精準診斷現況（覆蓋率、非適用服務原價懲罰），並給出具體調整建議（如：到期轉 EDP 75折、升級 3年全預付、追加承諾量）。
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs pt-1">
              <div className="bg-gray-900/70 p-3 rounded-xl border border-gray-800 flex items-start gap-2.5">
                <span className="text-emerald-400 font-bold text-sm">步驟 1</span>
                <div>
                  <span className="font-semibold text-emerald-300">檢查是否已買 RI/SP</span>
                  <p className="text-gray-300 mt-0.5">
                    自動檢查計費明細中之 Savings Plans / Reserved Instances 行項與抵扣，並支援自訂標記。
                  </p>
                </div>
              </div>

              <div className="bg-gray-900/70 p-3 rounded-xl border border-gray-800 flex items-start gap-2.5">
                <span className="text-cyan-400 font-bold text-sm">步驟 2</span>
                <div>
                  <span className="font-semibold text-cyan-300">分析現況合理性</span>
                  <p className="text-gray-300 mt-0.5">
                    比對「現行方案花費」vs「全帳號 EDP 75折」vs「3年全預付最優解」，檢驗是否存在非適用服務懲罰或方案低效。
                  </p>
                </div>
              </div>

              <div className="bg-gray-900/70 p-3 rounded-xl border border-gray-800 flex items-start gap-2.5">
                <span className="text-purple-400 font-bold text-sm">步驟 3</span>
                <div>
                  <span className="font-semibold text-purple-300">產出調整建議與步驟</span>
                  <p className="text-gray-300 mt-0.5">
                    給予具體建議：維持現狀、合約到期不續約轉 EDP 75折、或升級更換為 3 年全預付以放大年省效益。
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
        {/* 上半部：時間維度、涵蓋範圍與模擬切換 */}
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
                  Compute + 資料庫
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
                  僅純 Compute
                </button>
              </div>
            </div>
          </div>

          {/* 快速模擬控制項 */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-400 font-semibold">既有狀態模擬:</span>
            <button
              type="button"
              onClick={handleResetOverrides}
              className="px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded-lg text-xs font-medium border border-gray-600 transition-colors"
              title="清除手動覆蓋，還原系統依計費明細自動偵測"
            >
              🔄 還原自動偵測
            </button>
            <button
              type="button"
              onClick={() => handleBatchSetAllPurchased('1y_no')}
              className="px-2.5 py-1 bg-blue-900/50 hover:bg-blue-800/60 text-blue-300 rounded-lg text-xs font-medium border border-blue-500/40 transition-colors"
              title="模擬將全部帳號標記為已購買 1年無預付方案"
            >
              模擬全帳號已購(1年無預付)
            </button>
          </div>
        </div>

        {/* 下半部：方案折扣率設定 */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-300 uppercase tracking-wide">
                方案基準折扣率設定 (可調整參數):
              </span>
              <span className="text-xs text-gray-400">
                系統將即時套用最新折扣率重新評估各帳號之最適方案與調整建議
              </span>
            </div>

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
                未購 RI/SP 者全額適用
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
        {/* 卡片 1: 既有 RI/SP 持有現況 */}
        <div className="bg-gray-800 p-5 rounded-2xl border border-gray-700 shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">
              <span>帳號既有 RI/SP 狀態</span>
              <span className="text-cyan-400">🔍 檢查診斷</span>
            </div>
            <div className="text-3xl font-extrabold text-white">
              {summaryKpis.purchasedCount} <span className="text-sm font-normal text-gray-400">個已購買</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-700/80 flex items-center justify-between text-xs">
            <span className="text-cyan-300 font-semibold">
              已購佔比: {formatPercent(summaryKpis.totalAccounts > 0 ? (summaryKpis.purchasedCount / summaryKpis.totalAccounts) * 100 : 0)}
            </span>
            <span className="text-gray-400">
              未購: {summaryKpis.notPurchasedCount} 個
            </span>
          </div>
        </div>

        {/* 卡片 2: 是否要調整帳號分佈 */}
        <div className="bg-gray-800 p-5 rounded-2xl border border-gray-700 shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">
              <span>已購帳號調整建議</span>
              <span className="text-amber-400">⚠️ 調整需求</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-amber-400">
                {summaryKpis.purchasedNeedAdjustCount}
              </span>
              <span className="text-xs text-gray-400 font-normal">個需調整 / {summaryKpis.purchasedKeepCount} 個維持</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-700/80 text-[11px] text-gray-300 flex flex-wrap gap-2 justify-between">
            <span className="text-rose-400 font-semibold">到期轉EDP: {summaryKpis.exitToEdpCount}</span>
            <span className="text-cyan-300 font-semibold">升級3年: {summaryKpis.upgrade3YCount}</span>
            <span className="text-blue-300 font-semibold">加購覆蓋: {summaryKpis.expandCoverageCount}</span>
          </div>
        </div>

        {/* 卡片 3: 現況預估花費 vs 最優花費 */}
        <div className="bg-gray-800 p-5 rounded-2xl border border-gray-700 shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">
              <span>現況支出 vs 最優支出</span>
              <span className="text-purple-400">💰 支出水位</span>
            </div>
            <div className="text-2xl font-extrabold text-purple-300">
              ${formatNumber(summaryKpis.totalCurrentSpend)}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-700/80 text-xs text-gray-400 flex justify-between">
            <span>最佳化後支出:</span>
            <span className="font-semibold text-emerald-400">
              ${formatNumber(summaryKpis.totalOptimalCost)}
            </span>
          </div>
        </div>

        {/* 卡片 4: 執行調整後預估再省效益 */}
        <div className="bg-gradient-to-br from-emerald-950/40 via-gray-800 to-teal-950/40 p-5 rounded-2xl border border-emerald-500/50 shadow-md flex flex-col justify-between ring-1 ring-emerald-500/30">
          <div>
            <div className="flex items-center justify-between text-emerald-400 text-xs font-bold uppercase tracking-wider mb-2">
              <span>執行調整預估額外創造效益</span>
              <span className="bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full text-[10px] font-bold border border-emerald-400/40">
                ⭐ 調整紅利
              </span>
            </div>
            <div className="text-2xl font-extrabold text-emerald-400">
              +${formatNumber(summaryKpis.totalPotentialAdjustmentSavings)}
              <span className="text-xs text-emerald-300 font-normal ml-1">/月</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-emerald-800/60 text-xs flex items-center justify-between">
            <span className="text-gray-300">預估年化再省:</span>
            <span className="font-bold text-emerald-300 text-sm">
              +${formatNumber(summaryKpis.totalPotentialAdjustmentSavings * 12)} /年
            </span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. 各帳號分析與建議決策表格 (Account Detail & Decision Table) */}
      {/* ========================================================================= */}
      <Card
        title={`全部帳號 RI/SP 既有狀態檢查與調整建議清單 ${analysisMode === 'monthly' ? `(${selectedMonth})` : '(全期間累計)'}`}
        actionButton={
          <button
            type="button"
            onClick={handleExportToExcel}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-xl text-xs transition-all shadow hover:shadow-lg flex items-center gap-2 cursor-pointer"
          >
            <span>📥 匯出 RI/SP 檢查與調整建議 Excel</span>
          </button>
        }
      >
        <div className="space-y-4">
          {/* 搜尋與篩選列 */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-900/60 p-3 rounded-xl border border-gray-700/60">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {/* 搜尋帳號 */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="搜尋帳號名稱、ID 或調整建議..."
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

              {/* 狀態篩選膠囊按鈕 */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setStatusFilter('ALL')}
                  className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                    statusFilter === 'ALL'
                      ? 'bg-blue-600 text-white border-blue-500 shadow'
                      : 'bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-750'
                  }`}
                >
                  全部 ({evaluationResults.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('PURCHASED_NEED_ADJUST')}
                  className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                    statusFilter === 'PURCHASED_NEED_ADJUST'
                      ? 'bg-amber-600 text-white border-amber-500 shadow'
                      : 'bg-gray-800 text-amber-400 border-gray-700 hover:bg-gray-750'
                  }`}
                >
                  已購【建議調整】({summaryKpis.purchasedNeedAdjustCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('PURCHASED_KEEP')}
                  className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                    statusFilter === 'PURCHASED_KEEP'
                      ? 'bg-emerald-600 text-white border-emerald-500 shadow'
                      : 'bg-gray-800 text-emerald-400 border-gray-700 hover:bg-gray-750'
                  }`}
                >
                  已購【維持現狀】({summaryKpis.purchasedKeepCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('NOT_PURCHASED')}
                  className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                    statusFilter === 'NOT_PURCHASED'
                      ? 'bg-purple-600 text-white border-purple-500 shadow'
                      : 'bg-gray-800 text-purple-300 border-gray-700 hover:bg-gray-750'
                  }`}
                >
                  未購 RI/SP ({summaryKpis.notPurchasedCount})
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
                    className="p-3 font-semibold text-center cursor-pointer hover:text-white"
                    onClick={() => handleSort('status')}
                    title="系統自動偵測或手動設定之既有 RI/SP 狀態"
                  >
                    既有 RI/SP 狀態 {sortField === 'status' && (sortDirection === 'asc' ? '▲' : '▼')}
                  </th>
                  <th className="p-3 font-semibold text-center min-w-[200px]">
                    是否要調整？(調整診斷建議)
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
                    title="適用 RI/SP 服務花費佔比"
                  >
                    適用服務佔比 {sortField === 'eligibleRatio' && (sortDirection === 'asc' ? '▲' : '▼')}
                  </th>
                  <th className="p-3 font-semibold text-right text-gray-300 bg-gray-800/40">
                    現況預估花費
                  </th>
                  <th className="p-3 font-semibold text-right text-purple-300 bg-purple-950/20">
                    EDP 75折
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
                  <th className="p-3 font-semibold text-right text-emerald-400 bg-emerald-950/10">
                    調整後預估效益
                  </th>
                  <th className="p-3 font-semibold text-center">
                    查看計算與調整
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/60 font-mono text-gray-200">
                {displayedEvaluations.map((item) => {
                  const diag = item.existingDiagnosis;
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

                      {/* 既有 RI/SP 狀態 (可切換) */}
                      <td className="p-3 text-center font-sans">
                        <div className="flex flex-col items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleToggleAccountPurchased(item.accountId, diag.hasPurchased, '1y_no')}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all cursor-pointer flex items-center gap-1 ${
                              diag.hasPurchased
                                ? 'bg-cyan-900/50 text-cyan-200 border-cyan-500/60 hover:bg-cyan-800/60'
                                : 'bg-gray-800 text-gray-400 border-gray-600 hover:bg-gray-700'
                            }`}
                            title="點擊可切換此帳號之 RI/SP 購買狀態"
                          >
                            <span>{diag.hasPurchased ? '✓ 已購買' : '✕ 未購買'}</span>
                          </button>
                          {diag.hasPurchased && (
                            <span className="text-[10px] text-cyan-400/90 font-mono">
                              {diag.currentPlanName.replace('RI/SP ', '')}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 是否要調整？(調整診斷建議) */}
                      <td className="p-3 font-sans">
                        <div className="flex flex-col gap-1 max-w-xs">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border w-fit ${diag.badgeColorClass}`}>
                            {diag.badgeLabel}
                          </span>
                          <span className="text-[11px] text-gray-300 leading-tight">
                            {diag.summaryText}
                          </span>
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
                        <div className="w-16 h-1 bg-gray-700 rounded-full ml-auto mt-1 overflow-hidden">
                          <div
                            className={`h-full ${item.eligibleRatio >= 50 ? 'bg-cyan-400' : 'bg-gray-400'}`}
                            style={{ width: `${Math.min(100, item.eligibleRatio)}%` }}
                          />
                        </div>
                      </td>

                      {/* 現況預估花費 */}
                      <td className="p-3 text-right bg-gray-800/40 font-semibold text-gray-200">
                        ${formatNumber(diag.currentCost)}
                      </td>

                      {/* EDP 75折費用 */}
                      <td className="p-3 text-right text-purple-200">
                        ${formatNumber(item.costEdp)}
                      </td>

                      {/* 最佳推薦方案 */}
                      <td className="p-3 text-center font-sans">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border ${
                            item.recommendationType === 'EDP'
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
                          省 ${formatNumber(item.bestSavingsVsOnDemand)}
                        </div>
                      </td>

                      {/* 調整後預估效益 */}
                      <td className="p-3 text-right bg-emerald-950/10">
                        {diag.potentialMonthlySavingsVsCurrent > 0 ? (
                          <div className="font-extrabold text-emerald-400">
                            +${formatNumber(diag.potentialMonthlySavingsVsCurrent)}
                            <div className="text-[10px] text-emerald-500 font-sans">/月</div>
                          </div>
                        ) : (
                          <div className="text-gray-400 text-xs font-sans">
                            - (已屬最佳)
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
                    <td colSpan={11} className="p-8 text-center text-gray-400 font-sans">
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
      {/* 5. 帳號詳細計算內容與調整建議彈窗 (Account Calculation Detail Modal) */}
      {/* ========================================================================= */}
      {inspectingAccount && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-gray-850 border border-gray-700 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-white">
                    帳號成本與 RI/SP 既有合約調整診斷明細
                  </h3>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${inspectingAccount.existingDiagnosis.badgeColorClass}`}>
                    {inspectingAccount.existingDiagnosis.badgeLabel}
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
              {/* 既有狀態診斷與互動切換區塊 */}
              <div className="bg-gradient-to-r from-gray-800 to-gray-850 p-4 rounded-xl border border-blue-500/30 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
                      <span>🔍 帳號既有 RI/SP 持有狀態與方案模擬切換</span>
                    </h4>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {inspectingAccount.existingDiagnosis.isAutoDetected 
                        ? '狀態來源: 計費資料自動偵測' 
                        : '狀態來源: 使用者手動設定'}
                    </p>
                  </div>

                  {/* 切換按鈕群 */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        handleToggleAccountPurchased(inspectingAccount.accountId, true);
                        setInspectingAccount(prev => prev ? {
                          ...prev,
                          existingDiagnosis: {
                            ...prev.existingDiagnosis,
                            hasPurchased: false,
                            currentPlanKey: 'none',
                            currentPlanName: '未購買 (採全帳號 EDP 75折)'
                          }
                        } : null);
                      }}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all ${
                        !inspectingAccount.existingDiagnosis.hasPurchased
                          ? 'bg-purple-600 text-white border-purple-500 shadow'
                          : 'bg-gray-800 text-gray-300 border-gray-600 hover:bg-gray-750'
                      }`}
                    >
                      未購買 (採 EDP)
                    </button>

                    {(['1y_no', '1y_all', '3y_no', '3y_all'] as RiSpPlanKey[]).map(key => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          handleChangeAccountPlan(inspectingAccount.accountId, key);
                          setInspectingAccount(prev => prev ? {
                            ...prev,
                            existingDiagnosis: {
                              ...prev.existingDiagnosis,
                              hasPurchased: true,
                              currentPlanKey: key,
                              currentPlanName: PLAN_NAMES[key]
                            }
                          } : null);
                        }}
                        className={`px-2 py-1 text-xs font-semibold rounded-lg border transition-all ${
                          inspectingAccount.existingDiagnosis.hasPurchased && inspectingAccount.existingDiagnosis.currentPlanKey === key
                            ? 'bg-cyan-600 text-white border-cyan-500 shadow'
                            : 'bg-gray-800 text-gray-300 border-gray-600 hover:bg-gray-750'
                        }`}
                      >
                        {PLAN_NAMES[key].replace('RI/SP ', '')}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 偵測到的特徵 */}
                {inspectingAccount.existingDiagnosis.detectedFeatures.length > 0 && (
                  <div className="bg-gray-900/70 p-2.5 rounded-lg border border-gray-800 text-xs">
                    <span className="text-gray-400 font-semibold">帳單明細中偵測之特徵項目：</span>
                    <ul className="list-disc list-inside text-gray-300 mt-1 space-y-0.5">
                      {inspectingAccount.existingDiagnosis.detectedFeatures.map((f, i) => (
                        <li key={i}>{f}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* 是否要調整？深度診斷與執行行動清單 */}
              <div className="bg-gradient-to-r from-gray-800 to-gray-850 p-5 rounded-xl border border-amber-500/40 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-gray-700/80">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">💡</span>
                    <div>
                      <h4 className="text-sm font-bold text-white">
                        是否要調整？具體調整方針與效益分析
                      </h4>
                      <p className="text-xs text-gray-400">
                        針對該帳號工作負載特徵與合約現況之精算建議
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-400">調整預估額外效益</div>
                    <div className="text-base font-extrabold text-emerald-400">
                      {inspectingAccount.existingDiagnosis.potentialMonthlySavingsVsCurrent > 0 
                        ? `+${formatNumber(inspectingAccount.existingDiagnosis.potentialMonthlySavingsVsCurrent)} USD /月`
                        : '現況已屬最佳'}
                    </div>
                  </div>
                </div>

                <div className="text-xs text-gray-200 leading-relaxed bg-gray-900/60 p-3.5 rounded-xl border border-gray-800">
                  <strong className="text-amber-300 block mb-1">【診斷結論】</strong>
                  {inspectingAccount.existingDiagnosis.detailReason}
                </div>

                {/* 具體執行行動步驟 */}
                {inspectingAccount.existingDiagnosis.actionSteps.length > 0 && (
                  <div>
                    <h5 className="text-xs font-bold uppercase tracking-wider text-blue-300 mb-2">
                      📋 具體實施與調整執行步驟：
                    </h5>
                    <div className="space-y-1.5">
                      {inspectingAccount.existingDiagnosis.actionSteps.map((step, idx) => (
                        <div key={idx} className="bg-gray-900/80 p-2.5 rounded-lg border border-gray-800 text-xs text-gray-300 flex items-start gap-2">
                          <span className="text-blue-400 font-bold shrink-0">Step {idx + 1}</span>
                          <span>{step.replace(/^\d+\.\s*/, '')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

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
                  <div className="text-xs text-gray-400 font-bold mb-1">非適用服務花費 (維持原價)</div>
                  <div className="text-xl font-extrabold text-gray-300">
                    ${formatNumber(inspectingAccount.nonEligibleCost)}
                  </div>
                  <div className="text-[11px] text-amber-400 mt-1">
                    佔比: {formatPercent(100 - inspectingAccount.eligibleRatio)} (若買 RI/SP 維持 100% 原價)
                  </div>
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
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-600 text-white">最優解</span>
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
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-600 text-white">最優解</span>
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
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-600 text-white">最優解</span>
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
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-600 text-white">最優解</span>
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
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-600 text-white">最優解</span>
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
