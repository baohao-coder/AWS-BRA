import { BillingData, MonthlyBillingData } from '../types';

export interface EdpContractConfig {
  year1: {
    annualTarget: number; // 6,100,000
    mrrTarget: number;    // 509,000
  };
  year2: {
    annualTarget: number; // 6,500,000
    mrrTarget: number;    // 540,000
  };
  year3: {
    annualTarget: number; // 7,400,000
    mrrTarget: number;    // 617,000
  };
  total3Year: number;     // 20,000,000
  discountRate: number;   // 0.89 (89%)
  excludedAccountId: string; // '927845210633'
}

export const DEFAULT_EDP_CONFIG: EdpContractConfig = {
  year1: {
    annualTarget: 6100000,
    mrrTarget: 509000,
  },
  year2: {
    annualTarget: 6500000,
    mrrTarget: 540000,
  },
  year3: {
    annualTarget: 7400000,
    mrrTarget: 617000,
  },
  total3Year: 20000000,
  discountRate: 0.89,
  excludedAccountId: '927845210633',
};

export interface EdpProjectedItem {
  id: string;
  name: string;
  startMonth: string;      // e.g. "2024-07"
  endMonth?: string;        // e.g. "2026-12" (inclusive)
  monthlyAmount: number;    // USD before/after discount
  isDiscounted: boolean;    // true: 89% discount applies, false: 100% (Marketplace/net)
  enabled: boolean;
  category?: string;        // e.g. "AI / GenAI", "Migration", "Data Lakehouse", "New Account"
  notes?: string;
}

export interface EdpMonthlyOverride {
  month: string;
  customBaseAmount?: number;
  additionalAmount?: number;
  notes?: string;
}

export interface EdpForecastSettings {
  enabled: boolean;
  forecastHorizon: 'END_OF_YEAR' | 'FULL_3_YEARS'; // End of current contract year (12 mo) or full 36 mo
  baseGrowthModel: 'FIXED_RATE' | 'FIXED_AMOUNT' | 'AVERAGE_RUN_RATE' | 'MANUAL_ONLY';
  monthlyGrowthRate: number;    // e.g. 2.0 (%)
  monthlyGrowthAmount: number;  // e.g. 15000 (USD)
  baseMonthStrategy: 'LAST_ACTUAL_MONTH' | 'LAST_3_MONTHS_AVG' | 'CUSTOM_AMOUNT';
  customBaseSpend: number;      // e.g. 500000 (USD)
  projectedProjects: EdpProjectedItem[];
  monthlyOverrides: Record<string, EdpMonthlyOverride>;
}

export const DEFAULT_FORECAST_SETTINGS: EdpForecastSettings = {
  enabled: true,
  forecastHorizon: 'FULL_3_YEARS',
  baseGrowthModel: 'FIXED_RATE',
  monthlyGrowthRate: 1.5,
  monthlyGrowthAmount: 10000,
  baseMonthStrategy: 'LAST_ACTUAL_MONTH',
  customBaseSpend: 500000,
  projectedProjects: [
    {
      id: 'proj-1',
      name: '生成式 AI 與 Bedrock 專案上線',
      startMonth: '', // Will be dynamically set to next month if empty
      monthlyAmount: 35000,
      isDiscounted: true,
      enabled: true,
      category: 'AI / GenAI',
      notes: '預期導入 Amazon Bedrock 與 Claude 3.5 模型 API 用量',
    },
    {
      id: 'proj-2',
      name: '海外業務核心系統搬遷 (Phase 2)',
      startMonth: '',
      monthlyAmount: 45000,
      isDiscounted: true,
      enabled: true,
      category: 'Migration',
      notes: '核心資料庫與微服務擴容',
    }
  ],
  monthlyOverrides: {},
};

export interface EdpItemAdjustmentBreakdown {
  accountId: string;
  accountName: string;
  productName: string;
  usageType: string;
  itemDescription: string;
  originalCost: number;
  adjustedCost: number;
  adjustmentType: 'EXCLUDED_ACCOUNT' | 'EXCLUDED_SKILLBUILDER' | 'MARKETPLACE_100' | 'STANDARD_89';
  reason: string;
}

export interface EdpMonthResult {
  month: string;
  contractYear: 'Year 1' | 'Year 2' | 'Year 3';
  contractYearIndex: number; // 1, 2, 3
  isForecast: boolean;       // true if this is a projected future month
  
