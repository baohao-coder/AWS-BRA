import React, { useState } from 'react';
import { EdpForecastSettings, EdpProjectedItem, EdpMonthlyOverride, DEFAULT_FORECAST_SETTINGS } from '../../services/edpCalculator';

interface EdpForecastManagerProps {
  settings: EdpForecastSettings;
  onChange: (newSettings: EdpForecastSettings) => void;
  lastActualMonth: string;
  futureMonthsList: string[];
  discountRate: number;
}

const formatCurrency = (val: number): string => {
  if (typeof val !== 'number' || isNaN(val)) return '$0';
  return '$' + new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(val);
};

export const EdpForecastManager: React.FC<EdpForecastManagerProps> = ({
  settings,
  onChange,
  lastActualMonth,
  futureMonthsList,
  discountRate,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'model' | 'projects' | 'monthlyGrid'>('projects');
  
  // New Project Form State
  const [showAddProjectModal, setShowAddProjectModal] = useState<boolean>(false);
  const [newProjectName, setNewProjectName] = useState<string>('');
  const [newProjectCategory, setNewProjectCategory] = useState<string>('AI / GenAI');
  const [newProjectStartMonth, setNewProjectStartMonth] = useState<string>(futureMonthsList[0] || '');
  const [newProjectEndMonth, setNewProjectEndMonth] = useState<string>('');
  const [newProjectAmount, setNewProjectAmount] = useState<number>(30000);
  const [newProjectIsDiscounted, setNewProjectIsDiscounted] = useState<boolean>(true);
  const [newProjectNotes, setNewProjectNotes] = useState<string>('');

  const handleToggleForecast = () => {
    onChange({
      ...settings,
      enabled: !settings.enabled,
    });
  };

  const handleUpdateBaseModel = (updates: Partial<EdpForecastSettings>) => {
    onChange({
      ...settings,
      ...updates,
    });
  };

  const handleAddProject = () => {
    if (!newProjectName.trim()) {
      alert('請輸入專案名稱');
      return;
    }
    const newProj: EdpProjectedItem = {
      id: `proj-${Date.now()}`,
      name: newProjectName.trim(),
      category: newProjectCategory,
      startMonth: newProjectStartMonth || futureMonthsList[0] || '',
      endMonth: newProjectEndMonth || undefined,
      monthlyAmount: Number(newProjectAmount) || 0,
      isDiscounted: newProjectIsDiscounted,
      enabled: true,
      notes: newProjectNotes.trim(),
    };

    onChange({
      ...settings,
      projectedProjects: [...settings.projectedProjects, newProj],
    });

    // Reset Form
    setNewProjectName('');
    setNewProjectAmount(30000);
    setNewProjectNotes('');
    setShowAddProjectModal(false);
  };

  const handleAddTemplateProject = (template: { name: string; category: string; amount: number; isDiscounted: boolean; notes: string }) => {
    const newProj: EdpProjectedItem = {
      id: `proj-${Date.now()}`,
      name: template.name,
      category: template.category,
      startMonth: futureMonthsList[0] || '',
      monthlyAmount: template.amount,
      isDiscounted: template.isDiscounted,
      enabled: true,
      notes: template.notes,
    };

    onChange({
      ...settings,
      projectedProjects: [...settings.projectedProjects, newProj],
    });
  };

  const handleToggleProject = (id: string) => {
    onChange({
      ...settings,
      projectedProjects: settings.projectedProjects.map(p => 
        p.id === id ? { ...p, enabled: !p.enabled } : p
      ),
    });
  };

  const handleDeleteProject = (id: string) => {
    onChange({
      ...settings,
      projectedProjects: settings.projectedProjects.filter(p => p.id !== id),
    });
  };

  const handleUpdateMonthlyOverride = (month: string, field: 'customBaseAmount' | 'additionalAmount', value: string) => {
    const currentOverride = settings.monthlyOverrides[month] || { month };
    const numVal = value === '' ? undefined : Number(value);

    const updatedOverrides = { ...settings.monthlyOverrides };
    if (numVal === undefined && (field === 'customBaseAmount' ? currentOverride.additionalAmount === undefined : currentOverride.customBaseAmount === undefined)) {
      delete updatedOverrides[month];
    } else {
      updatedOverrides[month] = {
        ...currentOverride,
        [field]: numVal,
      };
    }

    onChange({
      ...settings,
      monthlyOverrides: updatedOverrides,
    });
  };

  const handleResetSettings = () => {
    if (window.confirm('確定要將預估成長模型與專案清單重設為預設值嗎？')) {
      onChange(DEFAULT_FORECAST_SETTINGS);
    }
  };

  const totalActiveProjectMonthlySpend = settings.projectedProjects
    .filter(p => p.enabled)
    .reduce((sum, p) => sum + (p.isDiscounted ? p.monthlyAmount * discountRate : p.monthlyAmount), 0);

  return (
    <div className="bg-gradient-to-r from-gray-800/95 via-gray-800 to-indigo-950/40 p-5 rounded-2xl border border-indigo-500/40 shadow-xl space-y-5">
      {/* 頂部標題與總開關列 */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-gray-700/80">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-0.5 bg-indigo-600 text-white text-[11px] font-bold rounded shadow uppercase tracking-wide">
              未來用量預估引擎 (Growth & Forecast Engine)
            </span>
            <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              📈 未來用量預估與新增成長模擬
            </h3>
          </div>
          <p className="text-gray-400 text-xs mt-1">
            除了目前匯入的歷史帳單，可自訂未來月成長率、定額增量、或手動輸入預期上線專案（如 Bedrock AI、系統遷移等），即時模擬對 EDP 年度與 3 年總承諾的影響。
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="relative inline-flex items-center cursor-pointer">
            <input 
              type="checkbox" 
              checked={settings.enabled} 
              onChange={handleToggleForecast} 
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
            <span className="ml-2.5 text-xs font-bold text-white whitespace-nowrap">
              {settings.enabled ? '🟢 已開啟預估模擬' : '⚪ 預估模擬已關閉'}
            </span>
          </label>

          <button
            type="button"
            onClick={handleResetSettings}
            className="px-2.5 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white text-xs rounded-lg border border-gray-600 transition"
            title="重設所有預估參數與新增專案"
          >
            🔄 重設
          </button>
        </div>
      </div>

      {settings.enabled && (
        <div className="space-y-4">
          {/* 子導覽切換 (成長模型 / 專案管線 / 各月微調) */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-900/80 p-1.5 rounded-xl border border-gray-700">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setActiveSubTab('projects')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition ${
                  activeSubTab === 'projects'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                💼 新增預期專案/工作負載 ({settings.projectedProjects.filter(p => p.enabled).length} 個啟用)
              </button>
              <button
                type="button"
                onClick={() => setActiveSubTab('model')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition ${
                  activeSubTab === 'model'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                ⚙️ 基礎成長模型設定 ({settings.baseGrowthModel === 'FIXED_RATE' ? `月增 +${settings.monthlyGrowthRate}%` : settings.baseGrowthModel === 'FIXED_AMOUNT' ? `月增 +${formatCurrency(settings.monthlyGrowthAmount)}` : '均值預估'})
              </button>
              <button
                type="button"
                onClick={() => setActiveSubTab('monthlyGrid')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition ${
                  activeSubTab === 'monthlyGrid'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                ✍️ 各月預估快速微調表 ({Object.keys(settings.monthlyOverrides).length} 月微調)
              </button>
            </div>

            <div className="text-xs text-indigo-300 font-mono pr-2">
              專案月均增量: <strong className="text-white">{formatCurrency(totalActiveProjectMonthlySpend)}</strong> (89折後)
            </div>
          </div>

          {/* ========================================================================= */}
          {/* TAB 1: 專案管線 (Project Pipeline) */}
          {/* ========================================================================= */}
          {activeSubTab === 'projects' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-gray-300">
                  <span className="font-semibold text-white">自訂預期新增工作負載清單：</span>
                  填寫預期即將上線的業務系統或 AI 模型用量，系統將在指定月份自動疊加計算。
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddProjectModal(true)}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg shadow transition flex items-center gap-1.5"
                  >
                    <span>➕ 新增預期用量專案</span>
                  </button>
                </div>
              </div>

              {/* 快速範本按鈕區 */}
              <div className="p-3 bg-gray-900/60 rounded-xl border border-gray-700/60 text-xs flex flex-wrap items-center gap-2">
                <span className="text-gray-400 font-medium">⚡ 常用預期用量範本：</span>
                <button
                  type="button"
                  onClick={() => handleAddTemplateProject({
                    name: 'Amazon Bedrock GenAI 擴展',
                    category: 'AI / GenAI',
                    amount: 35000,
                    isDiscounted: true,
                    notes: 'Claude 3.5 Sonnet / Haiku API 擴展用量',
                  })}
                  className="px-2.5 py-1 bg-gray-800 hover:bg-indigo-900/40 text-indigo-300 hover:text-white border border-indigo-500/30 rounded-md transition"
                >
                  + Bedrock GenAI (+$35K/月)
                </button>
                <button
                  type="button"
                  onClick={() => handleAddTemplateProject({
                    name: '核心交易資料庫搬遷 Phase 2',
                    category: 'Migration',
                    amount: 45000,
                    isDiscounted: true,
                    notes: 'Aurora PostgreSQL 與 EC2 擴展叢集',
                  })}
                  className="px-2.5 py-1 bg-gray-800 hover:bg-indigo-900/40 text-indigo-300 hover:text-white border border-indigo-500/30 rounded-md transition"
                >
                  + 資料庫核心搬遷 (+$45K/月)
                </button>
                <button
                  type="button"
                  onClick={() => handleAddTemplateProject({
                    name: 'SaaS / Marketplace 第三方軟體訂閱',
                    category: 'Marketplace',
                    amount: 20000,
                    isDiscounted: false,
                    notes: 'Datadog / Snowflake AWS Marketplace 訂閱 (100% 計費)',
                  })}
                  className="px-2.5 py-1 bg-gray-800 hover:bg-indigo-900/40 text-indigo-300 hover:text-white border border-indigo-500/30 rounded-md transition"
                >
                  + Marketplace 訂閱 (+$20K/月 原價)
                </button>
              </div>

              {/* 專案清單 */}
              {settings.projectedProjects.length === 0 ? (
                <div className="p-8 text-center bg-gray-900/40 rounded-xl border border-dashed border-gray-700 text-gray-400 text-xs">
                  目前尚未新增任何自訂專案。點選「➕ 新增預期用量專案」或「⚡ 常用範本」快速建立！
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {settings.projectedProjects.map((p) => {
                    const discountedAmount = p.isDiscounted ? p.monthlyAmount * discountRate : p.monthlyAmount;
                    return (
                      <div 
                        key={p.id}
                        className={`p-4 rounded-xl border transition-all ${
                          p.enabled 
                            ? 'bg-gray-900/90 border-indigo-500/40 shadow-sm' 
                            : 'bg-gray-900/40 border-gray-700/50 opacity-60'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 bg-indigo-950 text-indigo-300 text-[10px] font-bold rounded border border-indigo-500/30">
                                {p.category || '專案'}
                              </span>
                              <h4 className="text-sm font-bold text-white">{p.name}</h4>
                            </div>
                            {p.notes && <p className="text-gray-400 text-xs mt-1">{p.notes}</p>}
                          </div>

                          <div className="flex items-center gap-2">
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input 
                                type="checkbox" 
                                checked={p.enabled} 
                                onChange={() => handleToggleProject(p.id)} 
                                className="sr-only peer"
                              />
                              <div className="w-8 h-4 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-600"></div>
                            </label>
                            <button
                              type="button"
                              onClick={() => handleDeleteProject(p.id)}
                              className="text-gray-500 hover:text-rose-400 p-1 text-xs transition"
                              title="刪除此專案"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-800 text-xs">
                          <div>
                            <span className="text-gray-400 block text-[11px]">起始月份</span>
                            <strong className="text-gray-200 font-mono">{p.startMonth || '接續最後月'}</strong>
                          </div>
                          <div>
                            <span className="text-gray-400 block text-[11px]">原始月預估</span>
                            <strong className="text-white font-mono">{formatCurrency(p.monthlyAmount)}</strong>
                          </div>
                          <div className="text-right">
                            <span className="text-gray-400 block text-[11px]">
                              {p.isDiscounted ? 'EDP (89折後)' : 'Marketplace (100%)'}
                            </span>
                            <strong className="text-emerald-400 font-mono text-sm">
                              {formatCurrency(discountedAmount)}
                            </strong>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 2: 基礎成長模型 (Baseline Model) */}
          {/* ========================================================================= */}
          {activeSubTab === 'model' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 bg-gray-900/60 p-4 rounded-xl border border-gray-700 text-xs">
              {/* 預估涵蓋期間 */}
              <div className="space-y-2">
                <label className="block text-gray-300 font-bold">
                  1. 預估涵蓋範圍 (Forecast Horizon)
                </label>
                <select
                  value={settings.forecastHorizon}
                  onChange={(e) => handleUpdateBaseModel({ forecastHorizon: e.target.value as any })}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white font-medium focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="FULL_3_YEARS">預估滿 3 年合約期 (共 36 個月，看 $20M 總承諾)</option>
                  <option value="END_OF_YEAR">預估至當前合約年度結束 (看當年度目標)</option>
                </select>
                <p className="text-gray-400 text-[11px]">
                  可選擇完整模擬 36 個月，或僅預估該年度剩餘月份。
                </p>
              </div>

              {/* 基準錨點策略 */}
              <div className="space-y-2">
                <label className="block text-gray-300 font-bold">
                  2. 預估基準起點 (Base Anchor)
                </label>
                <select
                  value={settings.baseMonthStrategy}
                  onChange={(e) => handleUpdateBaseModel({ baseMonthStrategy: e.target.value as any })}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white font-medium focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="LAST_ACTUAL_MONTH">依最後一個實際月份 ({lastActualMonth})</option>
                  <option value="LAST_3_MONTHS_AVG">依近 3 個月實際平均值 (Run Rate)</option>
                  <option value="CUSTOM_AMOUNT">自訂每月基礎起始費用 (Custom Base)</option>
                </select>

                {settings.baseMonthStrategy === 'CUSTOM_AMOUNT' && (
                  <div className="mt-2">
                    <span className="text-gray-400 text-[11px] block">自訂基準月花費 (USD):</span>
                    <input
                      type="number"
                      value={settings.customBaseSpend}
                      onChange={(e) => handleUpdateBaseModel({ customBaseSpend: Number(e.target.value) })}
                      className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-white font-mono"
                    />
                  </div>
                )}
              </div>

              {/* 成長算法 */}
              <div className="space-y-2">
                <label className="block text-gray-300 font-bold">
                  3. 基礎成長模式 (Growth Formula)
                </label>
                <select
                  value={settings.baseGrowthModel}
                  onChange={(e) => handleUpdateBaseModel({ baseGrowthModel: e.target.value as any })}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white font-medium focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="FIXED_RATE">幾何月成長率 (複利增長 % / 月)</option>
                  <option value="FIXED_AMOUNT">固定月增量 (每月線性增加 $ / 月)</option>
                  <option value="AVERAGE_RUN_RATE">平穩延續 (維持基準值，僅加上新增專案)</option>
                  <option value="MANUAL_ONLY">純專案與手動輸入模式 (不計基礎成長)</option>
                </select>

                {settings.baseGrowthModel === 'FIXED_RATE' && (
                  <div className="mt-2">
                    <span className="text-gray-400 text-[11px] block">每月複利成長率 (%):</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.1"
                        value={settings.monthlyGrowthRate}
                        onChange={(e) => handleUpdateBaseModel({ monthlyGrowthRate: Number(e.target.value) })}
                        className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-white font-mono"
                      />
                      <span className="text-indigo-400 font-bold">%</span>
                    </div>
                  </div>
                )}

                {settings.baseGrowthModel === 'FIXED_AMOUNT' && (
                  <div className="mt-2">
                    <span className="text-gray-400 text-[11px] block">每月固定新增金額 (USD):</span>
                    <input
                      type="number"
                      step="1000"
                      value={settings.monthlyGrowthAmount}
                      onChange={(e) => handleUpdateBaseModel({ monthlyGrowthAmount: Number(e.target.value) })}
                      className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-white font-mono"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 3: 各月微調表格 (Monthly Grid Direct Override) */}
          {/* ========================================================================= */}
          {activeSubTab === 'monthlyGrid' && (
            <div className="space-y-3 bg-gray-900/60 p-4 rounded-xl border border-gray-700 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-gray-300">
                  可在此處直接對未來特定月份進行自訂金額微調 (如季末促銷、黑五檔期加碼等)：
                </span>
                <span className="text-gray-400 text-[11px]">輸入數字即時覆蓋</span>
              </div>

              <div className="overflow-x-auto max-h-64">
                <table className="w-full text-xs text-left text-gray-300">
                  <thead className="text-[11px] text-gray-400 uppercase bg-gray-800 border-b border-gray-700 sticky top-0 font-semibold">
                    <tr>
                      <th className="px-3 py-2">未來預估月份</th>
                      <th className="px-3 py-2">自訂基準金額 (USD)</th>
                      <th className="px-3 py-2">額外增量金額 (USD)</th>
                      <th className="px-3 py-2">備註 / 活動原因</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800 font-mono">
                    {futureMonthsList.map((month) => {
                      const override = settings.monthlyOverrides[month] || {};
                      return (
                        <tr key={month} className="hover:bg-gray-800/50">
                          <td className="px-3 py-2 font-bold text-white font-sans">{month}</td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              placeholder="預設依模型計算"
                              value={override.customBaseAmount ?? ''}
                              onChange={(e) => handleUpdateMonthlyOverride(month, 'customBaseAmount', e.target.value)}
                              className="w-36 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs font-mono"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              placeholder="+$0"
                              value={override.additionalAmount ?? ''}
                              onChange={(e) => handleUpdateMonthlyOverride(month, 'additionalAmount', e.target.value)}
                              className="w-36 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-emerald-400 text-xs font-mono"
                            />
                          </td>
                          <td className="px-3 py-2 font-sans">
                            <input
                              type="text"
                              placeholder="例: 電商雙11檔期加碼"
                              value={override.notes ?? ''}
                              onChange={(e) => {
                                const currentOverride = settings.monthlyOverrides[month] || { month };
                                onChange({
                                  ...settings,
                                  monthlyOverrides: {
                                    ...settings.monthlyOverrides,
                                    [month]: { ...currentOverride, notes: e.target.value },
                                  },
                                });
                              }}
                              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-300 text-xs"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 新增專案 Modal */}
      {showAddProjectModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-gray-800 rounded-2xl border border-indigo-500/50 shadow-2xl max-w-lg w-full p-6 space-y-5">
            <div className="flex justify-between items-center pb-3 border-b border-gray-700">
              <h4 className="text-base font-bold text-white flex items-center gap-2">
                <span>➕ 新增未來預期用量專案 (Workload Addition)</span>
              </h4>
              <button
                type="button"
                onClick={() => setShowAddProjectModal(false)}
                className="text-gray-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block text-gray-300 font-semibold mb-1">專案 / 系統名稱:</label>
                <input
                  type="text"
                  placeholder="例: Amazon Bedrock GenAI 導入專案"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-xs focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-300 font-semibold mb-1">業務分類 (Category):</label>
                  <select
                    value={newProjectCategory}
                    onChange={(e) => setNewProjectCategory(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-xs"
                  >
                    <option value="AI / GenAI">AI / GenAI (Bedrock, SageMaker)</option>
                    <option value="Migration">雲端系統搬遷 (Migration / Rehost)</option>
                    <option value="Data Lake">資料湖與分析 (Data Lake / OpenSearch)</option>
                    <option value="Global Expansion">海外新業務擴展 (Global Expansion)</option>
                    <option value="Marketplace">Marketplace 第三方軟體訂閱</option>
                    <option value="Other">其他工作負載 (Other)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-gray-300 font-semibold mb-1">每月預估費用 (USD):</label>
                  <input
                    type="number"
                    step="1000"
                    placeholder="30000"
                    value={newProjectAmount}
                    onChange={(e) => setNewProjectAmount(Number(e.target.value))}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white font-mono text-xs focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-300 font-semibold mb-1">預計起始月份:</label>
                  <select
                    value={newProjectStartMonth}
                    onChange={(e) => setNewProjectStartMonth(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-xs"
                  >
                    {futureMonthsList.map((m) => (
                      <option key={m} value={m}>{m} 起始</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-gray-300 font-semibold mb-1">結束月份 (選填，留空為持續):</label>
                  <input
                    type="text"
                    placeholder="YYYY-MM (可留空)"
                    value={newProjectEndMonth}
                    onChange={(e) => setNewProjectEndMonth(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={newProjectIsDiscounted}
                    onChange={(e) => setNewProjectIsDiscounted(e.target.checked)}
                    className="rounded bg-gray-700 border-gray-600 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-gray-300 font-medium">
                    享有一般 AWS 服務 89 折 EDP 折扣 (若為 Marketplace 第三方市集請取消勾選維持 100% 原價)
                  </span>
                </label>
              </div>

              <div>
                <label className="block text-gray-300 font-semibold mb-1">專案備註說明:</label>
                <textarea
                  rows={2}
                  placeholder="簡短描述此專案預期使用之 AWS 服務或上線時程..."
                  value={newProjectNotes}
                  onChange={(e) => setNewProjectNotes(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-xs"
                ></textarea>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-gray-700">
              <button
                type="button"
                onClick={() => setShowAddProjectModal(false)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-semibold rounded-lg"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleAddProject}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow"
              >
                確認新增
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
