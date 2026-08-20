import React, { useState, useMemo, useEffect } from 'react';
import { BillingData } from '../types';
import Card from './common/Card';
import { 
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, Cell, LabelList, Legend, ComposedChart 
} from 'recharts';
import { 
  calculateEdpAnalysis, 
  DEFAULT_EDP_CONFIG, 
  DEFAULT_FORECAST_SETTINGS,
  EdpContractConfig, 
  EdpForecastSettings,
  EdpMonthResult, 
  EdpYearResult,
  addMonthsToYearMonth 
} from '../services/edpCalculator';
import { EdpForecastManager } from './edp/EdpForecastManager';
import { exportToExcel } from '../services/excelUtils';

interface EdpAnalysisTabProps {
  data: BillingData;
}

type ViewMode = 'monthly' | 'yearly' | 'projects' | 'adjustments';

const LOCAL_STORAGE_KEY_CONFIG = 'aws_edp_contract_config_v1';
const LOCAL_STORAGE_KEY_FORECAST = 'aws_edp_forecast_settings_v2';

const formatCurrency = (val: number, decimals: number = 0): string => {
  if (typeof val !== 'number' || isNaN(val)) return '$0';
  return '$' + new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(val);
};

const formatShortCurrency = (val: number): string => {
  if (typeof val !== 'number' || isNaN(val)) return '$0';
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 1000000) {
    return `${sign}$${(abs / 1000000).toFixed(2)}M`;
  }
  if (abs >= 1000) {
    return `${sign}$${(abs / 1000).toFixed(1)}K`;
  }
  return `${sign}$${abs.toFixed(0)}`;
};

const formatVarianceText = (val: number): string => {
  if (typeof val !== 'number' || isNaN(val)) return '$0';
  const sign = val > 0 ? '+' : '';
  return `${sign}${formatShortCurrency(val)}`;
};

const formatPercent = (val: number, decimals: number = 1): string => {
  if (typeof val !== 'number' || isNaN(val)) return '0.0%';
  return `${val.toFixed(decimals)}%`;
};