  // Cost breakdown
  originalTotal: number;
  excludedAccountCost: number;       // 927845210633
  excludedSkillbuilderCost: number;   // OCBAWSskillbuilder
  marketplaceCost: number;            // 100%
  standardOriginalCost: number;       // Standard AWS services before discount
  standardDiscountedCost: number;     // Standard AWS services * 0.89
  totalEdpAdjustedCost: number;       // Final EDP Spend = marketplaceCost + standardDiscountedCost (+ forecast additions)
  totalSavings: number;               // originalTotal - totalEdpAdjustedCost
  
  // Forecast specific breakdown
  baseProjectedCost?: number;
  projectAdditionsCost?: number;
  projectBreakdown?: Array<{ name: string; amount: number; isDiscounted: boolean }>;
  monthlyOverrideCost?: number;

  // Targets & Comparisons
  mrrTarget: number;
  variance: number;                   // totalEdpAdjustedCost - mrrTarget
  variancePercentage: number;         // (variance / mrrTarget) * 100
  achievementRate: number;            // (totalEdpAdjustedCost / mrrTarget) * 100
  
  // Cumulative within year
  cumulativeYearAdjustedCost: number;
  cumulativeYearTarget: number;
  cumulativeYearVariance: number;
  cumulativeYearAchievementRate: number;

  // Cumulative all-time
  cumulativeAllAdjustedCost: number;
  cumulativeAllTarget: number;
  cumulativeAllVariance: number;
  cumulativeAllAchievementRate: number;

  // Detailed breakdowns for inspection
  adjustments: EdpItemAdjustmentBreakdown[];
}

export interface EdpYearResult {
  yearKey: 'Year 1' | 'Year 2' | 'Year 3';
  yearIndex: number;
  annualTarget: number;
  mrrTarget: number;
  
  // Month counts
  totalMonthCount: number;
  actualMonthCount: number;
  forecastMonthCount: number;
  months: string[];
  
  // Costs (Actual Only)
  actualAdjustedSpend: number;
  actualOriginalSpend: number;
  actualSavings: number;
  
  // Costs (Projected/Forecast Additions)
  forecastAdjustedSpend: number;
  
  // Costs (Combined Actual + Forecast)
  combinedAdjustedSpend: number;
  combinedOriginalSpend: number;
  combinedSavings: number;
  
  // Legacy / Direct access for backwards compatibility (points to combined if forecast enabled, else actual)
  totalEdpAdjustedCost: number;
  originalTotal: number;
  totalSavings: number;
  excludedAccountCost: number;
  excludedSkillbuilderCost: number;
  marketplaceCost: number;
  standardOriginalCost: number;
  standardDiscountedCost: number;
  
  avgMonthlyAdjustedCost: number;
  annualizedRunRate: number;
  variance: number;                   // totalEdpAdjustedCost - annualTarget
  achievementRate: number;            // (totalEdpAdjustedCost / annualTarget) * 100
  remainingCommitment: number;        // Math.max(0, annualTarget - totalEdpAdjustedCost)
  status: 'SURPLUS' | 'DEFICIT' | 'ON_TRACK';
}

export interface EdpSummaryResult {
  config: EdpContractConfig;
  forecastSettings: EdpForecastSettings;
  months: EdpMonthResult[];
  actualMonths: EdpMonthResult[];
  forecastMonths: EdpMonthResult[];
  years: EdpYearResult[];
  
  total3YearCommitment: number;
  
  // Actual Only Summary
  actualAdjustedSpend: number;
  actualOriginalSpend: number;
  actualSavings: number;
  actualOverallAchievementRate: number;
  actualRemainingCommitment: number;
  actualMonthCount: number;
  
  // Combined (Actual + Forecast) Summary
  totalAdjustedSpend: number;
  totalOriginalSpend: number;
  totalSavings: number;
  totalOverallAchievementRate: number;
  totalRemainingCommitment: number;
  totalMonthCount: number;
  forecastMonthCount: number;
  
  // Forecast Insights
  projectedSurplusOrGap: number; // totalAdjustedSpend - total3YearCommitment
  targetFulfillmentMonth?: string; // Month when $20M total is crossed
  
  activeYearKey: 'Year 1' | 'Year 2' | 'Year 3';
}

