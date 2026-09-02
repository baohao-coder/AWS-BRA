import React, { useState, useMemo } from 'react';
import { BillingData } from '../../types';
import { parseRegionAndAz, AWS_REGION_MAP, RegionInfo } from '../../services/regionAzParser';
import { exportToExcel } from '../../services/excelUtils';
import Card from '../common/Card';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';

interface RegionAzAnalysisSectionProps {
  data: BillingData;
  months: string[];
  selectedMonth: string;
  setSelectedMonth: (m: string) => void;
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

export interface RegionDetailItem {
  regionCode: string;
  regionInfo: RegionInfo;
  cost: number;
  percentage: number;
  serviceCount: number;
  azCount: number;
  services: {
    productName: string;
    cost: number;
    usage: number;
    percentage: number;
  }[];
  azs: {
    azCode: string;
    azDisplay: string;
    cost: number;
    percentage: number;
    serviceCount: number;
  }[];
}

export interface AzDetailItem {
  azCode: string;
  azDisplay: string;
  regionCode: string;
  regionInfo: RegionInfo;
  cost: number;
  percentage: number;
  serviceCount: number;
  services: {
    productName: string;
    cost: number;
    usage: number;
  }[];
}

const CHART_COLORS = [
  '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899',
  '#06b6d4', '#f43f5e', '#14b8a6', '#6366f1', '#84cc16',
  '#a855f7', '#38b2ac', '#eab308', '#64748b'
];

export const RegionAzAnalysisSection: React.FC<RegionAzAnalysisSectionProps> = ({
  data,
  months,
  selectedMonth,
  setSelectedMonth,
  analysisMode,
  setAnalysisMode,
  accountFilterSummaryText
}) => {
  const [selectedRegionFilter, setSelectedRegionFilter] = useState<string>('ALL');
  const [expandedRegionCode, setExpandedRegionCode] = useState<string | null>(null);
  const [expandedAzCode, setExpandedAzCode] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Process data for Region & AZ analysis
  const { regionList, azList, totalCost } = useMemo(() => {
    const dataToProcess = analysisMode === 'monthly'
      ? data.filter(d => d.month === selectedMonth)
      : data;

    let overallCost = 0;
    const regionMap = new Map<string, {
      regionInfo: RegionInfo;
      cost: number;
      servicesMap: Map<string, { cost: number; usage: number }>;
      azMap: Map<string, { azDisplay: string; cost: number; servicesSet: Set<string> }>;
    }>();

    const azMap = new Map<string, {
      azDisplay: string;
      regionCode: string;
      regionInfo: RegionInfo;
      cost: number;
      servicesMap: Map<string, { cost: number; usage: number }>;
    }>();

    dataToProcess.forEach(m => {
      m.accounts.forEach(acc => {
        acc.services?.forEach(srv => {
          if (srv.details && srv.details.length > 0) {
            srv.details.forEach(det => {
              const cost = det.totalCost || 0;
              const usage = det.usages || 0;
              overallCost += cost;

              const { regionCode, regionInfo, azCode, azDisplay } = parseRegionAndAz(
                det.productName || srv.productName,
                det.usageType,
                det.itemDescription
              );

              // 1. Accumulate Region Map
              if (!regionMap.has(regionCode)) {
                regionMap.set(regionCode, {
                  regionInfo,
                  cost: 0,
                  servicesMap: new Map(),
                  azMap: new Map()
                });
              }
              const reg = regionMap.get(regionCode)!;
              reg.cost += cost;

              const prodName = det.productName || srv.productName || 'Other';
              if (!reg.servicesMap.has(prodName)) {
                reg.servicesMap.set(prodName, { cost: 0, usage: 0 });
              }
              const srvObj = reg.servicesMap.get(prodName)!;
              srvObj.cost += cost;
              srvObj.usage += usage;

              if (!reg.azMap.has(azCode)) {
                reg.azMap.set(azCode, { azDisplay, cost: 0, servicesSet: new Set() });
              }
              const azObj = reg.azMap.get(azCode)!;
              azObj.cost += cost;
              azObj.servicesSet.add(prodName);

              // 2. Accumulate Global AZ Map
              if (!azMap.has(azCode)) {
                azMap.set(azCode, {
                  azDisplay,
                  regionCode,
                  regionInfo,
                  cost: 0,
                  servicesMap: new Map()
                });
              }
              const gAz = azMap.get(azCode)!;
              gAz.cost += cost;
              if (!gAz.servicesMap.has(prodName)) {
                gAz.servicesMap.set(prodName, { cost: 0, usage: 0 });
              }
              const gSrv = gAz.servicesMap.get(prodName)!;
              gSrv.cost += cost;
              gSrv.usage += usage;
            });
          } else {
            // Service without details
            const cost = srv.totalCost || 0;
            overallCost += cost;
            const { regionCode, regionInfo, azCode, azDisplay } = parseRegionAndAz(srv.productName, '', '');

            if (!regionMap.has(regionCode)) {
              regionMap.set(regionCode, {
                regionInfo,
                cost: 0,
                servicesMap: new Map(),
                azMap: new Map()
              });
            }
            const reg = regionMap.get(regionCode)!;
            reg.cost += cost;

            const prodName = srv.productName || 'Other';
            if (!reg.servicesMap.has(prodName)) {
              reg.servicesMap.set(prodName, { cost: 0, usage: 0 });
            }
            reg.servicesMap.get(prodName)!.cost += cost;

            if (!reg.azMap.has(azCode)) {
              reg.azMap.set(azCode, { azDisplay, cost: 0, servicesSet: new Set() });
            }
            const azObj = reg.azMap.get(azCode)!;
            azObj.cost += cost;
            azObj.servicesSet.add(prodName);

            if (!azMap.has(azCode)) {
              azMap.set(azCode, {
                azDisplay,
                regionCode,
                regionInfo,
                cost: 0,
                servicesMap: new Map()
              });
            }
            const gAz = azMap.get(azCode)!;
            gAz.cost += cost;
            if (!gAz.servicesMap.has(prodName)) {
              gAz.servicesMap.set(prodName, { cost: 0, usage: 0 });
            }
            gAz.servicesMap.get(prodName)!.cost += cost;
          }
        });
      });
    });

    const regions: RegionDetailItem[] = Array.from(regionMap.entries())
      .map(([code, reg]) => {
        const services = Array.from(reg.servicesMap.entries()).map(([pName, val]) => ({
          productName: pName,
          cost: val.cost,
          usage: val.usage,
          percentage: reg.cost > 0 ? (val.cost / reg.cost) * 100 : 0
        })).sort((a, b) => b.cost - a.cost);

        const azs = Array.from(reg.azMap.entries()).map(([azCode, val]) => ({
          azCode,
          azDisplay: val.azDisplay,
          cost: val.cost,
          percentage: reg.cost > 0 ? (val.cost / reg.cost) * 100 : 0,
          serviceCount: val.servicesSet.size
        })).sort((a, b) => b.cost - a.cost);

        return {
          regionCode: code,
          regionInfo: reg.regionInfo,
          cost: reg.cost,
          percentage: overallCost > 0 ? (reg.cost / overallCost) * 100 : 0,
          serviceCount: services.length,
          azCount: azs.length,
          services,
          azs
        };
      })
      .sort((a, b) => b.cost - a.cost);

    const azs: AzDetailItem[] = Array.from(azMap.entries())
      .map(([azCode, val]) => {
        const services = Array.from(val.servicesMap.entries()).map(([pName, sVal]) => ({
          productName: pName,
          cost: sVal.cost,
          usage: sVal.usage
        })).sort((a, b) => b.cost - a.cost);

        return {
          azCode,
          azDisplay: val.azDisplay,
          regionCode: val.regionCode,
          regionInfo: val.regionInfo,
          cost: val.cost,
          percentage: overallCost > 0 ? (val.cost / overallCost) * 100 : 0,
          serviceCount: services.length,
          services
        };
      })
      .sort((a, b) => b.cost - a.cost);

    return {
      regionList: regions,
      azList: azs,
      totalCost: overallCost
    };
  }, [data, analysisMode, selectedMonth]);

  // Filtered regions & AZs
  const displayedRegions = useMemo(() => {
    if (selectedRegionFilter === 'ALL') {
      if (!searchQuery.trim()) return regionList;
      const q = searchQuery.toLowerCase().trim();
      return regionList.filter(r => 
        r.regionCode.toLowerCase().includes(q) || 
        r.regionInfo.nameZh.toLowerCase().includes(q) ||
        r.regionInfo.nameEn.toLowerCase().includes(q)
      );
    }
    return regionList.filter(r => r.regionCode === selectedRegionFilter);
  }, [regionList, selectedRegionFilter, searchQuery]);

  const displayedAzs = useMemo(() => {
    let list = azList;
    if (selectedRegionFilter !== 'ALL') {
      list = list.filter(a => a.regionCode === selectedRegionFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(a => 
        a.azCode.toLowerCase().includes(q) || 
        a.azDisplay.toLowerCase().includes(q) ||
        a.regionInfo.nameZh.toLowerCase().includes(q)
      );
    }
    return list;
  }, [azList, selectedRegionFilter, searchQuery]);

  // Export to Excel
  const handleExportExcel = () => {
    const periodStr = analysisMode === 'monthly' ? selectedMonth : '全期間累計';
    const filename = `aws_region_az_analysis_${periodStr}_${accountFilterSummaryText.replace(/\s+/g, '_')}`;

    const rows: Record<string, string>[] = [];

    regionList.forEach(reg => {
      reg.azs.forEach(az => {
        const matchingAz = azList.find(a => a.azCode === az.azCode);
        if (matchingAz) {
          matchingAz.services.forEach(srv => {
            rows.push({
              '計費期間': periodStr,
              '分析帳號範圍': accountFilterSummaryText,
              'Region 代碼': reg.regionCode,
              'Region 名稱': reg.regionInfo.nameZh,
              'AWS 官方代碼': reg.regionInfo.code,
              '地理區域': reg.regionInfo.location,
              '可用區 (AZ 代碼)': az.azCode,
              '可用區說明': az.azDisplay,
              'AWS 服務 (Product)': srv.productName,
              '用量': srv.usage.toFixed(4),
              '金額 ($USD)': srv.cost.toFixed(2),
              '佔該 AZ 比例 (%)': `${((srv.cost / (az.cost || 1)) * 100).toFixed(2)}%`,
              '佔該 Region 比例 (%)': `${((srv.cost / (reg.cost || 1)) * 100).toFixed(2)}%`,
              '佔全雲端總花費比例 (%)': `${((srv.cost / (totalCost || 1)) * 100).toFixed(2)}%`
            });
          });
        }
      });
    });

    exportToExcel(rows, filename);
  };

  const topRegion = regionList[0];

  return (
    <div className="space-y-6">
      {/* 1. 時間與維度篩選工具列 */}
      <div className="bg-gray-800 p-5 rounded-xl border border-gray-700 shadow-md space-y-4">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 pb-4 border-b border-gray-700">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>🌍</span>
              <span>AWS Region & AZ 區域用量與費用分析</span>
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              分析 Tokyo (APN1)、Taipei (APE2)、US East (USE1) 等各 AWS 區域與可用區之用量與花費分佈
            </p>
          </div>

          {/* 時間切換與匯出 */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-lg shadow-sm" role="group">
              <button
                type="button"
                onClick={() => setAnalysisMode('monthly')}
                className={`px-3.5 py-1.5 text-xs font-medium border border-gray-600 rounded-l-lg transition-all ${
                  analysisMode === 'monthly' 
                    ? 'bg-blue-600 text-white border-blue-600 shadow' 
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
                }`}
              >
                單月分析
              </button>
              <button
                type="button"
                onClick={() => setAnalysisMode('cumulative')}
                className={`px-3.5 py-1.5 text-xs font-medium border border-gray-600 rounded-r-lg transition-all ${
                  analysisMode === 'cumulative' 
                    ? 'bg-blue-600 text-white border-blue-600 shadow' 
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
                }`}
              >
                全期間累計
              </button>
            </div>

            {analysisMode === 'monthly' && (
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-gray-700 border border-gray-600 text-white text-xs rounded-lg px-2.5 py-1.5 font-medium focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                {months.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            )}

            <button
              onClick={handleExportExcel}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <span>📊</span>
              <span>匯出 Region/AZ Excel</span>
            </button>
          </div>
        </div>

        {/* Region 快捷膠囊篩選列 */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs font-bold text-gray-300">快速篩選 Region：</span>
          <button
            type="button"
            onClick={() => setSelectedRegionFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              selectedRegionFilter === 'ALL'
                ? 'bg-blue-600 text-white shadow ring-2 ring-blue-400'
                : 'bg-gray-700/80 text-gray-300 hover:bg-gray-700 border border-gray-600'
            }`}
          >
            全部區域 ({regionList.length})
          </button>

          {regionList.map(reg => {
            const isSelected = selectedRegionFilter === reg.regionCode;
            return (
              <button
                key={reg.regionCode}
                type="button"
                onClick={() => setSelectedRegionFilter(prev => prev === reg.regionCode ? 'ALL' : reg.regionCode)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border ${
                  isSelected
                    ? 'text-white shadow ring-2 ring-offset-1 ring-offset-gray-900'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border-gray-700'
                }`}
                style={{
                  backgroundColor: isSelected ? reg.regionInfo.color : undefined,
                  borderColor: isSelected ? reg.regionInfo.color : undefined
                }}
              >
                <span>{reg.regionInfo.shortCode}</span>
                <span className="text-[11px] font-normal opacity-90">{reg.regionInfo.nameZh.split(' ')[0]}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-black/30 text-white' : 'bg-gray-700 text-gray-300'}`}>
                  ${formatNumber(reg.cost)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Executive KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-blue-950/40 border border-blue-600/40 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-semibold text-blue-300 uppercase tracking-wider">
            涵蓋 AWS 區域 (Regions)
          </div>
          <div className="text-2xl font-bold text-white mt-1">
            {regionList.length} 個區域
          </div>
          <div className="text-xs text-blue-400 mt-1 font-medium">
            全雲端總花費: ${formatNumber(totalCost)}
          </div>
        </div>

        <div className="bg-emerald-950/40 border border-emerald-600/40 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-semibold text-emerald-300 uppercase tracking-wider">
            涵蓋可用區與節點 (AZs / Edges)
          </div>
          <div className="text-2xl font-bold text-emerald-400 mt-1">
            {azList.length} 個可用區/節點
          </div>
          <div className="text-xs text-emerald-400/80 mt-1 font-medium">
            包含多區高可用與單區配置
          </div>
        </div>

        <div className="bg-purple-950/40 border border-purple-600/40 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-semibold text-purple-300 uppercase tracking-wider">
            主要主力區域 (Top 1 Region)
          </div>
          <div className="text-2xl font-bold text-purple-300 mt-1 truncate" title={topRegion?.regionInfo.nameZh}>
            {topRegion ? `${topRegion.regionCode} (${topRegion.regionInfo.nameZh.split(' ')[0]})` : '無'}
          </div>
          <div className="text-xs text-purple-400 mt-1 font-medium">
            花費 ${formatNumber(topRegion?.cost || 0)} (佔 {topRegion?.percentage.toFixed(1)}%)
          </div>
        </div>

        <div className="bg-amber-950/40 border border-amber-600/40 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-semibold text-amber-300 uppercase tracking-wider">
            分析範疇與計費期
          </div>
          <div className="text-xl font-bold text-amber-400 mt-1">
            {analysisMode === 'monthly' ? selectedMonth : '全期間累計'}
          </div>
          <div className="text-xs text-amber-400/80 mt-1 font-medium truncate" title={accountFilterSummaryText}>
            {accountFilterSummaryText}
          </div>
        </div>
      </div>

      {/* 3. 圖表視覺化看板 (Region & AZ Charts) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Region 佔比圓餅圖 */}
        <div className="lg:col-span-5 bg-gray-800 p-5 rounded-xl border border-gray-700 shadow-md flex flex-col items-center">
          <h4 className="text-sm font-bold text-gray-200 mb-2 text-center">各 Region 區域花費佔比分佈</h4>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={regionList.map((r, idx) => ({
                    name: `${r.regionCode} (${r.regionInfo.nameZh.split(' ')[0]})`,
                    value: r.cost,
                    color: r.regionInfo.color || CHART_COLORS[idx % CHART_COLORS.length]
                  }))}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={85}
                  paddingAngle={3}
                >
                  {regionList.map((entry, index) => (
                    <Cell key={`reg-pie-${index}`} fill={entry.regionInfo.color || CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#111827', border: '1px solid #4b5563', borderRadius: '0.75rem', color: '#ffffff', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' }}
                  itemStyle={{ color: '#ffffff', fontWeight: 500 }}
                  labelStyle={{ color: '#ffffff', fontWeight: 'bold', marginBottom: '4px' }}
                  formatter={(value: number) => {
                    const perc = totalCost > 0 ? (value / totalCost) * 100 : 0;
                    return [`$${formatNumber(value)} (${perc.toFixed(1)}%)`, '費用金額'];
                  }}
                />
                <Legend 
                  wrapperStyle={{ fontSize: '11px' }}
                  formatter={(value) => <span className="text-gray-300 font-medium">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top 8 AZ 可用區花費長條圖 */}
        <div className="lg:col-span-7 bg-gray-800 p-5 rounded-xl border border-gray-700 shadow-md">
          <h4 className="text-sm font-bold text-gray-200 mb-2 text-center">Top 可用區 (AZ) 花費對比 ($USD)</h4>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={azList.slice(0, 8).map(a => ({
                  name: a.azCode,
                  fullName: a.azDisplay,
                  cost: a.cost,
                  color: a.regionInfo.color
                }))}
                layout="vertical"
                margin={{ top: 10, right: 35, left: 80, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
                <XAxis type="number" stroke="#9ca3af" tick={{ fill: '#f3f4f6', fontSize: 11 }} tickFormatter={(v) => `$${v >= 1000 ? (v/1000).toFixed(0) + 'k' : v}`} />
                <YAxis dataKey="name" type="category" stroke="#e5e7eb" tick={{ fill: '#f9fafb', fontSize: 11, fontWeight: 'bold' }} width={80} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#111827', border: '1px solid #4b5563', borderRadius: '0.75rem', color: '#ffffff', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' }}
                  itemStyle={{ color: '#ffffff', fontWeight: 500 }}
                  labelStyle={{ color: '#ffffff', fontWeight: 'bold', marginBottom: '4px' }}
                  labelFormatter={(_, payload) => payload[0]?.payload?.fullName || ''}
                  formatter={(value: number) => [`$${formatNumber(value)} (${((value / (totalCost || 1)) * 100).toFixed(2)}%)`, '總花費']}
                />
                <Bar dataKey="cost" radius={[0, 4, 4, 0]}>
                  {azList.slice(0, 8).map((entry, index) => (
                    <Cell key={`az-bar-${index}`} fill={entry.regionInfo.color || CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 4. Region 區域與 AZ 可用區明細清單表格 (Hierarchical Table) */}
      <Card
        title={`AWS Region & AZ 服務與花費明細表 (${analysisMode === 'monthly' ? selectedMonth : '全期間累計'}) - ${accountFilterSummaryText}`}
      >
        <div className="space-y-4">
          {/* 搜尋過濾 */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-2 border-b border-gray-700">
            <div className="text-xs text-gray-400">
              點擊任一 Region 可展開其所屬 AZ 及 AWS 服務產品明細
            </div>
            <div className="w-full sm:w-64">
              <input
                type="text"
                placeholder="搜尋 Region、AZ 代碼..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-300">
              <thead className="text-xs text-gray-400 uppercase bg-gray-700/80 border-b border-gray-600">
                <tr>
                  <th scope="col" className="px-5 py-3 w-12 text-center">#</th>
                  <th scope="col" className="px-5 py-3">AWS Region (區域)</th>
                  <th scope="col" className="px-5 py-3">官方代碼 / 地理位置</th>
                  <th scope="col" className="px-5 py-3 text-center">涵蓋 AZ 數</th>
                  <th scope="col" className="px-5 py-3 text-center">涵蓋服務數</th>
                  <th scope="col" className="px-5 py-3 text-right">花費金額 ($USD)</th>
                  <th scope="col" className="px-5 py-3 text-right">佔比 (%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {displayedRegions.map((reg, idx) => {
                  const isExpanded = expandedRegionCode === reg.regionCode;

                  return (
                    <React.Fragment key={reg.regionCode}>
                      <tr 
                        onClick={() => setExpandedRegionCode(prev => prev === reg.regionCode ? null : reg.regionCode)}
                        className={`cursor-pointer transition-colors ${
                          isExpanded 
                            ? 'bg-gray-750 font-semibold' 
                            : idx % 2 === 0 ? 'bg-gray-800 hover:bg-gray-750' : 'bg-gray-800/60 hover:bg-gray-750'
                        }`}
                      >
                        <td className="px-5 py-3 text-center text-gray-500 font-mono text-xs">
                          <span className={`inline-block transition-transform duration-200 ${isExpanded ? 'rotate-90 text-blue-400' : ''}`}>▶</span>
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap">
                          <div className="flex items-center space-x-2.5">
                            <span 
                              className="w-3 h-3 rounded-full flex-shrink-0" 
                              style={{ backgroundColor: reg.regionInfo.color }}
                            />
                            <div>
                              <span className="font-bold text-white mr-1.5">{reg.regionCode}</span>
                              <span className="text-xs text-gray-300 font-medium">({reg.regionInfo.nameZh})</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-xs text-gray-400">
                          <span className="font-mono text-gray-300">{reg.regionInfo.code}</span>
                          <span className="ml-2 text-[11px] text-gray-500">[{reg.regionInfo.location}]</span>
                        </td>
                        <td className="px-5 py-3 text-center">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-700 text-gray-200">
                            {reg.azCount} 個 AZ
                          </span>
                        </td>
                        <td className="px-5 py-3 text-center">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-700 text-gray-200">
                            {reg.serviceCount} 項服務
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right font-mono font-bold text-white text-base">
                          ${formatNumber(reg.cost)}
                        </td>
                        <td className="px-5 py-3 text-right font-mono font-semibold" style={{ color: reg.regionInfo.color }}>
                          {reg.percentage.toFixed(2)}%
                        </td>
                      </tr>

                      {/* 展開之 AZ 與服務清單 */}
                      {isExpanded && (
                        <tr className="bg-gray-900/95 border-b border-gray-700">
                          <td colSpan={7} className="p-4 sm:p-6 border-l-4" style={{ borderLeftColor: reg.regionInfo.color }}>
                            <div className="space-y-4">
                              {/* 1. AZ 可用區分佈 */}
                              <div>
                                <h5 className="text-xs font-bold text-gray-200 mb-2 flex items-center gap-1.5">
                                  <span>📍</span>
                                  <span>【{reg.regionCode} - {reg.regionInfo.nameZh}】涵蓋之 AZ 可用區分佈：</span>
                                </h5>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                                  {reg.azs.map(az => (
                                    <div 
                                      key={az.azCode}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setExpandedAzCode(prev => prev === az.azCode ? null : az.azCode);
                                      }}
                                      className={`p-3 rounded-lg border text-xs cursor-pointer transition-all ${
                                        expandedAzCode === az.azCode 
                                          ? 'bg-blue-950/50 border-blue-500 shadow' 
                                          : 'bg-gray-800/90 border-gray-700 hover:border-gray-600'
                                      }`}
                                    >
                                      <div className="flex justify-between items-center mb-1">
                                        <span className="font-bold text-white">{az.azCode}</span>
                                        <span className="text-[11px] font-mono font-bold text-blue-300">${formatNumber(az.cost)}</span>
                                      </div>
                                      <div className="text-[11px] text-gray-400 truncate">{az.azDisplay}</div>
                                      <div className="mt-1.5 flex justify-between items-center text-[10px] text-gray-400">
                                        <span>{az.serviceCount} 項服務</span>
                                        <span className="font-mono text-gray-300">佔 Region {az.percentage.toFixed(1)}%</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* 2. Top 服務明細清單 */}
                              <div>
                                <h5 className="text-xs font-bold text-gray-200 mb-2 flex items-center gap-1.5">
                                  <span>⚡</span>
                                  <span>此 Region 主要消耗之 AWS 服務列表 (Top 10)：</span>
                                </h5>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                                  {reg.services.slice(0, 10).map((srv, sIdx) => (
                                    <div key={sIdx} className="bg-gray-800/80 p-2.5 rounded border border-gray-700 flex justify-between items-center text-xs">
                                      <div className="min-w-0 flex-1 pr-2">
                                        <div className="font-semibold text-gray-200 truncate">{srv.productName}</div>
                                        <div className="text-[10px] text-gray-400">佔此 Region: {srv.percentage.toFixed(1)}%</div>
                                      </div>
                                      <div className="font-mono font-bold text-blue-300 whitespace-nowrap">
                                        ${formatNumber(srv.cost)}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}

                {/* 總計行 */}
                <tr className="bg-gray-750 font-bold border-t-2 border-gray-600">
                  <td className="px-5 py-4 text-center text-gray-400">∑</td>
                  <td className="px-5 py-4 text-white text-base">全區域總計 (Total)</td>
                  <td className="px-5 py-4 text-gray-300 text-xs">共 {regionList.length} 個 Region 區域</td>
                  <td className="px-5 py-4 text-center text-gray-200">{azList.length} 個 AZ</td>
                  <td className="px-5 py-4 text-center text-gray-200">-</td>
                  <td className="px-5 py-4 text-right font-mono text-yellow-400 text-lg">
                    ${formatNumber(totalCost)}
                  </td>
                  <td className="px-5 py-4 text-right font-mono text-yellow-400">100.00%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default RegionAzAnalysisSection;