const EdpAnalysisTab: React.FC<EdpAnalysisTabProps> = ({ data }) => {
  // Load initial settings from localStorage if present
  const [config, setConfig] = useState<EdpContractConfig>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY_CONFIG);
      return saved ? JSON.parse(saved) : DEFAULT_EDP_CONFIG;
    } catch {
      return DEFAULT_EDP_CONFIG;
    }
  });

  const [forecastSettings, setForecastSettings] = useState<EdpForecastSettings>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY_FORECAST);
      return saved ? JSON.parse(saved) : DEFAULT_FORECAST_SETTINGS;
    } catch {
      return DEFAULT_FORECAST_SETTINGS;
    }
  });

  const [viewMode, setViewMode] = useState<ViewMode>('monthly');
  const [selectedYearFilter, setSelectedYearFilter] = useState<'ALL' | 'Year 1' | 'Year 2' | 'Year 3'>('ALL');
  const [monthTypeFilter, setMonthTypeFilter] = useState<'ALL' | 'ACTUAL_ONLY' | 'FORECAST_ONLY'>('ALL');
  const [startMonthOverride, setStartMonthOverride] = useState<string>('');
  const [showConfigModal, setShowConfigModal] = useState<boolean>(false);
  const [showForecastManager, setShowForecastManager] = useState<boolean>(true);

  // Sync to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY_CONFIG, JSON.stringify(config));
    } catch (e) {
      console.error('Failed to save config to localStorage', e);
    }
  }, [config]);

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY_FORECAST, JSON.stringify(forecastSettings));
    } catch (e) {
      console.error('Failed to save forecast settings to localStorage', e);
    }
  }, [forecastSettings]);

  // Sorted actual months from data
  const sortedActualMonths = useMemo(() => {
    return [...data].map(d => d.month).sort();
  }, [data]);

  const lastActualMonth = sortedActualMonths[sortedActualMonths.length - 1] || '2024-01';

  // Run calculation
  const edpResult = useMemo(() => {
    return calculateEdpAnalysis(data, config, startMonthOverride || undefined, forecastSettings);
  }, [data, config, startMonthOverride, forecastSettings]);

  // Generate list of future months for selector
  const futureMonthsList = useMemo(() => {
    const list: string[] = [];
    for (let i = 1; i <= 36; i++) {
      list.push(addMonthsToYearMonth(lastActualMonth, i));
    }
    return list;
  }, [lastActualMonth]);

  // Filtered months for display based on selectedYearFilter & monthTypeFilter
  const displayedMonths = useMemo(() => {
    return edpResult.months.filter(m => {
      if (selectedYearFilter !== 'ALL' && m.contractYear !== selectedYearFilter) {
        return false;
      }
      if (monthTypeFilter === 'ACTUAL_ONLY' && m.isForecast) {
        return false;
      }
      if (monthTypeFilter === 'FORECAST_ONLY' && !m.isForecast) {
        return false;
      }
      return true;
    });
  }, [edpResult.months, selectedYearFilter, monthTypeFilter]);

  // Chart dataset for monthly view with direct display labels
  const monthlyChartData = useMemo(() => {
    return displayedMonths.map(m => {
      return {
        month: m.month,
        contractYear: m.contractYear,
        isForecast: m.isForecast,
        totalEdpAdjustedCost: Math.round(m.totalEdpAdjustedCost),
        baseProjectedCost: Math.round(m.baseProjectedCost || 0),
        projectAdditionsCost: Math.round(m.projectAdditionsCost || 0),
        mrrTarget: Math.round(m.mrrTarget),
        variance: Math.round(m.variance),
        achievementRate: Number(m.achievementRate.toFixed(1)),
        originalTotal: Math.round(m.originalTotal),
        savings: Math.round(m.totalSavings),
        
        // Direct display labels on charts
        displayActual: `${m.isForecast ? '[預估] ' : ''}${formatShortCurrency(m.totalEdpAdjustedCost)}`,
        displayTarget: formatShortCurrency(m.mrrTarget),
        displayVariance: formatVarianceText(m.variance),
        displayAchievement: `${m.achievementRate.toFixed(1)}%`,
        isSurplus: m.variance >= 0,
      };
    });
  }, [displayedMonths]);

  // Chart dataset for yearly view
  const yearlyChartData = useMemo(() => {
    return edpResult.years.map(y => {
      return {
        yearKey: y.yearKey,
        annualTarget: y.annualTarget,
        annualTargetInM: Number((y.annualTarget / 1000000).toFixed(2)),
        actualInM: Number((y.actualAdjustedSpend / 1000000).toFixed(2)),
        forecastInM: Number((y.forecastAdjustedSpend / 1000000).toFixed(2)),
        combinedInM: Number((y.combinedAdjustedSpend / 1000000).toFixed(2)),
        achievementRate: Number(y.achievementRate.toFixed(1)),
        actualMonthCount: y.actualMonthCount,
        forecastMonthCount: y.forecastMonthCount,
        
        // Direct display labels
        displayActual: `$${(y.actualAdjustedSpend / 1000000).toFixed(2)}M`,
        displayCombined: `$${(y.combinedAdjustedSpend / 1000000).toFixed(2)}M`,
        displayTarget: `$${(y.annualTarget / 1000000).toFixed(2)}M`,
        displayProgress: `$${(y.combinedAdjustedSpend / 1000000).toFixed(2)}M / $${(y.annualTarget / 1000000).toFixed(2)}M (${y.achievementRate.toFixed(1)}%)`,
      };
    });
  }, [edpResult.years]);

  // Cumulative trend dataset
  const cumulativeTrendData = useMemo(() => {
    return edpResult.months.map(m => ({
      month: m.month,
      contractYear: m.contractYear,
      isForecast: m.isForecast,
      cumulativeActual: Math.round(m.cumulativeAllAdjustedCost),
      cumulativeTarget: Math.round(m.cumulativeAllTarget),
      displayActual: formatShortCurrency(m.cumulativeAllAdjustedCost),
      displayTarget: formatShortCurrency(m.cumulativeAllTarget),
      achievementRate: `${m.cumulativeAllAchievementRate.toFixed(1)}%`,
    }));
  }, [edpResult.months]);

  // Excel Export (Includes Forecast columns and Actual breakdown)
  const handleExportMonthly = () => {
    const exportData = edpResult.months.map(m => ({
      '計費月份 (Month)': m.month,
      '資料類別 (Data Type)': m.isForecast ? '預估模擬 (Forecast)' : '歷史實際 (Actual)',
      'EDP 合約年度 (Contract Year)': m.contractYear,
      '原始帳單/預估總額 (USD)': Number(m.originalTotal.toFixed(2)),
      '扣除 Skillbuilder (USD)': Number(m.excludedSkillbuilderCost.toFixed(2)),
      '扣除帳號 927845210633 (USD)': Number(m.excludedAccountCost.toFixed(2)),
      'Marketplace 100%原價 (USD)': Number(m.marketplaceCost.toFixed(2)),
      '標準服務 89折後 (USD)': Number(m.standardDiscountedCost.toFixed(2)),
      '基礎預估金額 (Base Forecast USD)': m.isForecast ? Number((m.baseProjectedCost || 0).toFixed(2)) : 0,
      '新增專案增量 (Project Additions USD)': m.isForecast ? Number((m.projectAdditionsCost || 0).toFixed(2)) : 0,
      'EDP 最終金額 (Total EDP Spend USD)': Number(m.totalEdpAdjustedCost.toFixed(2)),
      'EDP 合約 MRR 目標 (Target USD)': Number(m.mrrTarget.toFixed(2)),
      '月度差異額 (Variance USD)': Number(m.variance.toFixed(2)),
      '月度達成率 (Achievement Rate %)': `${m.achievementRate.toFixed(2)}%`,
      'EDP 累計節省費用 (Savings USD)': Number(m.totalSavings.toFixed(2)),
      '年度累計費用 (Cumulative Year USD)': Number(m.cumulativeYearAdjustedCost.toFixed(2)),
      '年度累計達成率 (%)': `${m.cumulativeYearAchievementRate.toFixed(2)}%`,
    }));
    exportToExcel(exportData, `EDP_Monthly_Forecast_Report`);
  };

  const handleExportYearly = () => {
    const exportData = edpResult.years.map(y => ({
      '合約年度 (Contract Year)': y.yearKey,
      '年度承諾目標 (Annual Target USD)': y.annualTarget,
      '月度 MRR 目標 (MRR Target USD)': y.mrrTarget,
      '實際月份數 (Actual Months)': y.actualMonthCount,
      '預估月份數 (Forecast Months)': y.forecastMonthCount,
      '總計月份數 (Total Months)': y.totalMonthCount,
      '歷史實際花費 (Actual Spend USD)': Number(y.actualAdjustedSpend.toFixed(2)),
      '未來預估花費 (Forecast Spend USD)': Number(y.forecastAdjustedSpend.toFixed(2)),
      '全年度預估合計 (Combined Spend USD)': Number(y.combinedAdjustedSpend.toFixed(2)),
      '年度差異額 (Annual Variance USD)': Number(y.variance.toFixed(2)),
      '年度達成率 (Achievement Rate %)': `${y.achievementRate.toFixed(2)}%`,
      '剩餘未達成承諾額 (Remaining Commitment USD)': Number(y.remainingCommitment.toFixed(2)),
      '合約進度狀態 (Status)': y.status === 'SURPLUS' ? '超額/達標 (Surplus)' : y.status === 'DEFICIT' ? '未達標 (Deficit)' : '進行中',
    }));

    exportData.push({
      '合約年度 (Contract Year)': '3-Year Total (3年總合約)',
      '年度承諾目標 (Annual Target USD)': edpResult.total3YearCommitment,
      '月度 MRR 目標 (MRR Target USD)': 0,
      '實際月份數 (Actual Months)': edpResult.actualMonthCount,
      '預估月份數 (Forecast Months)': edpResult.forecastMonthCount,
      '總計月份數 (Total Months)': edpResult.totalMonthCount,
      '歷史實際花費 (Actual Spend USD)': Number(edpResult.actualAdjustedSpend.toFixed(2)),
      '未來預估花費 (Forecast Spend USD)': Number((edpResult.totalAdjustedSpend - edpResult.actualAdjustedSpend).toFixed(2)),
      '全年度預估合計 (Combined Spend USD)': Number(edpResult.totalAdjustedSpend.toFixed(2)),
      '年度差異額 (Annual Variance USD)': Number(edpResult.projectedSurplusOrGap.toFixed(2)),
      '年度達成率 (Achievement Rate %)': `${edpResult.totalOverallAchievementRate.toFixed(2)}%`,
      '剩餘未達成承諾額 (Remaining Commitment USD)': Number(edpResult.totalRemainingCommitment.toFixed(2)),
      '合約進度狀態 (Status)': edpResult.totalAdjustedSpend >= edpResult.total3YearCommitment ? '達標 (Surplus)' : '進行中',
    });

    exportToExcel(exportData, `EDP_Yearly_Summary_Report`);
  };

  const handleExportProjects = () => {
    const exportData = (forecastSettings.projectedProjects || []).map(p => {
      const discountedAmount = p.isDiscounted ? p.monthlyAmount * config.discountRate : p.monthlyAmount;
      return {
        '專案名稱 (Project Name)': p.name,
        '分類 (Category)': p.category || '專案',
        '啟用狀態 (Enabled)': p.enabled ? '已啟用' : '已停用',
        '起始月份 (Start Month)': p.startMonth || '接續起始',
        '結束月份 (End Month)': p.endMonth || '持續至期滿',
        '每月預估費用 (USD)': p.monthlyAmount,
        '折後/實計費用 (Adjusted USD)': Number(discountedAmount.toFixed(2)),
        '享有 89 折折扣': p.isDiscounted ? '是 (89%)' : '否 (Marketplace 100%)',
        '專案備註 (Notes)': p.notes || '',
      };
    });
    exportToExcel(exportData, `EDP_Projected_Projects_List`);
  };

  return (
    <div className="space-y-8">
      {/* 頂部合約總覽與調整規則說明看板 */}
      <div className="bg-gradient-to-r from-gray-800 via-gray-800/95 to-blue-950/40 p-6 rounded-2xl border border-blue-500/30 shadow-xl space-y-5">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 pb-4 border-b border-gray-700">
          <div>
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 bg-blue-600/90 text-white text-xs font-bold rounded-lg shadow uppercase tracking-wider">
                AWS EDP 合約分析與成長預估
              </span>
              <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight">
                Enterprise Discount Program (EDP) 實際費用與未來成長預估
              </h2>
            </div>
            <p className="text-gray-400 text-sm mt-1">
              自動依據 4 大調帳規則計算實際用量，並提供使用者自訂未來預期新增用量（月成長率、專案工作負載上線），精準對比合約承諾。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowForecastManager(!showForecastManager)}
              className={`px-3.5 py-2 text-xs font-bold rounded-xl border transition shadow flex items-center gap-1.5 ${
                showForecastManager 
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500' 
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-200 border-gray-600'
              }`}
            >
              <span>{showForecastManager ? '📈 收合預估模擬器' : '📈 開啟未來預估模擬器'}</span>
            </button>
            <button
              onClick={() => setShowConfigModal(true)}
              className="px-3.5 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs font-medium rounded-xl border border-gray-600 transition shadow flex items-center gap-1.5"
            >
              <span>⚙️ 合約條款設定</span>
            </button>
            <div className="inline-flex rounded-xl shadow-sm bg-gray-900/80 p-1 border border-gray-700">
              <button
                onClick={handleExportMonthly}
                className="px-3 py-1.5 text-xs font-medium text-gray-300 hover:text-white hover:bg-blue-600/80 rounded-lg transition"
                title="匯出各月詳細費用與達成率 Excel"
              >
                📥 匯出月度 Excel
              </button>
              <button
                onClick={handleExportYearly}
                className="px-3 py-1.5 text-xs font-medium text-gray-300 hover:text-white hover:bg-blue-600/80 rounded-lg transition border-l border-gray-700"
                title="匯出年度彙總與總體進度 Excel"
              >
                📥 匯出年度 Excel
              </button>
            </div>
          </div>
        </div>

        {/* EDP 合約目標 Badge 區 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="bg-gray-900/70 p-3.5 rounded-xl border border-blue-500/30 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-blue-400 font-bold">Year 1 承諾目標</span>
              <span className="font-mono text-gray-300 font-semibold">$6.1M / 年</span>
            </div>
            <div className="text-gray-400 mt-1 flex justify-between">
              <span>每月 MRR 目標:</span>
              <strong className="text-white font-mono">$509K (USD)</strong>
            </div>
          </div>

          <div className="bg-gray-900/70 p-3.5 rounded-xl border border-blue-500/30 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-cyan-400 font-bold">Year 2 承諾目標</span>
              <span className="font-mono text-gray-300 font-semibold">$6.5M / 年</span>
            </div>
            <div className="text-gray-400 mt-1 flex justify-between">
              <span>每月 MRR 目標:</span>
              <strong className="text-white font-mono">$540K (USD)</strong>
            </div>
          </div>

          <div className="bg-gray-900/70 p-3.5 rounded-xl border border-blue-500/30 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-purple-400 font-bold">Year 3 承諾目標</span>
              <span className="font-mono text-gray-300 font-semibold">$7.4M / 年</span>
            </div>
            <div className="text-gray-400 mt-1 flex justify-between">
              <span>每月 MRR 目標:</span>
              <strong className="text-white font-mono">$617K (USD)</strong>
            </div>
          </div>

          <div className="bg-gray-900/70 p-3.5 rounded-xl border border-emerald-500/40 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-emerald-400 font-bold">3 Year Total 總承諾</span>
              <span className="font-mono text-emerald-300 font-bold">$20.0M (USD)</span>
            </div>
            <div className="text-gray-400 mt-1 text-[11px] leading-tight">
              3 年期企業採購合約總目標額
            </div>
          </div>
        </div>

        {/* 4 大資料調整機制快速指引 */}
        <div className="p-3 bg-gray-900/90 rounded-xl border border-gray-700/80 text-xs flex flex-wrap items-center gap-x-6 gap-y-2 text-gray-300">
          <span className="font-bold text-gray-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            調帳規則 (Adjusted Spend Rules):
          </span>
          <span className="flex items-center gap-1">
            <span className="text-rose-400 font-bold">① 扣除</span> OCBAWSskillbuilder 費用
          </span>
          <span className="flex items-center gap-1">
            <span className="text-rose-400 font-bold">② 扣除</span> AWS ID: <code className="text-yellow-300 bg-black/40 px-1 rounded font-mono">{config.excludedAccountId}</code>
          </span>
          <span className="flex items-center gap-1">
            <span className="text-blue-300 font-bold">③ Marketplace</span> 維持原價 (100%)
          </span>
          <span className="flex items-center gap-1">
            <span className="text-emerald-300 font-bold">④ 其餘一般項目</span> 費用享 89 折 (* 89%)
          </span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 未來用量與成長預估模擬器組件 (EdpForecastManager) */}
      {/* ========================================================================= */}
      {showForecastManager && (
        <EdpForecastManager
          settings={forecastSettings}
          onChange={setForecastSettings}
          lastActualMonth={lastActualMonth}
          futureMonthsList={futureMonthsList}
          discountRate={config.discountRate}
        />
      )}

      {/* 核心 KPI 決策指標面板 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* 3 年總 EDP 承諾進度 (實際 + 預估) */}
        <div className="bg-gray-800 p-5 rounded-2xl border border-gray-700 shadow-md">
          <div className="flex items-center justify-between text-gray-400 text-xs font-medium">
            <span>3 年總合約 ($20M) 達成進度</span>
            <span className={`px-2 py-0.5 rounded-full font-mono text-[11px] ${
              forecastSettings.enabled ? 'bg-indigo-900/60 text-indigo-300' : 'bg-blue-900/60 text-blue-300'
            }`}>
              {forecastSettings.enabled 
                ? `實計 ${edpResult.actualMonthCount} + 預估 ${edpResult.forecastMonthCount} 月` 
                : `實際 ${edpResult.actualMonthCount} 個月`}
            </span>
          </div>
          <div className="text-2xl lg:text-3xl font-extrabold text-white mt-2 font-mono flex items-baseline gap-2">
            <span>{formatShortCurrency(edpResult.totalAdjustedSpend)}</span>
            {forecastSettings.enabled && (
              <span className="text-xs font-normal text-indigo-400">
                (實計 {formatShortCurrency(edpResult.actualAdjustedSpend)})
              </span>
            )}
          </div>
          <div className="text-xs text-gray-400 mt-2 flex items-center justify-between">
            <span>{forecastSettings.enabled ? '預估總體達成率:' : '實際累計達成率:'}</span>
            <strong className={`font-mono text-sm ${
              edpResult.totalOverallAchievementRate >= 100 ? 'text-emerald-400' : 'text-blue-400'
            }`}>
              {formatPercent(edpResult.totalOverallAchievementRate)}
            </strong>
          </div>
          <div className="w-full bg-gray-700 h-2 rounded-full mt-2 overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${
                edpResult.totalOverallAchievementRate >= 100 ? 'bg-emerald-500' : 'bg-blue-500'
              }`}
              style={{ width: `${Math.min(100, edpResult.totalOverallAchievementRate)}%` }}
            ></div>
          </div>
          {edpResult.targetFulfillmentMonth && (
            <div className="text-[11px] text-emerald-400 mt-2 font-semibold flex items-center gap-1">
              <span>🎯 預計達標月份:</span>
              <span className="font-mono bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/30">
                {edpResult.targetFulfillmentMonth} 突破 $20M
              </span>
            </div>
          )}
        </div>

        {/* 原始費用 vs 累計節省 */}
        <div className="bg-gray-800 p-5 rounded-2xl border border-gray-700 shadow-md">
          <div className="flex items-center justify-between text-gray-400 text-xs font-medium">
            <span>原始未調金額 vs EDP 節省</span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-900/60 text-emerald-300 font-mono">
              89折+扣除項
            </span>
          </div>
          <div className="text-2xl lg:text-3xl font-extrabold text-emerald-400 mt-2 font-mono">
            {formatShortCurrency(edpResult.totalSavings)}
          </div>
          <div className="text-xs text-gray-400 mt-2 flex items-center justify-between">
            <span>原始未調總額:</span>
            <span className="text-gray-300 font-mono">{formatShortCurrency(edpResult.totalOriginalSpend)}</span>
          </div>
          <div className="text-xs text-gray-400 mt-1 flex items-center justify-between">
            <span>綜合節省率:</span>
            <strong className="text-emerald-400 font-mono">
              {edpResult.totalOriginalSpend > 0 ? formatPercent((edpResult.totalSavings / edpResult.totalOriginalSpend) * 100) : '0.0%'}
            </strong>
          </div>
        </div>

        {/* 目前合約年進度 */}
        {(() => {
          const currentYearObj = edpResult.years.find(y => y.yearKey === edpResult.activeYearKey) || edpResult.years[0];
          return (
            <div className="bg-gray-800 p-5 rounded-2xl border border-gray-700 shadow-md">
              <div className="flex items-center justify-between text-gray-400 text-xs font-medium">
                <span>目前合約年度 ({currentYearObj?.yearKey})</span>
                <span className={`px-2 py-0.5 rounded-full font-mono text-[11px] ${
                  currentYearObj?.status === 'SURPLUS' ? 'bg-emerald-900/60 text-emerald-300' : 'bg-purple-900/60 text-purple-300'
                }`}>
                  {currentYearObj?.totalMonthCount} / 12 月
                </span>
              </div>
              <div className="text-2xl lg:text-3xl font-extrabold text-white mt-2 font-mono">
                {formatShortCurrency(currentYearObj?.totalEdpAdjustedCost || 0)}
              </div>
              <div className="text-xs text-gray-400 mt-2 flex items-center justify-between">
                <span>年度目標 ({formatShortCurrency(currentYearObj?.annualTarget || 0)}):</span>
                <strong className={`font-mono text-sm ${
                  (currentYearObj?.achievementRate || 0) >= 100 ? 'text-emerald-400' : 'text-purple-400'
                }`}>
                  {formatPercent(currentYearObj?.achievementRate || 0)}
                </strong>
              </div>
              <div className="w-full bg-gray-700 h-2 rounded-full mt-2 overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${
                    (currentYearObj?.achievementRate || 0) >= 100 ? 'bg-emerald-500' : 'bg-purple-500'
                  }`}
                  style={{ width: `${Math.min(100, currentYearObj?.achievementRate || 0)}%` }}
                ></div>
              </div>
              <div className="text-[11px] text-gray-400 mt-2 flex justify-between">
                <span>年度差異/缺口:</span>
                <strong className={`font-mono ${(currentYearObj?.variance || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {formatVarianceText(currentYearObj?.variance || 0)}
                </strong>
              </div>
            </div>
          );
        })()}

        {/* 平均實際/預估 MRR vs 目標 MRR */}
        {(() => {
          const avgActualMrr = edpResult.actualMonthCount > 0 
            ? edpResult.actualAdjustedSpend / edpResult.actualMonthCount 
            : 0;
          const avgTotalMrr = edpResult.totalMonthCount > 0 
            ? edpResult.totalAdjustedSpend / edpResult.totalMonthCount 
            : 0;
          const currentYearObj = edpResult.years.find(y => y.yearKey === edpResult.activeYearKey) || edpResult.years[0];
          const targetMrr = currentYearObj?.mrrTarget || config.year1.mrrTarget;
          const mrrDiff = (forecastSettings.enabled ? avgTotalMrr : avgActualMrr) - targetMrr;
          const isSurplus = mrrDiff >= 0;

          return (
            <div className="bg-gray-800 p-5 rounded-2xl border border-gray-700 shadow-md">
              <div className="flex items-center justify-between text-gray-400 text-xs font-medium">
                <span>{forecastSettings.enabled ? '預估月均用量 (Projected MRR)' : '歷史月均用量 (Actual MRR)'}</span>
                <span className={`px-2 py-0.5 rounded-full font-mono text-xs ${
                  isSurplus ? 'bg-emerald-900/60 text-emerald-300' : 'bg-rose-900/60 text-rose-300'
                }`}>
                  {isSurplus ? '超額達標' : '未達目標'}
                </span>
              </div>
              <div className="text-2xl lg:text-3xl font-extrabold text-white mt-2 font-mono">
                {formatShortCurrency(forecastSettings.enabled ? avgTotalMrr : avgActualMrr)}
              </div>
              <div className="text-xs text-gray-400 mt-2 flex items-center justify-between">
                <span>{currentYearObj?.yearKey} 目標 MRR:</span>
                <span className="text-gray-300 font-mono">{formatShortCurrency(targetMrr)}</span>
              </div>
              <div className="text-xs text-gray-400 mt-1 flex items-center justify-between">
                <span>月均差異額:</span>
                <strong className={`font-mono ${isSurplus ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {formatVarianceText(mrrDiff)}
                </strong>
              </div>
            </div>
          );
        })()}
      </div>

      {/* 控制與檢視模式切換列 */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gray-800 p-4 rounded-xl border border-gray-700">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-bold text-gray-300 whitespace-nowrap">分析檢視維度:</span>
          <div className="inline-flex rounded-lg shadow-sm" role="group">
            <button
              type="button"
              onClick={() => setViewMode('monthly')}
              className={`px-4 py-2 text-sm font-medium border border-gray-600 rounded-l-lg transition-all ${
                viewMode === 'monthly'
                  ? 'bg-blue-600 text-white border-blue-600 shadow'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
              }`}
            >
              📅 月份維度 (Monthly View)
            </button>
            <button
              type="button"
              onClick={() => setViewMode('yearly')}
              className={`px-4 py-2 text-sm font-medium border border-gray-600 transition-all ${
                viewMode === 'yearly'
                  ? 'bg-blue-600 text-white border-blue-600 shadow'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
              }`}
            >
              📆 年度維度 (Yearly View)
            </button>
            <button
              type="button"
              onClick={() => setViewMode('projects')}
              className={`px-4 py-2 text-sm font-medium border border-gray-600 transition-all ${
                viewMode === 'projects'
                  ? 'bg-blue-600 text-white border-blue-600 shadow'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
              }`}
            >
              💼 專案貢獻明細 (Project Pipeline)
            </button>
            <button
              type="button"
              onClick={() => setViewMode('adjustments')}
              className={`px-4 py-2 text-sm font-medium border border-gray-600 rounded-r-lg transition-all ${
                viewMode === 'adjustments'
                  ? 'bg-blue-600 text-white border-blue-600 shadow'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
              }`}
            >
              🔍 調整明細與規則 (Adjustment Breakdown)
            </button>
          </div>
        </div>

        {viewMode === 'monthly' && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center space-x-2">
              <label className="text-xs font-medium text-gray-400 whitespace-nowrap">年度篩選:</label>
              <select
                value={selectedYearFilter}
                onChange={(e) => setSelectedYearFilter(e.target.value as any)}
                className="bg-gray-700 border border-gray-600 text-white text-xs rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500 font-medium cursor-pointer"
              >
                <option value="ALL">全部年度 (All Years)</option>
                <option value="Year 1">Year 1 (目標 $6.1M / MRR $509K)</option>
                <option value="Year 2">Year 2 (目標 $6.5M / MRR $540K)</option>
                <option value="Year 3">Year 3 (目標 $7.4M / MRR $617K)</option>
              </select>
            </div>

            {forecastSettings.enabled && (
              <div className="flex items-center space-x-2">
                <label className="text-xs font-medium text-gray-400 whitespace-nowrap">類別:</label>
                <select
                  value={monthTypeFilter}
                  onChange={(e) => setMonthTypeFilter(e.target.value as any)}
                  className="bg-gray-700 border border-gray-600 text-white text-xs rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500 font-medium cursor-pointer"
                >
                  <option value="ALL">全部 (實際+預估)</option>
                  <option value="ACTUAL_ONLY">僅歷史實際 ({edpResult.actualMonthCount} 月)</option>
                  <option value="FORECAST_ONLY">僅未來預估 ({edpResult.forecastMonthCount} 月)</option>
                </select>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 1. 月份維度 (Monthly View) */}
      {/* ========================================================================= */}
      {viewMode === 'monthly' && (
        <div className="space-y-8">
          {/* 圖表 1: 每月 EDP 實際與預估費用 vs 合約 MRR 目標 (直接顯示數字) */}
          <Card title="每月 EDP 實際與預估費用 vs 合約 MRR 目標對比 (Direct Numbered Chart)">
            <div className="text-xs text-gray-400 mb-4 flex flex-wrap items-center justify-between gap-3">
              <span>柱子與折線直接標註各月份之實際金額、預估金額與合約目標 (單位: USD)</span>
              <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 bg-blue-500 rounded-sm"></span>
                  <span className="text-gray-300">歷史實際花費 (89折後+Marketplace)</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 bg-cyan-400 rounded-sm"></span>
                  <span className="text-cyan-300">未來預估用量 (成長+自訂專案)</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-1 bg-amber-400"></span>
                  <span className="text-amber-300">合約 MRR 目標</span>
                </span>
              </div>
            </div>

            <div className="h-96 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={monthlyChartData}
                  margin={{ top: 28, right: 30, left: 20, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis 
                    dataKey="month" 
                    stroke="#9ca3af" 
                    tick={{ fill: '#d1d5db', fontSize: 11 }} 
                    interval={monthlyChartData.length > 24 ? 1 : 0}
                  />
                  <YAxis 
                    stroke="#9ca3af" 
                    tick={{ fill: '#d1d5db', fontSize: 12 }} 
                    tickFormatter={(val) => formatShortCurrency(val)}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1f2937', borderColor: '#4b5563', borderRadius: '0.75rem', color: '#f3f4f6' }}
                    formatter={(val: number, name: string) => [formatCurrency(val), name]}
                    labelFormatter={(label) => `計費月份: ${label}`}
                  />
                  <Legend />
                  <Bar 
                    dataKey="totalEdpAdjustedCost" 
                    name="EDP 費用 (實際/預估)" 
                    radius={[6, 6, 0, 0]}
                  >
                    <LabelList 
                      dataKey="displayActual" 
                      position="top" 
                      fill="#e0f2fe" 
                      fontSize={10} 
                      fontWeight="bold" 
                    />
                    {monthlyChartData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={
                          entry.isForecast 
                            ? (entry.isSurplus ? '#06b6d4' : '#6366f1') 
                            : (entry.isSurplus ? '#3b82f6' : '#818cf8')
                        } 
                      />
                    ))}
                  </Bar>
                  <Line 
                    type="stepAfter" 
                    dataKey="mrrTarget" 
                    name="合約 MRR 目標 (Target MRR)" 
                    stroke="#f59e0b" 
                    strokeWidth={3} 
                    dot={{ r: 3, fill: '#f59e0b' }}
                  >
                    <LabelList 
                      dataKey="displayTarget" 
                      position="top" 
                      fill="#fbbf24" 
                      fontSize={9} 
                      fontWeight="bold"
                    />
                  </Line>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* 圖表 2: 每月差異額 (Variance: 實際/預估 - 目標) 與達成率 (直接顯示數字) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card title="每月差異額 (Variance = 實際/預估 - 目標) 直接標記圖">
              <div className="text-xs text-gray-400 mb-4">
                正值 (綠色) 代表超額/達標；負值 (紅色) 代表未達合約每月 MRR 承諾額
              </div>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={monthlyChartData}
                    margin={{ top: 25, right: 20, left: 10, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis 
                      dataKey="month" 
                      stroke="#9ca3af" 
                      tick={{ fill: '#d1d5db', fontSize: 10 }}
                      interval={monthlyChartData.length > 24 ? 1 : 0}
                    />
                    <YAxis 
                      stroke="#9ca3af" 
                      tick={{ fill: '#d1d5db', fontSize: 11 }}
                      tickFormatter={(val) => formatShortCurrency(val)}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1f2937', borderColor: '#4b5563', borderRadius: '0.75rem', color: '#f3f4f6' }}
                      formatter={(val: number) => [formatVarianceText(val), '差異額 (Variance)']}
                    />
                    <Bar dataKey="variance" name="月度差異額 (Variance)" radius={[4, 4, 0, 0]}>
                      <LabelList 
                        dataKey="displayVariance" 
                        position="top" 
                        fill="#f3f4f6" 
                        fontSize={10} 
                        fontWeight="bold"
                      />
                      {monthlyChartData.map((entry, index) => (
                        <Cell 
                          key={`var-cell-${index}`} 
                          fill={entry.variance >= 0 ? '#10b981' : '#f43f5e'} 
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card title="每月合約達成率 (Achievement Rate %) 直接標記圖">
              <div className="text-xs text-gray-400 mb-4">
                基準線 100% 代表完全達成該月 MRR 目標
              </div>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={monthlyChartData}
                    margin={{ top: 25, right: 20, left: 10, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis 
                      dataKey="month" 
                      stroke="#9ca3af" 
                      tick={{ fill: '#d1d5db', fontSize: 10 }}
                      interval={monthlyChartData.length > 24 ? 1 : 0}
                    />
                    <YAxis 
                      stroke="#9ca3af" 
                      tick={{ fill: '#d1d5db', fontSize: 11 }}
                      tickFormatter={(val) => `${val}%`}
                      domain={[0, 'auto']}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1f2937', borderColor: '#4b5563', borderRadius: '0.75rem', color: '#f3f4f6' }}
                      formatter={(val: number) => [`${val}%`, '月度達成率']}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="achievementRate" 
                      name="達成率 (%)" 
                      stroke="#8b5cf6" 
                      strokeWidth={3} 
                      dot={{ r: 4, fill: '#8b5cf6' }}
                    >
                      <LabelList 
                        dataKey="displayAchievement" 
                        position="top" 
                        fill="#c084fc" 
                        fontSize={10} 
                        fontWeight="bold"
                      />
                    </Line>
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* 月度 EDP 對比明細數據表格 */}
          <Card title="EDP 月度明細對比數據清單 (Monthly Detail Table)">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left text-gray-300">
                <thead className="text-[11px] text-gray-400 uppercase bg-gray-900/80 border-b border-gray-700 font-semibold">
                  <tr>
                    <th className="px-3 py-3">月份</th>
                    <th className="px-3 py-3">類別</th>
                    <th className="px-3 py-3">合約年</th>
                    <th className="px-3 py-3 text-right">原始總額</th>
                    <th className="px-3 py-3 text-right text-rose-400">扣除 Skillbuilder</th>
                    <th className="px-3 py-3 text-right text-rose-400">扣除 927845210633</th>
                    <th className="px-3 py-3 text-right text-cyan-300">Marketplace</th>
                    <th className="px-3 py-3 text-right text-emerald-300">一般服務(89折)</th>
                    <th className="px-3 py-3 text-right text-indigo-300">專案新增增量</th>
                    <th className="px-3 py-3 text-right text-white font-bold bg-blue-950/40">EDP 最終金額</th>
                    <th className="px-3 py-3 text-right text-amber-300">MRR 目標</th>
                    <th className="px-3 py-3 text-right">月差異額</th>
                    <th className="px-3 py-3 text-right font-bold">達成率</th>
                    <th className="px-3 py-3 text-right text-purple-300">累計達成率</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/60 font-mono">
                  {displayedMonths.map((m) => {
                    const isSurplus = m.variance >= 0;
                    return (
                      <tr key={m.month} className={`hover:bg-gray-700/40 transition ${m.isForecast ? 'bg-indigo-950/10' : ''}`}>
                        <td className="px-3 py-2.5 font-bold text-white font-sans">{m.month}</td>
                        <td className="px-3 py-2.5 font-sans">
                          {m.isForecast ? (
                            <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/30 text-[10px] font-bold">
                              預估
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-500/30 text-[10px]">
                              實際
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 font-sans">
                          <span className="px-2 py-0.5 rounded bg-gray-700 text-gray-200 text-[10px]">
                            {m.contractYear}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right text-gray-400">{formatCurrency(m.originalTotal)}</td>
                        <td className="px-3 py-2.5 text-right text-rose-400">
                          {m.excludedSkillbuilderCost > 0 ? `-${formatCurrency(m.excludedSkillbuilderCost)}` : '$0'}
                        </td>
                        <td className="px-3 py-2.5 text-right text-rose-400">
                          {m.excludedAccountCost > 0 ? `-${formatCurrency(m.excludedAccountCost)}` : '$0'}
                        </td>
                        <td className="px-3 py-2.5 text-right text-cyan-300">{formatCurrency(m.marketplaceCost)}</td>
                        <td className="px-3 py-2.5 text-right text-emerald-300">{formatCurrency(m.standardDiscountedCost)}</td>
                        <td className="px-3 py-2.5 text-right text-indigo-300">
                          {m.isForecast && (m.projectAdditionsCost || 0) > 0 ? `+${formatCurrency(m.projectAdditionsCost || 0)}` : '-'}
                        </td>
                        <td className="px-3 py-2.5 text-right text-white font-bold bg-blue-950/30 text-sm">
                          {formatCurrency(m.totalEdpAdjustedCost)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-amber-300">{formatCurrency(m.mrrTarget)}</td>
                        <td className={`px-3 py-2.5 text-right font-bold ${isSurplus ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {formatVarianceText(m.variance)}
                        </td>
                        <td className={`px-3 py-2.5 text-right font-bold ${isSurplus ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {formatPercent(m.achievementRate)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-purple-300 font-bold">
                          {formatPercent(m.cumulativeYearAchievementRate)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. 年度維度 (Yearly View) */}
      {/* ========================================================================= */}
      {viewMode === 'yearly' && (
        <div className="space-y-8">
          {/* 圖表 1: 各年度累計實際/預估 vs 年度目標 (直接顯示數字) */}
          <Card title="各年度 EDP 累計與預估費用 vs 年度承諾目標 ($M USD) 直接標記圖">
            <div className="text-xs text-gray-400 mb-4 flex flex-wrap items-center justify-between gap-3">
              <span>直接在柱子上顯示金額與達成進度 (單位: 百萬 USD, $M)</span>
              <div className="flex items-center gap-4 text-xs font-mono">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 bg-blue-500 rounded-sm"></span>
                  <span className="text-gray-300">歷史實際花費</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 bg-cyan-400 rounded-sm"></span>
                  <span className="text-cyan-300">未來預估增量</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 bg-gray-600 rounded-sm"></span>
                  <span className="text-gray-300">年度承諾總目標</span>
                </span>
              </div>
            </div>

            <div className="h-96 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={yearlyChartData}
                  margin={{ top: 28, right: 30, left: 20, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="yearKey" stroke="#9ca3af" tick={{ fill: '#d1d5db', fontSize: 13, fontWeight: 'bold' }} />
                  <YAxis 
                    stroke="#9ca3af" 
                    tick={{ fill: '#d1d5db', fontSize: 12 }} 
                    tickFormatter={(val) => `$${val}M`}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1f2937', borderColor: '#4b5563', borderRadius: '0.75rem', color: '#f3f4f6' }}
                    formatter={(val: number, name: string) => [`$${val}M (USD)`, name]}
                  />
                  <Legend />
                  <Bar 
                    dataKey="actualInM" 
                    name="歷史實際費用 ($M)" 
                    fill="#3b82f6" 
                    stackId="spend"
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar 
                    dataKey="forecastInM" 
                    name="未來預估費用 ($M)" 
                    fill="#06b6d4" 
                    stackId="spend"
                    radius={[6, 6, 0, 0]}
                  >
                    <LabelList 
                      dataKey="displayCombined" 
                      position="top" 
                      fill="#67e8f9" 
                      fontSize={12} 
                      fontWeight="bold" 
                    />
                  </Bar>
                  <Bar 
                    dataKey="annualTargetInM" 
                    name="年度承諾目標 ($M)" 
                    fill="#4b5563" 
                    radius={[6, 6, 0, 0]}
                  >
                    <LabelList 
                      dataKey="displayTarget" 
                      position="top" 
                      fill="#9ca3af" 
                      fontSize={12} 
                      fontWeight="bold" 
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* 全期間 3 年累計走勢圖 */}
          <Card title="全期間累計花費 (實際+預估) vs $20M 合約目標走勢 (3-Year Cumulative Trend)">
            <div className="text-xs text-gray-400 mb-4 flex items-center justify-between">
              <span>實線代表歷史實際花費累計，虛線代表未來預估成長軌跡，並標記合約累計線</span>
              {edpResult.targetFulfillmentMonth && (
                <span className="text-emerald-400 font-bold bg-emerald-950/60 px-2.5 py-1 rounded-lg border border-emerald-500/30">
                  🎯 預計於 {edpResult.targetFulfillmentMonth} 達到 3 年 $20M 總承諾目標！
                </span>
              )}
            </div>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={cumulativeTrendData}
                  margin={{ top: 25, right: 30, left: 20, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis 
                    dataKey="month" 
                    stroke="#9ca3af" 
                    tick={{ fill: '#d1d5db', fontSize: 11 }} 
                    interval={cumulativeTrendData.length > 24 ? 2 : 0}
                  />
                  <YAxis 
                    stroke="#9ca3af" 
                    tick={{ fill: '#d1d5db', fontSize: 11 }}
                    tickFormatter={(val) => formatShortCurrency(val)}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1f2937', borderColor: '#4b5563', borderRadius: '0.75rem', color: '#f3f4f6' }}
                    formatter={(val: number) => [formatCurrency(val), '累計金額']}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="cumulativeActual" 
                    name="全期累計費用 (實際+預估)" 
                    stroke="#06b6d4" 
                    strokeWidth={3} 
                    dot={{ r: 3, fill: '#06b6d4' }}
                  >
                    <LabelList 
                      dataKey="displayActual" 
                      position="top" 
                      fill="#67e8f9" 
                      fontSize={9} 
                      fontWeight="bold"
                    />
                  </Line>
                  <Line 
                    type="monotone" 
                    dataKey="cumulativeTarget" 
                    name="合約累計目標" 
                    stroke="#f59e0b" 
                    strokeWidth={2} 
                    strokeDasharray="5 5"
                    dot={{ r: 2, fill: '#f59e0b' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* 年度承諾統計表格 */}
          <Card title="EDP 各年度承諾與執行進度統計表 (Annual Commitment Summary)">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left text-gray-300">
                <thead className="text-[11px] text-gray-400 uppercase bg-gray-900/80 border-b border-gray-700 font-semibold">
                  <tr>
                    <th className="px-4 py-3.5">合約年度</th>
                    <th className="px-4 py-3.5">涵蓋月份 (實計+預估)</th>
                    <th className="px-4 py-3.5 text-right">年度目標承諾額</th>
                    <th className="px-4 py-3.5 text-right">月 MRR 目標</th>
                    <th className="px-4 py-3.5 text-right text-blue-300">歷史實際花費</th>
                    <th className="px-4 py-3.5 text-right text-cyan-300">未來預估增量</th>
                    <th className="px-4 py-3.5 text-right text-white font-bold bg-blue-950/40">全年度預估合計</th>
                    <th className="px-4 py-3.5 text-right">年度差異額</th>
                    <th className="px-4 py-3.5 text-right font-bold">年度達成率</th>
                    <th className="px-4 py-3.5 text-right text-amber-300">剩餘承諾額</th>
                    <th className="px-4 py-3.5 text-center">進度狀態</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/60 font-mono">
                  {edpResult.years.map((y) => {
                    const isSurplus = y.variance >= 0;
                    return (
                      <tr key={y.yearKey} className="hover:bg-gray-700/40 transition">
                        <td className="px-4 py-3 font-bold text-white font-sans text-sm">{y.yearKey}</td>
                        <td className="px-4 py-3 font-sans">
                          <span className="px-2 py-0.5 rounded bg-gray-700 text-gray-200 text-xs">
                            實計 {y.actualMonthCount} + 預估 {y.forecastMonthCount} / 12 月
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-300 font-semibold">{formatCurrency(y.annualTarget)}</td>
                        <td className="px-4 py-3 text-right text-gray-400">{formatCurrency(y.mrrTarget)}</td>
                        <td className="px-4 py-3 text-right text-blue-300 font-semibold">{formatCurrency(y.actualAdjustedSpend)}</td>
                        <td className="px-4 py-3 text-right text-cyan-300 font-semibold">{formatCurrency(y.forecastAdjustedSpend)}</td>
                        <td className="px-4 py-3 text-right text-white font-bold bg-blue-950/30 text-sm">
                          {formatCurrency(y.combinedAdjustedSpend)}
                        </td>
                        <td className={`px-4 py-3 text-right font-bold ${isSurplus ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {formatVarianceText(y.variance)}
                        </td>
                        <td className={`px-4 py-3 text-right font-bold text-sm ${isSurplus ? 'text-emerald-400' : 'text-purple-300'}`}>
                          {formatPercent(y.achievementRate)}
                        </td>
                        <td className="px-4 py-3 text-right text-amber-300 font-semibold">
                          {formatCurrency(y.remainingCommitment)}
                        </td>
                        <td className="px-4 py-3 text-center font-sans">
                          <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                            y.status === 'SURPLUS'
                              ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700/50'
                              : 'bg-rose-900/40 text-rose-300 border-rose-700/50'
                          }`}>
                            {y.status === 'SURPLUS' ? '超額達標' : '未達目標'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {/* 3-Year Total Row */}
                  <tr className="bg-gray-900/90 font-bold border-t-2 border-blue-500/50">
                    <td className="px-4 py-3.5 text-blue-300 font-sans text-sm">3 Year Total</td>
                    <td className="px-4 py-3.5 font-sans text-white">共 {edpResult.totalMonthCount} 個月 (全期)</td>
                    <td className="px-4 py-3.5 text-right text-blue-300 text-sm">{formatCurrency(edpResult.total3YearCommitment)}</td>
                    <td className="px-4 py-3.5 text-right text-gray-400">-</td>
                    <td className="px-4 py-3.5 text-right text-blue-300 text-sm">{formatCurrency(edpResult.actualAdjustedSpend)}</td>
                    <td className="px-4 py-3.5 text-right text-cyan-300 text-sm">
                      {formatCurrency(edpResult.totalAdjustedSpend - edpResult.actualAdjustedSpend)}
                    </td>
                    <td className="px-4 py-3.5 text-right text-white text-base bg-blue-950/60">
                      {formatCurrency(edpResult.totalAdjustedSpend)}
                    </td>
                    <td className={`px-4 py-3.5 text-right text-sm ${edpResult.totalAdjustedSpend >= edpResult.total3YearCommitment ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {formatVarianceText(edpResult.projectedSurplusOrGap)}
                    </td>
                    <td className="px-4 py-3.5 text-right text-blue-400 text-sm font-extrabold">
                      {formatPercent(edpResult.totalOverallAchievementRate)}
                    </td>
                    <td className="px-4 py-3.5 text-right text-amber-300 text-sm">
                      {formatCurrency(edpResult.totalRemainingCommitment)}
                    </td>
                    <td className="px-4 py-3.5 text-center font-sans">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                        edpResult.totalAdjustedSpend >= edpResult.total3YearCommitment 
                          ? 'bg-emerald-900/60 text-emerald-200 border-emerald-600' 
                          : 'bg-blue-900/60 text-blue-200 border-blue-600'
                      }`}>
                        {edpResult.totalAdjustedSpend >= edpResult.total3YearCommitment ? '預估總合約超額達標' : '履約進行中'}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. 專案貢獻明細 (Project Pipeline View) */}
      {/* ========================================================================= */}
      {viewMode === 'projects' && (
        <div className="space-y-6">
          <Card title="新增預期工作負載與專案貢獻統計 (Projected Workload Pipeline)">
            <div className="flex justify-between items-center mb-4">
              <span className="text-xs text-gray-400">
                此處彙整使用者輸入的所有未來預期專案，分析其在 EDP 承諾中之累計貢獻金額。
              </span>
              <button
                type="button"
                onClick={handleExportProjects}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow"
              >
                📥 匯出專案清單 Excel
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left text-gray-300">
                <thead className="text-[11px] text-gray-400 uppercase bg-gray-900/80 border-b border-gray-700 font-semibold">
                  <tr>
                    <th className="px-4 py-3">專案名稱</th>
                    <th className="px-4 py-3">分類</th>
                    <th className="px-4 py-3">狀態</th>
                    <th className="px-4 py-3">起始月份</th>
                    <th className="px-4 py-3">結束月份</th>
                    <th className="px-4 py-3 text-right">原始月預估 (USD)</th>
                    <th className="px-4 py-3 text-right text-emerald-400 font-bold">EDP 折後計價 (USD)</th>
                    <th className="px-4 py-3">計價模式</th>
                    <th className="px-4 py-3">專案備註</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/60 font-mono">
                  {(forecastSettings.projectedProjects || []).map((p) => {
                    const discountedAmount = p.isDiscounted ? p.monthlyAmount * config.discountRate : p.monthlyAmount;
                    return (
                      <tr key={p.id} className="hover:bg-gray-700/40 transition">
                        <td className="px-4 py-3 font-bold text-white font-sans text-sm">{p.name}</td>
                        <td className="px-4 py-3 font-sans">
                          <span className="px-2 py-0.5 bg-indigo-950 text-indigo-300 text-[10px] font-semibold rounded border border-indigo-500/30">
                            {p.category || '專案'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-sans">
                          {p.enabled ? (
                            <span className="px-2 py-0.5 bg-emerald-950 text-emerald-300 text-[10px] font-semibold rounded border border-emerald-500/30">
                              已啟用
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-gray-800 text-gray-400 text-[10px] rounded">
                              已停用
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-300">{p.startMonth || '接續起始'}</td>
                        <td className="px-4 py-3 text-gray-400">{p.endMonth || '持續至期滿'}</td>
                        <td className="px-4 py-3 text-right text-gray-300">{formatCurrency(p.monthlyAmount)}</td>
                        <td className="px-4 py-3 text-right text-emerald-400 font-bold text-sm">
                          {formatCurrency(discountedAmount)}
                        </td>
                        <td className="px-4 py-3 font-sans text-xs">
                          {p.isDiscounted ? (
                            <span className="text-emerald-300">89 折計價 (*89%)</span>
                          ) : (
                            <span className="text-cyan-300">Marketplace 100%</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-sans text-gray-400">{p.notes || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. 調整明細與規則 (Adjustment Breakdown) */}
      {/* ========================================================================= */}
      {viewMode === 'adjustments' && (
        <div className="space-y-6">
          <Card title="四類資料調整金額統計 (Adjustment Rules Distribution)">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-gray-900/70 p-4 rounded-xl border border-rose-500/30">
                <span className="text-xs font-bold text-rose-400">① 扣除 Skillbuilder</span>
                <div className="text-xl font-bold text-white mt-1 font-mono">
                  {formatCurrency(edpResult.actualMonths.reduce((s, m) => s + m.excludedSkillbuilderCost, 0))}
                </div>
                <div className="text-[11px] text-gray-400 mt-1">OCBAWSskillbuilder 相關費用全扣</div>
              </div>

              <div className="bg-gray-900/70 p-4 rounded-xl border border-rose-500/30">
                <span className="text-xs font-bold text-rose-400">② 扣除帳號 {config.excludedAccountId}</span>
                <div className="text-xl font-bold text-white mt-1 font-mono">
                  {formatCurrency(edpResult.actualMonths.reduce((s, m) => s + m.excludedAccountCost, 0))}
                </div>
                <div className="text-[11px] text-gray-400 mt-1">指定特定帳號全數扣除</div>
              </div>

              <div className="bg-gray-900/70 p-4 rounded-xl border border-cyan-500/30">
                <span className="text-xs font-bold text-cyan-400">③ Marketplace (100% 原價)</span>
                <div className="text-xl font-bold text-white mt-1 font-mono">
                  {formatCurrency(edpResult.actualMonths.reduce((s, m) => s + m.marketplaceCost, 0))}
                </div>
                <div className="text-[11px] text-gray-400 mt-1">第三方市集產品維持原價</div>
              </div>

              <div className="bg-gray-900/70 p-4 rounded-xl border border-emerald-500/30">
                <span className="text-xs font-bold text-emerald-400">④ 一般 AWS 服務 (89 折計價)</span>
                <div className="text-xl font-bold text-white mt-1 font-mono">
                  {formatCurrency(edpResult.actualMonths.reduce((s, m) => s + m.standardDiscountedCost, 0))}
                </div>
                <div className="text-[11px] text-gray-400 mt-1">
                  原始 {formatShortCurrency(edpResult.actualMonths.reduce((s, m) => s + m.standardOriginalCost, 0))} (* 89%)
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left text-gray-300">
                <thead className="text-[11px] text-gray-400 uppercase bg-gray-900/80 border-b border-gray-700 font-semibold">
                  <tr>
                    <th className="px-4 py-3">月份</th>
                    <th className="px-4 py-3 text-right">原始總額</th>
                    <th className="px-4 py-3 text-right text-rose-400">扣除 Skillbuilder</th>
                    <th className="px-4 py-3 text-right text-rose-400">扣除帳號 ({config.excludedAccountId})</th>
                    <th className="px-4 py-3 text-right text-cyan-300">Marketplace 原價 (100%)</th>
                    <th className="px-4 py-3 text-right text-gray-300">一般服務原始額</th>
                    <th className="px-4 py-3 text-right text-emerald-300 font-bold">一般服務 89 折後額</th>
                    <th className="px-4 py-3 text-right text-white font-bold bg-blue-950/40">最終 EDP 實際費用</th>
                    <th className="px-4 py-3 text-right text-emerald-400">節省總額 (Savings)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/60 font-mono">
                  {edpResult.actualMonths.map(m => (
                    <tr key={m.month} className="hover:bg-gray-700/40 transition">
                      <td className="px-4 py-2.5 font-bold text-white font-sans">{m.month}</td>
                      <td className="px-4 py-2.5 text-right text-gray-400">{formatCurrency(m.originalTotal)}</td>
                      <td className="px-4 py-2.5 text-right text-rose-400">{formatCurrency(m.excludedSkillbuilderCost)}</td>
                      <td className="px-4 py-2.5 text-right text-rose-400">{formatCurrency(m.excludedAccountCost)}</td>
                      <td className="px-4 py-2.5 text-right text-cyan-300">{formatCurrency(m.marketplaceCost)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-400">{formatCurrency(m.standardOriginalCost)}</td>
                      <td className="px-4 py-2.5 text-right text-emerald-300 font-bold">{formatCurrency(m.standardDiscountedCost)}</td>
                      <td className="px-4 py-2.5 text-right text-white font-bold bg-blue-950/30">{formatCurrency(m.totalEdpAdjustedCost)}</td>
                      <td className="px-4 py-2.5 text-right text-emerald-400 font-bold">{formatCurrency(m.totalSavings)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* 合約參數與起始月份設定 Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-gray-800 rounded-2xl border border-gray-700 shadow-2xl max-w-xl w-full p-6 space-y-6">
            <div className="flex justify-between items-center pb-3 border-b border-gray-700">
              <h3 className="text-lg font-bold text-white">⚙️ EDP 合約條款與計算參數設定</h3>
              <button
                onClick={() => setShowConfigModal(false)}
                className="text-gray-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-gray-300 font-semibold mb-1">
                  合約 Year 1 起始月份 (預設依匯入第 1 個月起算):
                </label>
                <select
                  value={startMonthOverride}
                  onChange={(e) => setStartMonthOverride(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                >
                  <option value="">自動由第一個月開始 ({sortedActualMonths[0] || '無資料'})</option>
                  {sortedActualMonths.map(m => (
                    <option key={m} value={m}>{m} 起始為 Year 1</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-700/80">
                <div>
                  <label className="block text-gray-300 font-semibold mb-1">Year 1 年度目標 (USD):</label>
                  <input
                    type="number"
                    value={config.year1.annualTarget}
                    onChange={(e) => setConfig({
                      ...config,
                      year1: { ...config.year1, annualTarget: Number(e.target.value) }
                    })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 font-semibold mb-1">Year 1 MRR 目標 (USD):</label>
                  <input
                    type="number"
                    value={config.year1.mrrTarget}
                    onChange={(e) => setConfig({
                      ...config,
                      year1: { ...config.year1, mrrTarget: Number(e.target.value) }
                    })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-300 font-semibold mb-1">Year 2 年度目標 (USD):</label>
                  <input
                    type="number"
                    value={config.year2.annualTarget}
                    onChange={(e) => setConfig({
                      ...config,
                      year2: { ...config.year2, annualTarget: Number(e.target.value) }
                    })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 font-semibold mb-1">Year 2 MRR 目標 (USD):</label>
                  <input
                    type="number"
                    value={config.year2.mrrTarget}
                    onChange={(e) => setConfig({
                      ...config,
                      year2: { ...config.year2, mrrTarget: Number(e.target.value) }
                    })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-300 font-semibold mb-1">Year 3 年度目標 (USD):</label>
                  <input
                    type="number"
                    value={config.year3.annualTarget}
                    onChange={(e) => setConfig({
                      ...config,
                      year3: { ...config.year3, annualTarget: Number(e.target.value) }
                    })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 font-semibold mb-1">Year 3 MRR 目標 (USD):</label>
                  <input
                    type="number"
                    value={config.year3.mrrTarget}
                    onChange={(e) => setConfig({
                      ...config,
                      year3: { ...config.year3, mrrTarget: Number(e.target.value) }
                    })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-700/80">
                <div>
                  <label className="block text-gray-300 font-semibold mb-1">排除特定 AWS Account ID:</label>
                  <input
                    type="text"
                    value={config.excludedAccountId}
                    onChange={(e) => setConfig({ ...config, excludedAccountId: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 font-semibold mb-1">一般服務折扣率 (89% = 0.89):</label>
                  <input
                    type="number"
                    step="0.01"
                    value={config.discountRate}
                    onChange={(e) => setConfig({ ...config, discountRate: Number(e.target.value) })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-white font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-gray-700">
              <button
                type="button"
                onClick={() => {
                  setConfig(DEFAULT_EDP_CONFIG);
                  setStartMonthOverride('');
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-semibold rounded-lg"
              >
                重設為預設值
              </button>
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow"
              >
                套用並關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EdpAnalysisTab;