// Helpers for classifying cost items
export const isSkillBuilderItem = (productName: string, usageType: string = '', itemDescription: string = ''): boolean => {
  const text = `${productName} ${usageType} ${itemDescription}`.toLowerCase().replace(/[\s\-_]+/g, '');
  return text.includes('skillbuilder') || 
         text.includes('ocbawsskillbuilder') || 
         text.includes('skillbuild');
};

export const isMarketplaceItem = (productName: string, usageType: string = '', itemDescription: string = ''): boolean => {
  const text = `${productName} ${usageType} ${itemDescription}`.toLowerCase();
  return text.includes('marketplace') || 
         text.includes('aws marketplace') || 
         productName.toLowerCase().startsWith('aws marketplace');
};

/**
 * Helper to add N months to "YYYY-MM"
 */
export const addMonthsToYearMonth = (yearMonthStr: string, addCount: number): string => {
  const [yearStr, monthStr] = yearMonthStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  if (isNaN(year) || isNaN(month)) return yearMonthStr;

  const totalMonths = (year * 12 + (month - 1)) + addCount;
  const newYear = Math.floor(totalMonths / 12);
  const newMonth = (totalMonths % 12) + 1;
  return `${newYear}-${String(newMonth).padStart(2, '0')}`;
};

/**
 * Helper to calculate month diff between two "YYYY-MM"
 */
export const getMonthDiff = (fromYearMonth: string, toYearMonth: string): number => {
  const [fromY, fromM] = fromYearMonth.split('-').map(Number);
  const [toY, toM] = toYearMonth.split('-').map(Number);
  if (isNaN(fromY) || isNaN(fromM) || isNaN(toY) || isNaN(toM)) return 0;
  return (toY - fromY) * 12 + (toM - fromM);
};

/**
 * Calculates complete EDP breakdown, monthly comparisons, yearly progress, and future growth forecast
 */
