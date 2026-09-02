import { BillingData } from '../types';

export type ForecastHorizon = 0 | 12 | 24 | 36;
export type ForecastMode = 'pure_history' | 'forecast_12' | 'forecast_24' | 'forecast_36';

export interface MonthlyDataPoint {
  month: string;
  isHistorical: boolean;
  actualCost: number;
  forecastCost: number;
  displayCost: number;
  monthOverMonthGrowthRate: number; // in percentage, e.g. 5.2%
  cumulativeCost: number;
  serviceBreakdown?: { [productName: string]: number };
}

export interface ServiceForecastItem {
  productName: string;
  historicalTotal: number;
  latestMonthCost: number;
  forecastTotal: number;
  monthlyAverage: number;
  growthRate: number;
  color: string;
}

export interface ForecastSummary {
  historicalMonthsCount: number;
  forecastMonthsCount: number;
  totalHistoricalSpend: number;
  avgHistoricalMonthlySpend: number;
  latestHistoricalSpend: number;
  latestHistoricalMonth: string;
  projectedPeriodSpend: number;
  projectedFinalMonthSpend: number;
  projectedTotalSpendWithHistory: number;
  projectedAnnualRunRate: number;
  calculatedMonthlyGrowthRate: number; // e.g. 0.02 for 2%
  appliedMonthlyGrowthRate: number;
  dataPoints: MonthlyDataPoint[];
  topServicesForecast: ServiceForecastItem[];
  allServicesList: {
    productName: string;
    historicalTotal: number;
    latestMonthCost: number;
    monthlyAverage: number;
  }[];
}

const SERVICE_COLORS = [
  '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899',
  '#06b6d4', '#f43f5e', '#14b8a6', '#6366f1', '#84cc16'
];

/**
 * Calculates historical and forecasted monthly usage and spend
 */
