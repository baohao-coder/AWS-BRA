import React, { useState, useMemo, useEffect } from 'react';
import { BillingData } from '../../types';
import { 
  calculateForecast, 
  ForecastHorizon, 
  ForecastSummary 
} from '../../services/forecastCalculator';
import { exportToExcel } from '../../services/excelUtils';
import Card from '../common/Card';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  LabelList
} from 'recharts';

interface ForecastAnalysisSectionProps {
  data: BillingData;
  accountFilterSummaryText: string;
}

const formatNumber = (value: number, decimals: number = 2) => {
  if (typeof value !== 'number' || isNaN(value)) return '0.00';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
};

export const ForecastAnalysisSection: React.FC<ForecastAnalysisSectionProps> = ({
  data,
  accountFilterSummaryText
}) => {
  // Horizon state - Default is 0: '僅歷史實際 (不含預估)' as requested
  const [horizon, setHorizon] = useState<ForecastHorizon>(0);
  
  // Growth rate model: 'auto' (historical trend) or 'custom'
  const [growthModel, setGrowthModel] = useState<'auto' | 'custom'>('auto');
  const [customAnnualRate, setCustomAnnualRate] = useState<number>(10);
  
  // View mode: 'total' | 'services' | 'single_service'
  const [viewMode, setViewMode] = useState<'total' | 'services' | 'single_service'>('total');
  
  // Single service selection state
  const [selectedService, setSelectedService] = useState<string>('');

  const forecastData: ForecastSummary = useMemo(() => {
    const rateToPass = growthModel === 'custom' ? customAnnualRate : undefined;
    return calculateForecast(data, horizon, rateToPass);
  }, [data, horizon, growthModel, customAnnualRate]);

  // Synchronize default selected service
  useEffect(() => {
    if (forecastData.allServicesList && forecastData.allServicesList.length > 0) {
      if (!selectedService || !forecastData.allServicesList.some(s => s.productName === selectedService)) {
        setSelectedService(forecastData.allServicesList[0].productName);
      }
    }
  }, [forecastData.allServicesList, selectedService]);

  // Single Service specific metrics & projection breakdown
  const singleServiceStats = useMemo(() => {
    if (!selectedService || !forecastData.allServicesList) return null;
    const svcInfo = forecastData.allServicesList.find(s => s.productName === selectedService);
    if (!svcInfo) return null;

    let singleCum = 0;
    const monthlyPoints = forecastData.dataPoints.map((p, idx) => {
      const cost = p.serviceBreakdown?.[selectedService] || 0;
      singleCum += cost;
      const prevCost = idx > 0 ? (forecastData.dataPoints[idx - 1].serviceBreakdown?.[selectedService] || 0) : cost;
      const mom = prevCost > 0 ? ((cost - prevCost) / prevCost) * 100 : 0;
      const totalSpendInMonth = p.displayCost > 0 ? p.displayCost : 1;
      const shareOfTotal = (cost / totalSpendInMonth) * 100;
      const isLastHistorical = p.isHistorical && (idx === forecastData.historicalMonthsCount - 1);

      return {
        month: p.month,
        isHistorical: p.isHistorical,
        cost,
        actualCost: p.isHistorical ? cost : null,
        forecastCost: !p.isHistorical ? cost : (isLastHistorical && horizon > 0 ? cost : null),
        cumulativeCost: singleCum,
        monthOverMonthGrowthRate: idx === 0 ? 0 : mom,
        shareOfTotal
      };
    });

    const historicalPts = monthlyPoints.filter(p => p.isHistorical);
    const forecastPts = monthlyPoints.filter(p => !p.isHistorical);
    const totalHistorical = historicalPts.reduce((sum, p) => sum + p.cost, 0);
    const avgHistorical = historicalPts.length > 0 ? totalHistorical / historicalPts.length : 0;
    const latestHistoricalCost = historicalPts.length > 0 ? historicalPts[historicalPts.length - 1].cost : 0;
    const totalForecast = forecastPts.reduce((sum, p) => sum + p.cost, 0);
    const finalMonthSpend = forecastPts.length > 0 ? forecastPts[forecastPts.length - 1].cost : latestHistoricalCost;
    const annualRunRate = finalMonthSpend * 12;
    const totalWithHistory = singleCum;
    const shareOfOverallHistorical = forecastData.totalHistoricalSpend > 0 
      ? (totalHistorical / forecastData.totalHistoricalSpend) * 100 
      : 0;

    return {
      productName: selectedService,
      totalHistorical,
      avgHistorical,
      latestHistoricalCost,
      totalForecast,
      finalMonthSpend,
      annualRunRate,
      totalWithHistory,
      shareOfOverallHistorical,
      monthlyPoints
    };
  }, [selectedService, forecastData]);

  // Chart data preparation for Total and Top Services
  const chartData = useMemo(() => {
    return forecastData.dataPoints.map((p, idx) => {
      const isLastHistorical = p.isHistorical && (idx === forecastData.historicalMonthsCount - 1);
      const item: any = {
        month: p.month,
        isHistorical: p.isHistorical,
        '歷史實際費用': p.isHistorical ? p.actualCost : null,
        '預估費用': !p.isHistorical ? p.forecastCost : (isLastHistorical && horizon > 0 ? p.actualCost : null),
        '累計費用': p.cumulativeCost,
        '月增長率': p.monthOverMonthGrowthRate
      };

      if (p.serviceBreakdown) {
        Object.entries(p.serviceBreakdown).forEach(([prod, val]) => {
          item[prod] = val;
        });
      }

      return item;
    });
  }, [forecastData, horizon]);

  // Export to Excel
  const handleExportExcel = () => {
    const horizonLabel = horizon === 0 ? '歷史實際 (純歷史)' : `預估_${horizon}個月`;
    const modeLabel = viewMode === 'single_service' ? `單一服務_${selectedService.replace(/[\/\\?%*:|"<>]/g, '_')}` : '總體';
    const filename = `aws_billing_forecast_${modeLabel}_${horizonLabel}_${new Date().toISOString().split('T')[0]}`;

    if (viewMode === 'single_service' && singleServiceStats) {
      const rows = singleServiceStats.monthlyPoints.map(p => ({
        '服務名稱': selectedService,
        '計費/預估月份': p.month,
        '數據性質': p.isHistorical ? '歷史實際 (Actual)' : '預估數值 (Forecast)',
        '當月該服務費用 ($USD)': p.cost.toFixed(2),
        '該服務月增長率 (%)': `${p.monthOverMonthGrowthRate >= 0 ? '+' : ''}${p.monthOverMonthGrowthRate.toFixed(2)}%`,
        '該服務累計總額 ($USD)': p.cumulativeCost.toFixed(2),
        '佔當月全部支出比例 (%)': `${p.shareOfTotal.toFixed(2)}%`,
        '分析帳號維度': accountFilterSummaryText,
        '預估年增長率設定': growthModel === 'custom' ? `${customAnnualRate}%` : `歷史趨勢 (${(forecastData.calculatedMonthlyGrowthRate * 12 * 100).toFixed(1)}% 年化)`
      }));
      exportToExcel(rows, filename);
      return;
    }

    const rows = forecastData.dataPoints.map(p => {
      const row: Record<string, string> = {
        '計費/預估月份': p.month,
        '數據性質': p.isHistorical ? '歷史實際 (Actual)' : '預估數值 (Forecast)',
        '當月金額 ($USD)': p.displayCost.toFixed(2),
        '月增長率 (%)': `${p.monthOverMonthGrowthRate >= 0 ? '+' : ''}${p.monthOverMonthGrowthRate.toFixed(2)}%`,
        '累計總額 ($USD)': p.cumulativeCost.toFixed(2),
        '分析帳號維度': accountFilterSummaryText,
        '預估年增長率設定': growthModel === 'custom' ? `${customAnnualRate}%` : `歷史趨勢 (${(forecastData.calculatedMonthlyGrowthRate * 12 * 100).toFixed(1)}% 年化)`
      };

      if (p.serviceBreakdown) {
        Object.entries(p.serviceBreakdown).slice(0, 10).forEach(([srvName, srvCost]) => {
          row[`[服務] ${srvName} ($USD)`] = srvCost.toFixed(2);
        });
      }

      return row;
    });

    exportToExcel(rows, filename);
  };

  return (
    <div className="space-y-6">
      {/* 1. 控制與情境設定看板 */}
      <div className="bg-gray-800 p-5 rounded-xl border border-gray-700 shadow-md space-y-4">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 pb-4 border-b border-gray-700">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>📈</span>
              <span>歷史量與預估費用 (12 / 24 / 36 個月成長模型)</span>
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              支援檢視純歷史實際用量與花費，或基於歷史趨勢及自訂增長率進行 12 / 24 / 36 個月前瞻預估，可切換總體、Top 服務或指定單一服務維度
            </p>
          </div>

          {/* 匯出 Excel 按鈕 */}
          <button
            onClick={handleExportExcel}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <span>📊</span>
            <span>匯出預估模型 Excel {viewMode === 'single_service' && `(單一服務)`}</span>
          </button>
        </div>

        {/* 控制設定列 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
          {/* 預估週期選擇 (Forecast Horizon) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-300 flex items-center justify-between">
              <span>分析模式 / 預估週期：</span>
              <span className="text-[11px] text-blue-400 font-mono">
                {horizon === 0 ? '純歷史 (無預估)' : `歷史 + ${horizon} 個月`}
              </span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-gray-900/80 p-1 rounded-lg border border-gray-700">
              <button
                type="button"
                onClick={() => setHorizon(0)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded transition text-center ${
                  horizon === 0
                    ? 'bg-blue-600 text-white shadow font-bold'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                僅歷史實際
              </button>
              <button
                type="button"
                onClick={() => setHorizon(12)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded transition text-center ${
                  horizon === 12
                    ? 'bg-amber-600 text-white shadow font-bold'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                預估 12 個月
              </button>
              <button
                type="button"
                onClick={() => setHorizon(24)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded transition text-center ${
                  horizon === 24
                    ? 'bg-purple-600 text-white shadow font-bold'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                預估 24 個月
              </button>
              <button
                type="button"
                onClick={() => setHorizon(36)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded transition text-center ${
                  horizon === 36
                    ? 'bg-indigo-600 text-white shadow font-bold'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                預估 36 個月
              </button>
            </div>
          </div>

          {/* 增長率模型設定 (Growth Rate Model) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-300 flex items-center justify-between">
              <span>增長率推估模型：</span>
              <span className="text-[11px] text-gray-400">
                {growthModel === 'auto' 
                  ? `歷史複合月均 (${(forecastData.calculatedMonthlyGrowthRate * 100).toFixed(1)}%/月)` 
                  : `自訂年增長率 (${customAnnualRate}%/年)`}
              </span>
            </label>
            <div className="flex items-center gap-2">
              <select
                value={growthModel}
                onChange={(e) => setGrowthModel(e.target.value as 'auto' | 'custom')}
                disabled={horizon === 0}
                className="bg-gray-700 border border-gray-600 text-white text-xs rounded-lg px-3 py-2 font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 flex-1"
              >
                <option value="auto">🤖 自動分析歷史趨勢 (CAGR 推估)</option>
                <option value="custom">⚙️ 自訂預估年增長率 (Annual Growth %)</option>
              </select>

              {growthModel === 'custom' && horizon > 0 && (
                <div className="flex items-center gap-1 min-w-[100px]">
                  <input
                    type="number"
                    min="-50"
                    max="200"
                    step="1"
                    value={customAnnualRate}
                    onChange={(e) => setCustomAnnualRate(parseFloat(e.target.value) || 0)}
                    className="w-16 bg-gray-700 border border-gray-600 text-white text-xs rounded-lg px-2 py-1.5 text-right font-mono"
                  />
                  <span className="text-xs text-gray-300">% / 年</span>
                </div>
              )}
            </div>
          </div>

          {/* 視圖呈現維度 (View Mode - 包含單一服務維度) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-300">圖表呈現維度：</label>
            <div className="grid grid-cols-3 gap-1 bg-gray-900/80 p-1 rounded-lg border border-gray-700">
              <button
                type="button"
                onClick={() => setViewMode('total')}
                className={`px-2 py-1.5 text-xs font-medium rounded transition text-center truncate ${
                  viewMode === 'total'
                    ? 'bg-blue-600 text-white shadow font-bold'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
                title="總體費用趨勢與預估"
              >
                📊 總體費用
              </button>
              <button
                type="button"
                onClick={() => setViewMode('services')}
                className={`px-2 py-1.5 text-xs font-medium rounded transition text-center truncate ${
                  viewMode === 'services'
                    ? 'bg-purple-600 text-white shadow font-bold'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
                title="Top 核心服務預估拆解"
              >
                🧩 Top 服務
              </button>
              <button
                type="button"
                onClick={() => setViewMode('single_service')}
                className={`px-2 py-1.5 text-xs font-medium rounded transition text-center truncate ${
                  viewMode === 'single_service'
                    ? 'bg-emerald-600 text-white shadow font-bold'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
                title="單一服務歷史與預估"
              >
                🎯 單一服務
              </button>
            </div>
          </div>
        </div>

        {/* 快速增長率預設按鈕 (Quick preset pills when in custom mode) */}
        {growthModel === 'custom' && horizon > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-gray-700/60 text-xs">
            <span className="text-gray-400">快速增長預設：</span>
            {[
              { label: '0% (平穩持平)', val: 0 },
              { label: '5% (穩健成長)', val: 5 },
              { label: '10% (標準預估)', val: 10 },
              { label: '15% (業務擴張)', val: 15 },
              { label: '20% (高速倍增)', val: 20 },
              { label: '30% (高爆發)', val: 30 },
            ].map(preset => (
              <button
                key={preset.val}
                type="button"
                onClick={() => setCustomAnnualRate(preset.val)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium border transition ${
                  customAnnualRate === preset.val
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500 font-bold'
                    : 'bg-gray-700/60 text-gray-300 border-gray-600 hover:bg-gray-700'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        )}

        {/* 單一服務選擇器 (當處於單一服務維度時顯示) */}
        {viewMode === 'single_service' && (
          <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fadeIn">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">🎯</span>
              <div>
                <div className="text-xs font-bold text-emerald-200 flex items-center gap-2">
                  <span>選擇分析的單一 AWS 服務：</span>
                  {singleServiceStats && (
                    <span className="text-[11px] font-normal text-emerald-400 bg-emerald-900/60 px-2 py-0.5 rounded border border-emerald-700/50">
                      佔總體歷史花費 {singleServiceStats.shareOfOverallHistorical.toFixed(1)}%
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-gray-400 mt-0.5">
                  支援選取任意 AWS 服務，獨立檢視該服務的歷史費用變化、MoM 增長率與未來 12/24/36 個月推估
                </div>
              </div>
            </div>

            <div className="w-full sm:w-80">
              <select
                value={selectedService}
                onChange={(e) => setSelectedService(e.target.value)}
                className="w-full bg-gray-900 border border-emerald-500 text-emerald-100 text-xs rounded-lg px-3 py-2 font-medium focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 shadow-inner"
              >
                {forecastData.allServicesList?.map(srv => (
                  <option key={srv.productName} value={srv.productName}>
                    {srv.productName} (${formatNumber(srv.historicalTotal, 0)})
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* 2. Executive KPI Summary Cards (動態適配總體或單一服務維度) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {viewMode === 'single_service' && singleServiceStats ? (
          <>
            <div className="bg-emerald-950/40 border border-emerald-600/40 rounded-xl p-4 shadow-sm">
              <div className="text-xs font-semibold text-emerald-300 uppercase tracking-wider truncate" title={selectedService}>
                【{selectedService}】歷史累計
              </div>
              <div className="text-2xl font-bold text-white mt-1">
                ${formatNumber(singleServiceStats.totalHistorical)}
              </div>
              <div className="text-xs text-emerald-400 mt-1 font-medium">
                月均: ${formatNumber(singleServiceStats.avgHistorical)} / 月 (佔總比 {singleServiceStats.shareOfOverallHistorical.toFixed(1)}%)
              </div>
            </div>

            <div className="bg-blue-950/40 border border-blue-600/40 rounded-xl p-4 shadow-sm">
              <div className="text-xs font-semibold text-blue-300 uppercase tracking-wider truncate" title={selectedService}>
                【{selectedService}】最新實際費用
              </div>
              <div className="text-2xl font-bold text-blue-400 mt-1">
                ${formatNumber(singleServiceStats.latestHistoricalCost)}
              </div>
              <div className="text-xs text-blue-400/80 mt-1 font-medium">
                最新月份 ({forecastData.latestHistoricalMonth})
              </div>
            </div>

            <div className="bg-purple-950/40 border border-purple-600/40 rounded-xl p-4 shadow-sm">
              <div className="text-xs font-semibold text-purple-300 uppercase tracking-wider">
                {horizon === 0 ? '該服務未來預估費用' : `未來 ${horizon} 個月預估累計`}
              </div>
              <div className="text-2xl font-bold text-purple-300 mt-1">
                {horizon === 0 ? '未啟用預估' : `$${formatNumber(singleServiceStats.totalForecast)}`}
              </div>
              <div className="text-xs text-purple-400 mt-1 font-medium">
                {horizon === 0 
                  ? '切換上方 12/24/36 月啟用' 
                  : `期末單月預估: $${formatNumber(singleServiceStats.finalMonthSpend)}`}
              </div>
            </div>

            <div className="bg-amber-950/40 border border-amber-600/40 rounded-xl p-4 shadow-sm">
              <div className="text-xs font-semibold text-amber-300 uppercase tracking-wider">
                {horizon === 0 ? '該服務年化規模 (Run-Rate)' : `預估年化規模 (Run-Rate)`}
              </div>
              <div className="text-2xl font-bold text-amber-400 mt-1">
                ${formatNumber(singleServiceStats.annualRunRate)}
              </div>
              <div className="text-xs text-amber-400/80 mt-1 font-medium">
                {horizon === 0 
                  ? `最新單月 × 12 個月` 
                  : `歷史+未來總計: $${formatNumber(singleServiceStats.totalWithHistory)}`}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="bg-blue-950/40 border border-blue-600/40 rounded-xl p-4 shadow-sm">
              <div className="text-xs font-semibold text-blue-300 uppercase tracking-wider">
                歷史累計花費 (共 {forecastData.historicalMonthsCount} 個月)
              </div>
              <div className="text-2xl font-bold text-white mt-1">
                ${formatNumber(forecastData.totalHistoricalSpend)}
              </div>
              <div className="text-xs text-blue-400 mt-1 font-medium">
                月均花費: ${formatNumber(forecastData.avgHistoricalMonthlySpend)} / 月
              </div>
            </div>

            <div className="bg-emerald-950/40 border border-emerald-600/40 rounded-xl p-4 shadow-sm">
              <div className="text-xs font-semibold text-emerald-300 uppercase tracking-wider">
                最新一期實際費用 ({forecastData.latestHistoricalMonth})
              </div>
              <div className="text-2xl font-bold text-emerald-400 mt-1">
                ${formatNumber(forecastData.latestHistoricalSpend)}
              </div>
              <div className="text-xs text-emerald-400/80 mt-1 font-medium">
                基線基準 (Baseline Run-rate)
              </div>
            </div>

            <div className="bg-purple-950/40 border border-purple-600/40 rounded-xl p-4 shadow-sm">
              <div className="text-xs font-semibold text-purple-300 uppercase tracking-wider">
                {horizon === 0 ? '預估未來費用' : `未來 ${horizon} 個月預估累計`}
              </div>
              <div className="text-2xl font-bold text-purple-300 mt-1">
                {horizon === 0 ? '未啟用預估' : `$${formatNumber(forecastData.projectedPeriodSpend)}`}
              </div>
              <div className="text-xs text-purple-400 mt-1 font-medium">
                {horizon === 0 
                  ? '可切換上方 12/24/36 月按鈕啟用' 
                  : `期末單月: $${formatNumber(forecastData.projectedFinalMonthSpend)}`}
              </div>
            </div>

            <div className="bg-amber-950/40 border border-amber-600/40 rounded-xl p-4 shadow-sm">
              <div className="text-xs font-semibold text-amber-300 uppercase tracking-wider">
                {horizon === 0 ? '當前年化費用 (Run-Rate)' : `預估年化規模 (Run-Rate)`}
              </div>
              <div className="text-2xl font-bold text-amber-400 mt-1">
                ${formatNumber(forecastData.projectedAnnualRunRate)}
              </div>
              <div className="text-xs text-amber-400/80 mt-1 font-medium">
                {horizon === 0 
                  ? `以最新單月 × 12 個月換算` 
                  : `歷史+未來 ${horizon} 個月總計: $${formatNumber(forecastData.projectedTotalSpendWithHistory)}`}
              </div>
            </div>
          </>
        )}
      </div>

      {/* 3. 趨勢與預估圖表看板 (Trend & Forecast Visualizations) */}
      <Card
        title={
          viewMode === 'single_service'
            ? `【${selectedService}】歷史量與預估費用趨勢 (${accountFilterSummaryText})`
            : `歷史量與預估費用趨勢圖 (${accountFilterSummaryText})`
        }
      >
        <div className="space-y-4">
          <div className="h-[420px] w-full min-h-[380px]">
            <ResponsiveContainer width="100%" height="100%">
              {viewMode === 'single_service' && singleServiceStats ? (
                <ComposedChart data={singleServiceStats.monthlyPoints} margin={{ top: 32, right: 35, left: 25, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis 
                    dataKey="month" 
                    stroke="#9ca3af" 
                    tick={{ fill: '#e5e7eb', fontSize: 11 }}
                    interval={horizon >= 24 ? 2 : 0}
                  />
                  <YAxis 
                    stroke="#9ca3af" 
                    domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.15)]}
                    tick={{ fill: '#e5e7eb', fontSize: 11 }}
                    tickFormatter={(v) => `$${v >= 1000 ? (v/1000).toFixed(0) + 'k' : v}`}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#111827', border: '1px solid #059669', borderRadius: '0.75rem', color: '#ffffff', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' }}
                    itemStyle={{ color: '#ffffff', fontWeight: 500 }}
                    labelStyle={{ color: '#34d399', fontWeight: 'bold', marginBottom: '4px' }}
                    labelFormatter={(label, items) => {
                      const p = items?.[0]?.payload;
                      const typeLabel = p?.isHistorical ? '歷史實際月份' : '未來預估推估月份';
                      const mom = p?.monthOverMonthGrowthRate ? ` • 月增長: ${p.monthOverMonthGrowthRate >= 0 ? '+' : ''}${p.monthOverMonthGrowthRate.toFixed(1)}%` : '';
                      return `計費月份: ${label} (${typeLabel}${mom})`;
                    }}
                    formatter={(value: any, name: string, item: any) => {
                      if (value === null || value === undefined || isNaN(Number(value))) return ['-', name];
                      const valStr = `$${formatNumber(Number(value))} USD`;
                      if (name.includes('累計')) return [valStr, `【${selectedService}】歷史+預估累計金額`];
                      if (name.includes('實際')) return [valStr, `【${selectedService}】當月實際費用`];
                      if (name.includes('預估')) return [valStr, `【${selectedService}】當月推估費用`];
                      return [valStr, name];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', color: '#f3f4f6' }} />

                  {/* 歷史分割垂直參考線 */}
                  {horizon > 0 && (
                    <ReferenceLine 
                      x={forecastData.latestHistoricalMonth} 
                      stroke="#10b981" 
                      strokeDasharray="4 4" 
                      strokeWidth={2}
                      label={{ value: '歷史實際 ◄ │ ► 未來預估', fill: '#34d399', fontSize: 11, position: 'insideTopLeft' }} 
                    />
                  )}

                  {/* 該服務歷史實際費用折線 */}
                  <Line 
                    name={`歷史實際費用 (${selectedService})`} 
                    type="monotone"
                    dataKey="actualCost" 
                    stroke="#10b981" 
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#10b981', stroke: '#065f46', strokeWidth: 1.5 }}
                    activeDot={{ r: 6 }}
                  >
                    <LabelList 
                      dataKey="actualCost" 
                      position="top" 
                      formatter={(val: any) => (val !== null && val !== undefined && val !== '' ? `$${formatNumber(Number(val), 0)}` : '')} 
                      fill="#6ee7b7" 
                      fontSize={11} 
                      fontWeight={700}
                      offset={10} 
                    />
                  </Line>
                  
                  {/* 該服務預估費用折線 */}
                  {horizon > 0 && (
                    <Line 
                      name={`未來預估費用 (${selectedService})`} 
                      type="monotone"
                      dataKey="forecastCost" 
                      stroke="#f59e0b" 
                      strokeWidth={3} 
                      strokeDasharray="4 4" 
                      dot={{ r: 4, fill: '#f59e0b', stroke: '#92400e', strokeWidth: 1.5 }}
                      activeDot={{ r: 6 }}
                    >
                      <LabelList 
                        dataKey="forecastCost" 
                        position="top" 
                        formatter={(val: any) => (val !== null && val !== undefined && val !== '' ? `$${formatNumber(Number(val), 0)}` : '')} 
                        fill="#fcd34d" 
                        fontSize={11} 
                        fontWeight={700}
                        offset={10} 
                      />
                    </Line>
                  )}

                  {/* 該服務累計花費曲線 */}
                  <Line 
                    name={`服務累計費用`} 
                    type="monotone" 
                    dataKey="cumulativeCost" 
                    stroke="#a855f7" 
                    strokeWidth={2.5} 
                    dot={{ r: 3.5, fill: '#a855f7', stroke: '#6b21a8', strokeWidth: 1 }} 
                    activeDot={{ r: 5 }}
                  >
                    <LabelList 
                      dataKey="cumulativeCost" 
                      position="bottom" 
                      formatter={(val: any) => (val !== null && val !== undefined && val !== '' ? `$${formatNumber(Number(val), 0)}` : '')} 
                      fill="#d8b4fe" 
                      fontSize={10} 
                      fontWeight={600}
                      offset={10} 
                    />
                  </Line>
                </ComposedChart>
              ) : viewMode === 'total' ? (
                <ComposedChart data={chartData} margin={{ top: 32, right: 35, left: 25, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis 
                    dataKey="month" 
                    stroke="#9ca3af" 
                    tick={{ fill: '#e5e7eb', fontSize: 11 }}
                    interval={horizon >= 24 ? 2 : 0}
                  />
                  <YAxis 
                    stroke="#9ca3af" 
                    domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.15)]}
                    tick={{ fill: '#e5e7eb', fontSize: 11 }}
                    tickFormatter={(v) => `$${v >= 1000 ? (v/1000).toFixed(0) + 'k' : v}`}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#111827', border: '1px solid #4b5563', borderRadius: '0.75rem', color: '#ffffff', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' }}
                    itemStyle={{ color: '#ffffff', fontWeight: 500 }}
                    labelStyle={{ color: '#ffffff', fontWeight: 'bold', marginBottom: '4px' }}
                    labelFormatter={(label, items) => {
                      const p = items?.[0]?.payload;
                      const typeLabel = p?.isHistorical ? '歷史實際月份' : '未來預估推估月份';
                      const mom = p?.月增長率 !== undefined ? ` • 月增長率: ${p.月增長率 >= 0 ? '+' : ''}${p.月增長率.toFixed(1)}%` : '';
                      return `計費月份: ${label} (${typeLabel}${mom})`;
                    }}
                    formatter={(value: any, name: string) => {
                      if (value === null || value === undefined || isNaN(Number(value))) return ['-', name];
                      const valStr = `$${formatNumber(Number(value))} USD`;
                      if (name === '累計費用') return [valStr, '全期累計總支出 (實際 + 預估)'];
                      if (name === '歷史實際費用') return [valStr, '當月歷史實際支出'];
                      if (name === '預估費用') return [valStr, '當月模型預估推估支出'];
                      return [valStr, name];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', color: '#f3f4f6' }} />

                  {/* 歷史分割垂直參考線 */}
                  {horizon > 0 && (
                    <ReferenceLine 
                      x={forecastData.latestHistoricalMonth} 
                      stroke="#10b981" 
                      strokeDasharray="4 4" 
                      strokeWidth={2}
                      label={{ value: '歷史實際 ◄ │ ► 未來預估', fill: '#34d399', fontSize: 11, position: 'insideTopLeft' }} 
                    />
                  )}

                  {/* 歷史實際折線 */}
                  <Line 
                    name="歷史實際費用" 
                    type="monotone"
                    dataKey="歷史實際費用" 
                    stroke="#3b82f6" 
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#3b82f6', stroke: '#1e40af', strokeWidth: 1.5 }}
                    activeDot={{ r: 6 }}
                  >
                    <LabelList 
                      dataKey="歷史實際費用" 
                      position="top" 
                      formatter={(val: any) => (val !== null && val !== undefined && val !== '' ? `$${formatNumber(Number(val), 0)}` : '')} 
                      fill="#93c5fd" 
                      fontSize={11} 
                      fontWeight={700}
                      offset={10} 
                    />
                  </Line>
                  
                  {/* 預估費用折線 */}
                  {horizon > 0 && (
                    <Line 
                      name="預估費用" 
                      type="monotone"
                      dataKey="預估費用" 
                      stroke="#f59e0b" 
                      strokeWidth={3} 
                      strokeDasharray="4 4" 
                      dot={{ r: 4, fill: '#f59e0b', stroke: '#92400e', strokeWidth: 1.5 }}
                      activeDot={{ r: 6 }}
                    >
                      <LabelList 
                        dataKey="預估費用" 
                        position="top" 
                        formatter={(val: any) => (val !== null && val !== undefined && val !== '' ? `$${formatNumber(Number(val), 0)}` : '')} 
                        fill="#fcd34d" 
                        fontSize={11} 
                        fontWeight={700}
                        offset={10} 
                      />
                    </Line>
                  )}

                  {/* 累計花費曲線 */}
                  <Line 
                    name="累計費用" 
                    type="monotone" 
                    dataKey="累計費用" 
                    stroke="#a855f7" 
                    strokeWidth={2.5} 
                    dot={{ r: 3.5, fill: '#a855f7', stroke: '#6b21a8', strokeWidth: 1 }} 
                    activeDot={{ r: 5 }}
                  >
                    <LabelList 
                      dataKey="累計費用" 
                      position="bottom" 
                      formatter={(val: any) => (val !== null && val !== undefined && val !== '' ? `$${formatNumber(Number(val), 0)}` : '')} 
                      fill="#d8b4fe" 
                      fontSize={10} 
                      fontWeight={600}
                      offset={10} 
                    />
                  </Line>
                </ComposedChart>
              ) : (
                <ComposedChart data={chartData} margin={{ top: 32, right: 35, left: 25, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis 
                    dataKey="month" 
                    stroke="#9ca3af" 
                    tick={{ fill: '#e5e7eb', fontSize: 11 }}
                    interval={horizon >= 24 ? 2 : 0}
                  />
                  <YAxis 
                    stroke="#9ca3af" 
                    domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.15)]}
                    tick={{ fill: '#e5e7eb', fontSize: 11 }}
                    tickFormatter={(v) => `$${v >= 1000 ? (v/1000).toFixed(0) + 'k' : v}`}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#111827', border: '1px solid #4b5563', borderRadius: '0.75rem', color: '#ffffff', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' }}
                    itemStyle={{ color: '#ffffff', fontWeight: 500 }}
                    labelStyle={{ color: '#ffffff', fontWeight: 'bold', marginBottom: '4px' }}
                    labelFormatter={(label, items) => {
                      const p = items?.[0]?.payload;
                      const typeLabel = p?.isHistorical ? '歷史實際' : '預估推估';
                      return `計費月份: ${label} (${typeLabel})`;
                    }}
                    formatter={(value: any, name: string) => {
                      if (value === null || value === undefined || isNaN(Number(value))) return ['-', name];
                      return [`$${formatNumber(Number(value))} USD`, `${name} 費用`];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', color: '#f3f4f6' }} />

                  {horizon > 0 && (
                    <ReferenceLine 
                      x={forecastData.latestHistoricalMonth} 
                      stroke="#10b981" 
                      strokeDasharray="4 4" 
                      strokeWidth={2}
                    />
                  )}

                  {forecastData.topServicesForecast.map(srv => (
                    <Line 
                      key={srv.productName}
                      name={srv.productName}
                      type="monotone" 
                      dataKey={srv.productName} 
                      stroke={srv.color} 
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  ))}
                </ComposedChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      </Card>

      {/* 4. 歷史量與預估費用明細表格 (Detailed Monthly Projection Table) */}
      <Card
        title={
          viewMode === 'single_service'
            ? `【${selectedService}】數據明細表 (${horizon === 0 ? '僅歷史實際' : `歷史 + 未來 ${horizon} 個月預估`})`
            : `歷史量與預估費用數據表 (${horizon === 0 ? '僅歷史實際' : `歷史 + 未來 ${horizon} 個月預估`})`
        }
      >
        <div className="overflow-x-auto">
          {viewMode === 'single_service' && singleServiceStats ? (
            <table className="w-full text-sm text-left text-gray-300">
              <thead className="text-xs text-gray-400 uppercase bg-gray-700/80 border-b border-gray-600">
                <tr>
                  <th scope="col" className="px-5 py-3">月份</th>
                  <th scope="col" className="px-5 py-3 text-center">數據性質</th>
                  <th scope="col" className="px-5 py-3 text-right">【{selectedService}】費用 ($USD)</th>
                  <th scope="col" className="px-5 py-3 text-right">月增長率 (MoM %)</th>
                  <th scope="col" className="px-5 py-3 text-right">服務累計花費 ($USD)</th>
                  <th scope="col" className="px-5 py-3 text-right">佔當月全部支出比 (%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {singleServiceStats.monthlyPoints.map((dp, idx) => (
                  <tr 
                    key={idx}
                    className={`transition-colors ${
                      dp.isHistorical 
                        ? 'bg-gray-800 hover:bg-gray-750' 
                        : 'bg-emerald-950/20 hover:bg-emerald-950/40 text-emerald-200'
                    }`}
                  >
                    <td className="px-5 py-3 font-mono font-medium flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${dp.isHistorical ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                      <span>{dp.month}</span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                        dp.isHistorical 
                          ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700/50' 
                          : 'bg-amber-900/40 text-amber-300 border-amber-700/50'
                      }`}>
                        {dp.isHistorical ? '歷史實際 (Actual)' : '未來預估 (Forecast)'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-mono font-bold text-white text-base">
                      ${formatNumber(dp.cost)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-xs">
                      <span className={dp.monthOverMonthGrowthRate > 0 ? 'text-rose-400' : dp.monthOverMonthGrowthRate < 0 ? 'text-emerald-400' : 'text-gray-400'}>
                        {dp.monthOverMonthGrowthRate > 0 ? '+' : ''}{dp.monthOverMonthGrowthRate.toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-purple-300 font-medium">
                      ${formatNumber(dp.cumulativeCost)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-emerald-400 text-xs font-semibold">
                      {dp.shareOfTotal.toFixed(2)}%
                    </td>
                  </tr>
                ))}

                {/* 服務總計行 */}
                <tr className="bg-gray-750 font-bold border-t-2 border-emerald-600">
                  <td className="px-5 py-4 text-white text-base">【{selectedService}】總計</td>
                  <td className="px-5 py-4 text-center text-xs text-gray-300">
                    {forecastData.historicalMonthsCount} 個歷史月 + {forecastData.forecastMonthsCount} 個預估月
                  </td>
                  <td className="px-5 py-4 text-right font-mono text-emerald-400 text-lg">
                    ${formatNumber(singleServiceStats.totalWithHistory)}
                  </td>
                  <td className="px-5 py-4 text-right font-mono text-xs text-gray-400">
                    平均月均: ${formatNumber(singleServiceStats.totalWithHistory / (forecastData.historicalMonthsCount + forecastData.forecastMonthsCount || 1))}
                  </td>
                  <td className="px-5 py-4 text-right font-mono text-emerald-400">
                    ${formatNumber(singleServiceStats.totalWithHistory)}
                  </td>
                  <td className="px-5 py-4 text-right font-mono text-emerald-300 text-xs">
                    佔歷史總比 {singleServiceStats.shareOfOverallHistorical.toFixed(1)}%
                  </td>
                </tr>
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm text-left text-gray-300">
              <thead className="text-xs text-gray-400 uppercase bg-gray-700/80 border-b border-gray-600">
                <tr>
                  <th scope="col" className="px-5 py-3">月份</th>
                  <th scope="col" className="px-5 py-3 text-center">數據性質</th>
                  <th scope="col" className="px-5 py-3 text-right">費用金額 ($USD)</th>
                  <th scope="col" className="px-5 py-3 text-right">月增長率 (MoM %)</th>
                  <th scope="col" className="px-5 py-3 text-right">累計花費 ($USD)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {forecastData.dataPoints.map((dp, idx) => (
                  <tr 
                    key={idx}
                    className={`transition-colors ${
                      dp.isHistorical 
                        ? 'bg-gray-800 hover:bg-gray-750' 
                        : 'bg-amber-950/20 hover:bg-amber-950/40 text-amber-200'
                    }`}
                  >
                    <td className="px-5 py-3 font-mono font-medium flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${dp.isHistorical ? 'bg-blue-400' : 'bg-amber-400'}`} />
                      <span>{dp.month}</span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                        dp.isHistorical 
                          ? 'bg-blue-900/40 text-blue-300 border-blue-700/50' 
                          : 'bg-amber-900/40 text-amber-300 border-amber-700/50'
                      }`}>
                        {dp.isHistorical ? '歷史實際 (Actual)' : '未來預估 (Forecast)'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-mono font-bold text-white text-base">
                      ${formatNumber(dp.displayCost)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-xs">
                      <span className={dp.monthOverMonthGrowthRate > 0 ? 'text-rose-400' : dp.monthOverMonthGrowthRate < 0 ? 'text-emerald-400' : 'text-gray-400'}>
                        {dp.monthOverMonthGrowthRate > 0 ? '+' : ''}{dp.monthOverMonthGrowthRate.toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-purple-300 font-medium">
                      ${formatNumber(dp.cumulativeCost)}
                    </td>
                  </tr>
                ))}

                {/* 總計行 */}
                <tr className="bg-gray-750 font-bold border-t-2 border-gray-600">
                  <td className="px-5 py-4 text-white text-base">總計 (Grand Total)</td>
                  <td className="px-5 py-4 text-center text-xs text-gray-300">
                    {forecastData.historicalMonthsCount} 個歷史月 + {forecastData.forecastMonthsCount} 個預估月
                  </td>
                  <td className="px-5 py-4 text-right font-mono text-yellow-400 text-lg">
                    ${formatNumber(forecastData.projectedTotalSpendWithHistory)}
                  </td>
                  <td className="px-5 py-4 text-right font-mono text-xs text-gray-400">
                    平均月均: ${formatNumber(forecastData.projectedTotalSpendWithHistory / (forecastData.historicalMonthsCount + forecastData.forecastMonthsCount || 1))}
                  </td>
                  <td className="px-5 py-4 text-right font-mono text-yellow-400">
                    ${formatNumber(forecastData.projectedTotalSpendWithHistory)}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
};

export default ForecastAnalysisSection;