export const calculateEdpAnalysis = (
  data: BillingData,
  config: EdpContractConfig = DEFAULT_EDP_CONFIG,
  startMonthOverride?: string,
  forecastSettings: EdpForecastSettings = DEFAULT_FORECAST_SETTINGS
): EdpSummaryResult => {
  const sortedData = [...data].sort((a, b) => a.month.localeCompare(b.month));
  
  // Determine start month
  const firstMonth = startMonthOverride || (sortedData.length > 0 ? sortedData[0].month : '2024-01');
  
  const getContractYearForMonth = (monthStr: string): { key: 'Year 1' | 'Year 2' | 'Year 3'; index: number; relativeMonthIndex: number } => {
    let relativeIdx = 0;
    const [sYear, sMonth] = firstMonth.split('-').map(Number);
    const [mYear, mMonth] = monthStr.split('-').map(Number);
    if (!isNaN(sYear) && !isNaN(sMonth) && !isNaN(mYear) && !isNaN(mMonth)) {
      relativeIdx = (mYear - sYear) * 12 + (mMonth - sMonth);
    }

    if (relativeIdx < 12) {
      return { key: 'Year 1', index: 1, relativeMonthIndex: relativeIdx };
    } else if (relativeIdx < 24) {
      return { key: 'Year 2', index: 2, relativeMonthIndex: relativeIdx };
    } else {
      return { key: 'Year 3', index: 3, relativeMonthIndex: relativeIdx };
    }
  };

  let cumulativeAllAdjustedCost = 0;
  let cumulativeAllTarget = 0;

  const yearCumulativeMap: Record<string, { adjustedCost: number; target: number }> = {
    'Year 1': { adjustedCost: 0, target: 0 },
    'Year 2': { adjustedCost: 0, target: 0 },
    'Year 3': { adjustedCost: 0, target: 0 },
  };

  // 1. Process actual historical months
  const actualMonths: EdpMonthResult[] = sortedData.map((m) => {
    const { key: contractYear, index: contractYearIndex } = getContractYearForMonth(m.month);
    const mrrTarget = contractYear === 'Year 1' 
      ? config.year1.mrrTarget 
      : contractYear === 'Year 2' 
      ? config.year2.mrrTarget 
      : config.year3.mrrTarget;

    let originalTotal = 0;
    let excludedAccountCost = 0;
    let excludedSkillbuilderCost = 0;
    let marketplaceCost = 0;
    let standardOriginalCost = 0;
    let standardDiscountedCost = 0;

    const adjustments: EdpItemAdjustmentBreakdown[] = [];

    m.accounts.forEach(acc => {
      const isTargetExcludedAccount = acc.accountId?.trim() === config.excludedAccountId.trim();

      acc.services.forEach(srv => {
        if (srv.details && srv.details.length > 0) {
          srv.details.forEach(detail => {
            const cost = Number(detail.totalCost) || 0;
            originalTotal += cost;

            if (isTargetExcludedAccount || detail.accountId?.trim() === config.excludedAccountId.trim()) {
              excludedAccountCost += cost;
              adjustments.push({
                accountId: detail.accountId || acc.accountId,
                accountName: detail.accountName || acc.accountName,
                productName: detail.productName || srv.productName,
                usageType: detail.usageType || '',
                itemDescription: detail.itemDescription || '',
                originalCost: cost,
                adjustedCost: 0,
                adjustmentType: 'EXCLUDED_ACCOUNT',
                reason: `排除 AWS 帳號 ${config.excludedAccountId}`,
              });
            } else if (isSkillBuilderItem(detail.productName || srv.productName, detail.usageType, detail.itemDescription)) {
              excludedSkillbuilderCost += cost;
              adjustments.push({
                accountId: detail.accountId || acc.accountId,
                accountName: detail.accountName || acc.accountName,
                productName: detail.productName || srv.productName,
                usageType: detail.usageType || '',
                itemDescription: detail.itemDescription || '',
                originalCost: cost,
                adjustedCost: 0,
                adjustmentType: 'EXCLUDED_SKILLBUILDER',
                reason: '扣除 OCBAWSskillbuilder 費用',
              });
            } else if (isMarketplaceItem(detail.productName || srv.productName, detail.usageType, detail.itemDescription)) {
              marketplaceCost += cost;
              adjustments.push({
                accountId: detail.accountId || acc.accountId,
                accountName: detail.accountName || acc.accountName,
                productName: detail.productName || srv.productName,
                usageType: detail.usageType || '',
                itemDescription: detail.itemDescription || '',
                originalCost: cost,
                adjustedCost: cost,
                adjustmentType: 'MARKETPLACE_100',
                reason: 'Marketplace 費用維持 100% 原價',
              });
            } else {
              standardOriginalCost += cost;
              const discounted = cost * config.discountRate;
              standardDiscountedCost += discounted;
              adjustments.push({
                accountId: detail.accountId || acc.accountId,
                accountName: detail.accountName || acc.accountName,
                productName: detail.productName || srv.productName,
                usageType: detail.usageType || '',
                itemDescription: detail.itemDescription || '',
                originalCost: cost,
                adjustedCost: discounted,
                adjustmentType: 'STANDARD_89',
                reason: `一般 AWS 服務 89 折 (* ${(config.discountRate * 100).toFixed(0)}%)`,
              });
            }
          });
        } else {
          const cost = Number(srv.totalCost) || 0;
          originalTotal += cost;

          if (isTargetExcludedAccount) {
            excludedAccountCost += cost;
            adjustments.push({
              accountId: acc.accountId,
              accountName: acc.accountName,
              productName: srv.productName,
              usageType: '',
              itemDescription: '',
              originalCost: cost,
              adjustedCost: 0,
              adjustmentType: 'EXCLUDED_ACCOUNT',
              reason: `排除 AWS 帳號 ${config.excludedAccountId}`,
            });
          } else if (isSkillBuilderItem(srv.productName)) {
            excludedSkillbuilderCost += cost;
            adjustments.push({
              accountId: acc.accountId,
              accountName: acc.accountName,
              productName: srv.productName,
              usageType: '',
              itemDescription: '',
              originalCost: cost,
              adjustedCost: 0,
              adjustmentType: 'EXCLUDED_SKILLBUILDER',
              reason: '扣除 OCBAWSskillbuilder 費用',
            });
          } else if (isMarketplaceItem(srv.productName)) {
            marketplaceCost += cost;
            adjustments.push({
              accountId: acc.accountId,
              accountName: acc.accountName,
              productName: srv.productName,
              usageType: '',
              itemDescription: '',
              originalCost: cost,
              adjustedCost: cost,
              adjustmentType: 'MARKETPLACE_100',
              reason: 'Marketplace 費用維持 100% 原價',
            });
          } else {
            standardOriginalCost += cost;
            const discounted = cost * config.discountRate;
            standardDiscountedCost += discounted;
            adjustments.push({
              accountId: acc.accountId,
              accountName: acc.accountName,
              productName: srv.productName,
              usageType: '',
              itemDescription: '',
              originalCost: cost,
              adjustedCost: discounted,
              adjustmentType: 'STANDARD_89',
              reason: `一般 AWS 服務 89 折 (* ${(config.discountRate * 100).toFixed(0)}%)`,
            });
          }
        }
      });
    });

    const totalEdpAdjustedCost = marketplaceCost + standardDiscountedCost;
    const totalSavings = originalTotal - totalEdpAdjustedCost;
    const variance = totalEdpAdjustedCost - mrrTarget;
    const variancePercentage = mrrTarget > 0 ? (variance / mrrTarget) * 100 : 0;
    const achievementRate = mrrTarget > 0 ? (totalEdpAdjustedCost / mrrTarget) * 100 : 0;

    // Update cumulative trackers
    yearCumulativeMap[contractYear].adjustedCost += totalEdpAdjustedCost;
    yearCumulativeMap[contractYear].target += mrrTarget;
    cumulativeAllAdjustedCost += totalEdpAdjustedCost;
    cumulativeAllTarget += mrrTarget;

    const cumulativeYearAdjustedCost = yearCumulativeMap[contractYear].adjustedCost;
    const cumulativeYearTarget = yearCumulativeMap[contractYear].target;
    const cumulativeYearVariance = cumulativeYearAdjustedCost - cumulativeYearTarget;
    const cumulativeYearAchievementRate = cumulativeYearTarget > 0 
      ? (cumulativeYearAdjustedCost / cumulativeYearTarget) * 100 
      : 0;

    const cumulativeAllVariance = cumulativeAllAdjustedCost - cumulativeAllTarget;
    const cumulativeAllAchievementRate = cumulativeAllTarget > 0 
      ? (cumulativeAllAdjustedCost / cumulativeAllTarget) * 100 
      : 0;

    return {
      month: m.month,
      contractYear,
      contractYearIndex,
      isForecast: false,
      originalTotal,
      excludedAccountCost,
      excludedSkillbuilderCost,
      marketplaceCost,
      standardOriginalCost,
      standardDiscountedCost,
      totalEdpAdjustedCost,
      totalSavings,
      mrrTarget,
      variance,
      variancePercentage,
      achievementRate,
      cumulativeYearAdjustedCost,
      cumulativeYearTarget,
      cumulativeYearVariance,
      cumulativeYearAchievementRate,
      cumulativeAllAdjustedCost,
      cumulativeAllTarget,
      cumulativeAllVariance,
      cumulativeAllAchievementRate,
      adjustments,
    };
  });

  // 2. Generate and calculate Forecast / Projected future months if enabled
  const forecastMonths: EdpMonthResult[] = [];
  
  if (forecastSettings.enabled) {
    const lastActualMonth = actualMonths.length > 0 ? actualMonths[actualMonths.length - 1].month : firstMonth;
    const lastActualSpend = actualMonths.length > 0 ? actualMonths[actualMonths.length - 1].totalEdpAdjustedCost : config.year1.mrrTarget;
    
    // Calculate last 3 months average spend
    const recentMonths = actualMonths.slice(-3);
    const last3MonthsAvg = recentMonths.length > 0 
      ? recentMonths.reduce((sum, m) => sum + m.totalEdpAdjustedCost, 0) / recentMonths.length 
      : lastActualSpend;

    // Determine base spend anchor
    let baseSpendAnchor = lastActualSpend;
    if (forecastSettings.baseMonthStrategy === 'LAST_3_MONTHS_AVG') {
      baseSpendAnchor = last3MonthsAvg;
    } else if (forecastSettings.baseMonthStrategy === 'CUSTOM_AMOUNT') {
      baseSpendAnchor = forecastSettings.customBaseSpend || 500000;
    }

    // Determine how many months to project
    // Start month relative index
    const lastActualContractInfo = getContractYearForMonth(lastActualMonth);
    const lastActualRelIndex = actualMonths.length > 0 ? lastActualContractInfo.relativeMonthIndex : -1;
    
    let totalTargetMonths = 36; // Full 3 Years = 36 months
    if (forecastSettings.forecastHorizon === 'END_OF_YEAR') {
      if (lastActualRelIndex < 12) totalTargetMonths = 12;
      else if (lastActualRelIndex < 24) totalTargetMonths = 24;
      else totalTargetMonths = 36;
    }

    const nextMonthIndexStart = lastActualRelIndex + 1;

    let currentBaseSpend = baseSpendAnchor;

    for (let relIdx = nextMonthIndexStart; relIdx < totalTargetMonths; relIdx++) {
      const monthStr = addMonthsToYearMonth(firstMonth, relIdx);
      const { key: contractYear, index: contractYearIndex } = getContractYearForMonth(monthStr);
      const mrrTarget = contractYear === 'Year 1' 
        ? config.year1.mrrTarget 
        : contractYear === 'Year 2' 
        ? config.year2.mrrTarget 
        : config.year3.mrrTarget;

      // Apply base growth model
      const stepIndex = relIdx - nextMonthIndexStart; // 0, 1, 2...
      if (forecastSettings.baseGrowthModel === 'FIXED_RATE') {
        const rate = (forecastSettings.monthlyGrowthRate || 0) / 100;
        currentBaseSpend = baseSpendAnchor * Math.pow(1 + rate, stepIndex + 1);
      } else if (forecastSettings.baseGrowthModel === 'FIXED_AMOUNT') {
        const amount = forecastSettings.monthlyGrowthAmount || 0;
        currentBaseSpend = baseSpendAnchor + amount * (stepIndex + 1);
      } else if (forecastSettings.baseGrowthModel === 'AVERAGE_RUN_RATE') {
        currentBaseSpend = baseSpendAnchor;
      } else if (forecastSettings.baseGrowthModel === 'MANUAL_ONLY') {
        currentBaseSpend = 0; // Only projects and overrides
      }

      // Check monthly override for base
      const override = forecastSettings.monthlyOverrides[monthStr];
      let effectiveBaseSpend = currentBaseSpend;
      if (override && typeof override.customBaseAmount === 'number') {
        effectiveBaseSpend = override.customBaseAmount;
      }

      // Calculate project additions for this month
      let projectAdditions = 0;
      const projectBreakdown: Array<{ name: string; amount: number; isDiscounted: boolean }> = [];

      (forecastSettings.projectedProjects || []).forEach(proj => {
        if (!proj.enabled) return;
        const projStart = proj.startMonth || addMonthsToYearMonth(lastActualMonth, 1);
        const projEnd = proj.endMonth || '2099-12';

        if (monthStr >= projStart && monthStr <= projEnd) {
          const rawAmount = Number(proj.monthlyAmount) || 0;
          const adjustedAmount = proj.isDiscounted ? rawAmount * config.discountRate : rawAmount;
          projectAdditions += adjustedAmount;
          projectBreakdown.push({
            name: proj.name,
            amount: adjustedAmount,
            isDiscounted: proj.isDiscounted,
          });
        }
      });

      // Additional monthly override amount
      let additionalOverrideAmount = 0;
      if (override && typeof override.additionalAmount === 'number') {
        additionalOverrideAmount = override.additionalAmount;
      }

      const totalEdpAdjustedCost = effectiveBaseSpend + projectAdditions + additionalOverrideAmount;
      const originalTotal = (effectiveBaseSpend / config.discountRate) + 
        projectBreakdown.reduce((sum, p) => sum + (p.isDiscounted ? p.amount / config.discountRate : p.amount), 0) +
        additionalOverrideAmount;
      
      const totalSavings = originalTotal - totalEdpAdjustedCost;
      const variance = totalEdpAdjustedCost - mrrTarget;
      const variancePercentage = mrrTarget > 0 ? (variance / mrrTarget) * 100 : 0;
      const achievementRate = mrrTarget > 0 ? (totalEdpAdjustedCost / mrrTarget) * 100 : 0;

      // Update cumulative trackers
      yearCumulativeMap[contractYear].adjustedCost += totalEdpAdjustedCost;
      yearCumulativeMap[contractYear].target += mrrTarget;
      cumulativeAllAdjustedCost += totalEdpAdjustedCost;
      cumulativeAllTarget += mrrTarget;

      const cumulativeYearAdjustedCost = yearCumulativeMap[contractYear].adjustedCost;
      const cumulativeYearTarget = yearCumulativeMap[contractYear].target;
      const cumulativeYearVariance = cumulativeYearAdjustedCost - cumulativeYearTarget;
      const cumulativeYearAchievementRate = cumulativeYearTarget > 0 
        ? (cumulativeYearAdjustedCost / cumulativeYearTarget) * 100 
        : 0;

      const cumulativeAllVariance = cumulativeAllAdjustedCost - cumulativeAllTarget;
      const cumulativeAllAchievementRate = cumulativeAllTarget > 0 
        ? (cumulativeAllAdjustedCost / cumulativeAllTarget) * 100 
        : 0;

      forecastMonths.push({
        month: monthStr,
        contractYear,
        contractYearIndex,
        isForecast: true,
        originalTotal,
        excludedAccountCost: 0,
        excludedSkillbuilderCost: 0,
        marketplaceCost: 0,
        standardOriginalCost: originalTotal,
        standardDiscountedCost: totalEdpAdjustedCost,
        totalEdpAdjustedCost,
        totalSavings,
        baseProjectedCost: effectiveBaseSpend,
        projectAdditionsCost: projectAdditions,
        projectBreakdown,
        monthlyOverrideCost: additionalOverrideAmount,
        mrrTarget,
        variance,
        variancePercentage,
        achievementRate,
        cumulativeYearAdjustedCost,
        cumulativeYearTarget,
        cumulativeYearVariance,
        cumulativeYearAchievementRate,
        cumulativeAllAdjustedCost,
        cumulativeAllTarget,
        cumulativeAllVariance,
        cumulativeAllAchievementRate,
        adjustments: [],
      });
    }
  }

  // Combined all months (Actual + Forecast)
  const allMonths = [...actualMonths, ...forecastMonths];

  // Calculate Year 1, Year 2, Year 3 Summary
  const yearKeys: Array<'Year 1' | 'Year 2' | 'Year 3'> = ['Year 1', 'Year 2', 'Year 3'];
  const years: EdpYearResult[] = yearKeys.map((yKey, yIdx) => {
    const yearAllMonths = allMonths.filter(m => m.contractYear === yKey);
    const yearActualMonths = actualMonths.filter(m => m.contractYear === yKey);
    const yearForecastMonths = forecastMonths.filter(m => m.contractYear === yKey);

    const annualTarget = yKey === 'Year 1' 
      ? config.year1.annualTarget 
      : yKey === 'Year 2' 
      ? config.year2.annualTarget 
      : config.year3.annualTarget;
    
    const mrrTarget = yKey === 'Year 1' 
      ? config.year1.mrrTarget 
      : yKey === 'Year 2' 
      ? config.year2.mrrTarget 
      : config.year3.mrrTarget;

    const totalMonthCount = yearAllMonths.length;
    const actualMonthCount = yearActualMonths.length;
    const forecastMonthCount = yearForecastMonths.length;
    const months = yearAllMonths.map(m => m.month);

    const actualAdjustedSpend = yearActualMonths.reduce((sum, m) => sum + m.totalEdpAdjustedCost, 0);
    const actualOriginalSpend = yearActualMonths.reduce((sum, m) => sum + m.originalTotal, 0);
    const actualSavings = actualOriginalSpend - actualAdjustedSpend;

    const forecastAdjustedSpend = yearForecastMonths.reduce((sum, m) => sum + m.totalEdpAdjustedCost, 0);

    const combinedAdjustedSpend = yearAllMonths.reduce((sum, m) => sum + m.totalEdpAdjustedCost, 0);
    const combinedOriginalSpend = yearAllMonths.reduce((sum, m) => sum + m.originalTotal, 0);
    const combinedSavings = combinedOriginalSpend - combinedAdjustedSpend;

    // Use combined if forecast enabled & exists, else actual
    const totalEdpAdjustedCost = combinedAdjustedSpend;
    const originalTotal = combinedOriginalSpend;
    const totalSavings = combinedSavings;

    const excludedAccountCost = yearActualMonths.reduce((sum, m) => sum + m.excludedAccountCost, 0);
    const excludedSkillbuilderCost = yearActualMonths.reduce((sum, m) => sum + m.excludedSkillbuilderCost, 0);
    const marketplaceCost = yearActualMonths.reduce((sum, m) => sum + m.marketplaceCost, 0);
    const standardOriginalCost = yearActualMonths.reduce((sum, m) => sum + m.standardOriginalCost, 0);
    const standardDiscountedCost = yearActualMonths.reduce((sum, m) => sum + m.standardDiscountedCost, 0);

    const avgMonthlyAdjustedCost = totalMonthCount > 0 ? totalEdpAdjustedCost / totalMonthCount : 0;
    const annualizedRunRate = actualMonthCount > 0 
      ? (actualAdjustedSpend / actualMonthCount) * 12 
      : avgMonthlyAdjustedCost * 12;
    
    const variance = totalEdpAdjustedCost - annualTarget;
    const achievementRate = annualTarget > 0 ? (totalEdpAdjustedCost / annualTarget) * 100 : 0;
    const remainingCommitment = Math.max(0, annualTarget - totalEdpAdjustedCost);

    let status: 'SURPLUS' | 'DEFICIT' | 'ON_TRACK' = 'ON_TRACK';
    if (totalMonthCount >= 12 || (forecastSettings.enabled && totalMonthCount > 0)) {
      status = totalEdpAdjustedCost >= annualTarget ? 'SURPLUS' : 'DEFICIT';
    } else if (actualMonthCount > 0) {
      status = annualizedRunRate >= annualTarget ? 'SURPLUS' : 'DEFICIT';
    }

    return {
      yearKey: yKey,
      yearIndex: yIdx + 1,
      annualTarget,
      mrrTarget,
      totalMonthCount,
      actualMonthCount,
      forecastMonthCount,
      months,
      actualAdjustedSpend,
      actualOriginalSpend,
      actualSavings,
      forecastAdjustedSpend,
      combinedAdjustedSpend,
      combinedOriginalSpend,
      combinedSavings,
      totalEdpAdjustedCost,
      originalTotal,
      totalSavings,
      excludedAccountCost,
      excludedSkillbuilderCost,
      marketplaceCost,
      standardOriginalCost,
      standardDiscountedCost,
      avgMonthlyAdjustedCost,
      annualizedRunRate,
      variance,
      achievementRate,
      remainingCommitment,
      status,
    };
  });

  // Totals
  const actualAdjustedSpend = actualMonths.reduce((sum, m) => sum + m.totalEdpAdjustedCost, 0);
  const actualOriginalSpend = actualMonths.reduce((sum, m) => sum + m.originalTotal, 0);
  const actualSavings = actualOriginalSpend - actualAdjustedSpend;
  const actualOverallAchievementRate = config.total3Year > 0 
    ? (actualAdjustedSpend / config.total3Year) * 100 
    : 0;
  const actualRemainingCommitment = Math.max(0, config.total3Year - actualAdjustedSpend);

  const totalAdjustedSpend = allMonths.reduce((sum, m) => sum + m.totalEdpAdjustedCost, 0);
  const totalOriginalSpend = allMonths.reduce((sum, m) => sum + m.originalTotal, 0);
  const totalSavings = totalOriginalSpend - totalAdjustedSpend;
  const totalOverallAchievementRate = config.total3Year > 0 
    ? (totalAdjustedSpend / config.total3Year) * 100 
    : 0;
  const totalRemainingCommitment = Math.max(0, config.total3Year - totalAdjustedSpend);

  const projectedSurplusOrGap = totalAdjustedSpend - config.total3Year;

  // Find month when cumulative spend reaches total $20M commitment
  let targetFulfillmentMonth: string | undefined = undefined;
  for (const m of allMonths) {
    if (m.cumulativeAllAdjustedCost >= config.total3Year) {
      targetFulfillmentMonth = m.month;
      break;
    }
  }

  const lastProcessedMonth = allMonths[allMonths.length - 1];
  const activeYearKey = lastProcessedMonth ? lastProcessedMonth.contractYear : 'Year 1';

  return {
    config,
    forecastSettings,
    months: allMonths,
    actualMonths,
    forecastMonths,
    years,
    total3YearCommitment: config.total3Year,
    actualAdjustedSpend,
    actualOriginalSpend,
    actualSavings,
    actualOverallAchievementRate,
    actualRemainingCommitment,
    actualMonthCount: actualMonths.length,
    totalAdjustedSpend,
    totalOriginalSpend,
    totalSavings,
    totalOverallAchievementRate,
    totalRemainingCommitment,
    totalMonthCount: allMonths.length,
    forecastMonthCount: forecastMonths.length,
    projectedSurplusOrGap,
    targetFulfillmentMonth,
    activeYearKey,
  };
};