export function calculateForecast(
  billingData: BillingData,
  horizon: ForecastHorizon,
  customGrowthRateAnnualPercent?: number
): ForecastSummary {
  // Sort historical data by month
  const sortedData = [...billingData].sort((a, b) => a.month.localeCompare(b.month));

  // Extract historical points
  let cumHistory = 0;
  const historicalPoints: MonthlyDataPoint[] = [];

  sortedData.forEach((m, idx) => {
    let monthCost = 0;
    const serviceBreakdown: { [prod: string]: number } = {};

    m.accounts.forEach(acc => {
      const accCost = typeof acc.totalAmount === 'number'
        ? acc.totalAmount
        : (acc.services?.reduce((sum, s) => sum + (s.totalCost || 0), 0) || 0);
      monthCost += accCost;

      acc.services?.forEach(srv => {
        const prod = srv.productName || 'Other';
        serviceBreakdown[prod] = (serviceBreakdown[prod] || 0) + (srv.totalCost || 0);
      });
    });

    cumHistory += monthCost;
    const prevCost = idx > 0 ? historicalPoints[idx - 1].actualCost : monthCost;
    const momGrowth = prevCost > 0 ? ((monthCost - prevCost) / prevCost) * 100 : 0;

    historicalPoints.push({
      month: m.month,
      isHistorical: true,
      actualCost: monthCost,
      forecastCost: 0,
      displayCost: monthCost,
      monthOverMonthGrowthRate: idx === 0 ? 0 : momGrowth,
      cumulativeCost: cumHistory,
      serviceBreakdown
    });
  });

  const historicalCount = historicalPoints.length;
  const totalHistoricalSpend = cumHistory;
  const avgHistoricalMonthlySpend = historicalCount > 0 ? totalHistoricalSpend / historicalCount : 0;
  const latestHistorical = historicalPoints[historicalCount - 1] || { month: 'N/A', actualCost: 0, serviceBreakdown: {} };
  const latestCost = latestHistorical.actualCost;

  // Calculate baseline trend / Compound Monthly Growth Rate (CMGR)
  let calculatedMonthlyGrowthRate = 0;
  if (historicalCount >= 2 && historicalPoints[0].actualCost > 0) {
    const firstCost = historicalPoints[0].actualCost;
    const periods = historicalCount - 1;
    // CMGR = (Latest / First) ^ (1 / periods) - 1
    const rawCmgr = Math.pow(latestCost / firstCost, 1 / periods) - 1;
    // Clamp between -10% and +25% monthly to prevent explosive projections
    calculatedMonthlyGrowthRate = Math.max(-0.10, Math.min(0.25, isNaN(rawCmgr) ? 0.02 : rawCmgr));
  } else {
    calculatedMonthlyGrowthRate = 0.02; // 2% default monthly growth
  }

  // Determine monthly growth rate to apply
  let appliedMonthlyGrowthRate = calculatedMonthlyGrowthRate;
  if (typeof customGrowthRateAnnualPercent === 'number' && !isNaN(customGrowthRateAnnualPercent)) {
    // Convert Annual Growth Rate to Monthly Compound: (1 + annual)^(1/12) - 1
    appliedMonthlyGrowthRate = Math.pow(1 + customGrowthRateAnnualPercent / 100, 1 / 12) - 1;
  }

  // Generate future projection months
  const forecastPoints: MonthlyDataPoint[] = [];
  let cumTotal = totalHistoricalSpend;
  let runningCost = latestCost;

  // Helper to parse 'YYYY-MM' and add months
  const getNextMonth = (currentMonthStr: string, offset: number): string => {
    const parts = currentMonthStr.split('-');
    let year = parseInt(parts[0], 10);
    let month = parseInt(parts[1], 10);

    if (isNaN(year) || isNaN(month)) {
      const d = new Date();
      year = d.getFullYear();
      month = d.getMonth() + 1;
    }

    month += offset;
    while (month > 12) {
      month -= 12;
      year += 1;
    }
    return `${year}-${String(month).padStart(2, '0')}`;
  };

  const lastMonthStr = latestHistorical.month || '2025-01';

  // Calculate Top Services across historical data for granular forecasting
  const serviceHistoricalTotals: { [prod: string]: { total: number; latest: number } } = {};
  sortedData.forEach((m, mIdx) => {
    const isLatest = mIdx === sortedData.length - 1;
    m.accounts.forEach(acc => {
      acc.services?.forEach(srv => {
        const prod = srv.productName || 'Other';
        if (!serviceHistoricalTotals[prod]) {
          serviceHistoricalTotals[prod] = { total: 0, latest: 0 };
        }
        serviceHistoricalTotals[prod].total += srv.totalCost || 0;
        if (isLatest) {
          serviceHistoricalTotals[prod].latest += srv.totalCost || 0;
        }
      });
    });
  });

  const allServicesList = Object.entries(serviceHistoricalTotals)
    .map(([prod, val]) => ({
      productName: prod,
      historicalTotal: val.total,
      latestMonthCost: val.latest,
      monthlyAverage: val.total / Math.max(1, historicalCount)
    }))
    .sort((a, b) => b.historicalTotal - a.historicalTotal);

  const sortedTopServices = [...allServicesList]
    .sort((a, b) => b.latestMonthCost - a.latestMonthCost)
    .slice(0, 10);

  let projectedPeriodSpend = 0;
  if (horizon > 0) {
    for (let i = 1; i <= horizon; i++) {
      runningCost = runningCost * (1 + appliedMonthlyGrowthRate);
      projectedPeriodSpend += runningCost;
      cumTotal += runningCost;

      const nextMonthStr = getNextMonth(lastMonthStr, i);
      const serviceBreakdown: { [prod: string]: number } = {};

      allServicesList.forEach(srv => {
        const srvProjected = srv.latestMonthCost * Math.pow(1 + appliedMonthlyGrowthRate, i);
        serviceBreakdown[srv.productName] = srvProjected;
      });

      forecastPoints.push({
        month: `${nextMonthStr} (預估)`,
        isHistorical: false,
        actualCost: 0,
        forecastCost: runningCost,
        displayCost: runningCost,
        monthOverMonthGrowthRate: appliedMonthlyGrowthRate * 100,
        cumulativeCost: cumTotal,
        serviceBreakdown
      });
    }
  }

  const topServicesForecast: ServiceForecastItem[] = sortedTopServices.map((srv, idx) => {
    let srvForecastTotal = 0;
    if (horizon > 0) {
      for (let i = 1; i <= horizon; i++) {
        srvForecastTotal += srv.latestMonthCost * Math.pow(1 + appliedMonthlyGrowthRate, i);
      }
    }
    return {
      productName: srv.productName,
      historicalTotal: srv.historicalTotal,
      latestMonthCost: srv.latestMonthCost,
      forecastTotal: srvForecastTotal,
      monthlyAverage: srv.monthlyAverage,
      growthRate: appliedMonthlyGrowthRate * 100,
      color: SERVICE_COLORS[idx % SERVICE_COLORS.length]
    };
  });

  const allDataPoints = [...historicalPoints, ...forecastPoints];
  const projectedFinalMonthSpend = horizon > 0 ? (forecastPoints[forecastPoints.length - 1]?.forecastCost || latestCost) : latestCost;
  const projectedAnnualRunRate = projectedFinalMonthSpend * 12;

  return {
    historicalMonthsCount: historicalCount,
    forecastMonthsCount: horizon,
    totalHistoricalSpend,
    avgHistoricalMonthlySpend,
    latestHistoricalSpend: latestCost,
    latestHistoricalMonth: latestHistorical.month,
    projectedPeriodSpend,
    projectedFinalMonthSpend,
    projectedTotalSpendWithHistory: cumTotal,
    projectedAnnualRunRate,
    calculatedMonthlyGrowthRate,
    appliedMonthlyGrowthRate,
    dataPoints: allDataPoints,
    topServicesForecast,
    allServicesList
  };
}
