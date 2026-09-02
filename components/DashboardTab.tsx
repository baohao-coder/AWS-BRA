import React, { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { BillingData } from '../types';
import { exportToExcel } from '../services/excelUtils';
import Card from './common/Card';

interface DashboardTabProps {
  data: BillingData;
}

const formatNumber = (value: number, decimals: number = 2) => {
    if (typeof value !== 'number' || isNaN(value)) return '0.00';
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
};

type SortKey = 'accountId' | 'accountName' | 'currentAmount' | 'currentMom';
type SortDirection = 'asc' | 'desc';

// 二三階排序類型定義
type ProductSortKey = 'productName' | 'currentCost' | 'diff';
type UsageSortKey = 'description' | 'currentCost' | 'costDiff';

const DashboardTab: React.FC<DashboardTabProps> = ({ data }) => {
  const sortedData = useMemo(() => [...data].sort((a, b) => a.month.localeCompare(b.month)), [data]);
  const months = useMemo(() => sortedData.map(d => d.month), [sortedData]);

  const [focusMonth, setFocusMonth] = useState<string>(months[months.length - 1] || '');
  const [expandedAccountId, setExpandedAccountId] = useState<string | null>(null);
  const [expandedProductKey, setExpandedProductKey] = useState<string | null>(null);
  const [showAccountListDetails, setShowAccountListDetails] = useState<{[month: string]: boolean}>({});
  
  // 排序狀態
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'currentAmount',
    direction: 'desc'
  });
  const [productSortConfig, setProductSortConfig] = useState<{ key: ProductSortKey; direction: SortDirection }>({
    key: 'diff',
    direction: 'desc'
  });
  const [usageSortConfig, setUsageSortConfig] = useState<{ key: UsageSortKey; direction: SortDirection }>({
    key: 'costDiff',
    direction: 'desc'
  });

  const monthlyTotalData = useMemo(() => {
    return sortedData.map(monthData => ({
      month: monthData.month,
      'Total Amount of Payment (USD)': monthData.totalAmount,
    }));
  }, [sortedData]);

  // 帳號數量趨勢資料
  const monthlyAccountCountData = useMemo(() => {
    return sortedData.map(monthData => ({
      month: monthData.month,
      'Number of Accounts': monthData.accounts.length,
    }));
  }, [sortedData]);

  // 帳號變動明細計算
  const accountChangeLog = useMemo(() => {
    const log = [];
    for (let i = 0; i < sortedData.length; i++) {
      const current = sortedData[i];
      const prev = i > 0 ? sortedData[i - 1] : null;

      const currentIds = new Set(current.accounts.map(a => a.accountId));
      const prevIds = prev ? new Set(prev.accounts.map(a => a.accountId)) : new Set<string>();

      const added = current.accounts.filter(a => !prevIds.has(a.accountId));
      const removed = prev ? prev.accounts.filter(a => !currentIds.has(a.accountId)) : [];

      log.push({
        month: current.month,
        total: current.accounts.length,
        added: added.map(a => ({ id: a.accountId, name: a.accountName })),
        removed: removed.map(a => ({ id: a.accountId, name: a.accountName }))
      });
    }
    return log.reverse(); // 最新月份放在上面
  }, [sortedData]);
  
  const totalCumulativeAmount = useMemo(() => {
    return sortedData.reduce((sum, monthData) => sum + monthData.totalAmount, 0);
  }, [sortedData]);

  const perAccountChangesData = useMemo(() => {
    const allAccounts = new Map<string, { accountName: string; monthlyTotals: { [month: string]: number } }>();
    
    sortedData.forEach(monthData => {
      monthData.accounts.forEach(account => {
        if (!allAccounts.has(account.accountId)) {
          allAccounts.set(account.accountId, { accountName: account.accountName, monthlyTotals: {} });
        }
        const acc = allAccounts.get(account.accountId)!;
        acc.monthlyTotals[monthData.month] = account.totalAmount;
      });
    });

    return Array.from(allAccounts.entries()).map(([accountId, data]) => ({
      accountId,
      accountName: data.accountName,
      monthlyTotals: data.monthlyTotals
    }));
  }, [sortedData]);

  const sortedAccounts = useMemo(() => {
    const prevMonthIndex = months.indexOf(focusMonth) - 1;
    const prevMonth = prevMonthIndex >= 0 ? months[prevMonthIndex] : null;

    return [...perAccountChangesData].sort((a, b) => {
      let valA: any, valB: any;
      switch (sortConfig.key) {
        case 'accountId': valA = a.accountId; valB = b.accountId; break;
        case 'accountName': valA = a.accountName; valB = b.accountName; break;
        case 'currentAmount': valA = a.monthlyTotals[focusMonth] || 0; valB = b.monthlyTotals[focusMonth] || 0; break;
        case 'currentMom':
          const curA = a.monthlyTotals[focusMonth] || 0;
          const preA = prevMonth ? (a.monthlyTotals[prevMonth] || 0) : 0;
          const curB = b.monthlyTotals[focusMonth] || 0;
          const preB = prevMonth ? (b.monthlyTotals[prevMonth] || 0) : 0;
          valA = curA - preA; valB = curB - preB;
          break;
        default: return 0;
      }
      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [perAccountChangesData, sortConfig, focusMonth, months]);

  const handleSort = (key: SortKey) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const handleProductSort = (key: ProductSortKey) => {
    setProductSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const handleUsageSort = (key: UsageSortKey) => {
    setUsageSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const getSortIcon = (currentKey: any, targetKey: any, direction: SortDirection) => {
    if (currentKey !== targetKey) return '↕';
    return direction === 'asc' ? '↑' : '↓';
  };

  const getAccountServiceDetails = (accountId: string) => {
    const currentMonthData = sortedData.find(d => d.month === focusMonth);
    const prevMonthIndex = months.indexOf(focusMonth) - 1;
    const prevMonth = prevMonthIndex >= 0 ? months[prevMonthIndex] : null;
    const prevMonthData = prevMonth ? sortedData.find(d => d.month === prevMonth) : null;
    const currentAccount = currentMonthData?.accounts.find(a => a.accountId === accountId);
    const prevAccount = prevMonthData?.accounts.find(a => a.accountId === accountId);
    const services = new Map<string, { current: number; prev: number }>();
    
    currentAccount?.services.forEach(s => {
      const existing = services.get(s.productName) || { current: 0, prev: 0 };
      services.set(s.productName, { ...existing, current: existing.current + s.totalCost });
    });
    
    prevAccount?.services.forEach(s => {
      const existing = services.get(s.productName) || { current: 0, prev: 0 };
      services.set(s.productName, { ...existing, prev: existing.prev + s.totalCost });
    });
    
    return Array.from(services.entries())
      .map(([name, costs]) => ({ productName: name, currentCost: costs.current, prevCost: costs.prev, diff: costs.current - costs.prev }))
      .sort((a, b) => {
        let valA: any, valB: any;
        switch (productSortConfig.key) {
          case 'productName': valA = a.productName; valB = b.productName; break;
          case 'currentCost': valA = a.currentCost; valB = b.currentCost; break;
          case 'diff': valA = a.diff; valB = b.diff; break;
          default: return 0;
        }
        if (valA < valB) return productSortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return productSortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
  };

  const getServiceUsageDetails = (accountId: string, productName: string) => {
    const currentMonthData = sortedData.find(d => d.month === focusMonth);
    const prevMonthIndex = months.indexOf(focusMonth) - 1;
    const prevMonth = prevMonthIndex >= 0 ? months[prevMonthIndex] : null;
    const prevMonthData = prevMonth ? sortedData.find(d => d.month === prevMonth) : null;
    const currentService = currentMonthData?.accounts.find(a => a.accountId === accountId)?.services.find(s => s.productName === productName);
    const prevService = prevMonthData?.accounts.find(a => a.accountId === accountId)?.services.find(s => s.productName === productName);
    
    const usageMap = new Map<string, { currentUsage: number; prevUsage: number; currentCost: number; prevCost: number; usageType: string; itemDescription: string }>();
    
    currentService?.details.forEach(d => {
      const key = `${d.usageType}|||${d.itemDescription}`;
      const existing = usageMap.get(key) || { currentUsage: 0, prevUsage: 0, currentCost: 0, prevCost: 0, usageType: d.usageType, itemDescription: d.itemDescription };
      usageMap.set(key, { 
        ...existing,
        currentUsage: existing.currentUsage + d.usages,
        currentCost: existing.currentCost + d.totalCost
      });
    });

    prevService?.details.forEach(d => {
      const key = `${d.usageType}|||${d.itemDescription}`;
      const existing = usageMap.get(key) || { currentUsage: 0, prevUsage: 0, currentCost: 0, prevCost: 0, usageType: d.usageType, itemDescription: d.itemDescription };
      usageMap.set(key, {
        ...existing,
        prevUsage: existing.prevUsage + d.usages,
        prevCost: existing.prevCost + d.totalCost
      });
    });
    
    return Array.from(usageMap.values()).sort((a, b) => {
      let valA: any, valB: any;
      switch (usageSortConfig.key) {
        case 'description': 
          valA = `${a.usageType} ${a.itemDescription}`; 
          valB = `${b.usageType} ${b.itemDescription}`; 
          break;
        case 'currentCost': valA = a.currentCost; valB = b.currentCost; break;
        case 'costDiff': valA = a.currentCost - a.prevCost; valB = b.currentCost - b.prevCost; break;
        default: return 0;
      }
      if (valA < valB) return usageSortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return usageSortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const handleExport = () => {
      const exportData = sortedAccounts.map(account => {
        const row: any = { 'Account ID': account.accountId, 'Account Name': account.accountName };
        months.forEach(month => { row[`${month} (USD)`] = (account.monthlyTotals[month] ?? 0).toFixed(2); });
        return row;
      });
      exportToExcel(exportData, `account_cost_summary_sorted`);
  };

  const toggleMonthDetails = (month: string) => {
    setShowAccountListDetails(prev => ({
      ...prev,
      [month]: !prev[month]
    }));
  };
  
  return (
    <div className="space-y-8">
      <Card title="總覽與每月趨勢">
        <div className="mb-6 p-4 bg-gray-700 rounded-lg">
          <h4 className="text-lg font-semibold text-white">累計總支付金額 (Total Amount of Payment)</h4>
          <p className="text-3xl font-bold text-blue-400">{formatNumber(totalCumulativeAmount)} (USD)</p>
        </div>
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={monthlyTotalData} margin={{ top: 20, right: 30, left: 60, bottom: 15 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#4a5568" />
              <XAxis dataKey="month" stroke="#9ca3af" tick={{ fill: '#f3f4f6', fontSize: 11, fontWeight: 'bold' }} />
              <YAxis stroke="#9ca3af" tick={{ fill: '#f3f4f6', fontSize: 11 }} tickFormatter={(value) => Number(value).toLocaleString()} />
              <Tooltip
                contentStyle={{ backgroundColor: '#111827', border: '1px solid #4b5563', borderRadius: '0.75rem', color: '#ffffff', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' }}
                itemStyle={{ color: '#ffffff', fontWeight: 500 }}
                labelStyle={{ color: '#ffffff', fontWeight: 'bold', marginBottom: '4px' }}
                labelFormatter={(label) => `計費月份: ${label}`}
                formatter={(value: number) => [`$${formatNumber(value)} USD`, '當月總支付金額 (Monthly Total Payment)']}
              />
              <Legend wrapperStyle={{ color: '#f3f4f6', paddingTop: '6px' }} />
              <Line type="monotone" dataKey="Total Amount of Payment (USD)" stroke="#38bdf8" strokeWidth={3} activeDot={{ r: 8 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* 帳號數量趨勢與變動明細 */}
      <Card title="帳號數量趨勢與變動明細">
        <div className="h-72 mb-10">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={monthlyAccountCountData} margin={{ top: 20, right: 30, left: 30, bottom: 15 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#4a5568" />
              <XAxis dataKey="month" stroke="#9ca3af" tick={{ fill: '#f3f4f6', fontSize: 11, fontWeight: 'bold' }} />
              <YAxis stroke="#9ca3af" tick={{ fill: '#f3f4f6', fontSize: 11 }} allowDecimals={false} label={{ value: 'Count', angle: -90, position: 'insideLeft', fill: '#f3f4f6' }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#111827', border: '1px solid #4b5563', borderRadius: '0.75rem', color: '#ffffff', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' }}
                itemStyle={{ color: '#ffffff', fontWeight: 500 }}
                labelStyle={{ color: '#ffffff', fontWeight: 'bold', marginBottom: '4px' }}
                labelFormatter={(label) => `計費月份: ${label}`}
                formatter={(value: number) => [`${value} 個`, '有效帳號總數 (Account Count)']}
              />
              <Legend wrapperStyle={{ color: '#f3f4f6', paddingTop: '6px' }} />
              <Line type="stepAfter" dataKey="Number of Accounts" stroke="#4ade80" strokeWidth={3} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-8">
          <h4 className="text-md font-semibold text-white mb-4 border-l-4 border-green-500 pl-3">每月帳號變動日誌</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-400">
              <thead className="text-xs text-gray-300 uppercase bg-gray-700">
                <tr>
                  <th className="px-4 py-3">月份</th>
                  <th className="px-4 py-3 text-center">總帳號數</th>
                  <th className="px-4 py-3">新增帳號 (Added)</th>
                  <th className="px-4 py-3">移除帳號 (Removed)</th>
                  <th className="px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {accountChangeLog.map((log) => {
                  const hasChanges = log.added.length > 0 || log.removed.length > 0;
                  const isExpanded = showAccountListDetails[log.month];

                  return (
                    <React.Fragment key={log.month}>
                      <tr className={`bg-gray-800 hover:bg-gray-750 transition-colors ${!hasChanges ? 'opacity-75' : ''}`}>
                        <td className="px-4 py-4 font-bold text-white">{log.month}</td>
                        <td className="px-4 py-4 text-center">
                          <span className="bg-gray-700 text-gray-200 px-2 py-1 rounded text-xs">{log.total}</span>
                        </td>
                        <td className="px-4 py-4">
                          {log.added.length > 0 ? (
                            <span className="text-green-400 font-bold">+{log.added.length}</span>
                          ) : (
                            <span className="text-gray-600">-</span>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          {log.removed.length > 0 ? (
                            <span className="text-red-400 font-bold">-{log.removed.length}</span>
                          ) : (
                            <span className="text-gray-600">-</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-right">
                          {hasChanges && (
                            <button 
                              onClick={() => toggleMonthDetails(log.month)}
                              className="text-blue-400 hover:text-blue-300 text-xs font-medium underline"
                            >
                              {isExpanded ? '隱藏名單' : '顯示名單'}
                            </button>
                          )}
                          {!hasChanges && <span className="text-gray-600 text-xs italic">無變動</span>}
                        </td>
                      </tr>
                      {isExpanded && hasChanges && (
                        <tr className="bg-gray-900/50 shadow-inner">
                          <td colSpan={5} className="px-6 py-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              {/* Added List */}
                              <div>
                                <h5 className="text-xs font-bold text-green-400 uppercase mb-2">新增名單 (+)</h5>
                                {log.added.length > 0 ? (
                                  <ul className="space-y-1">
                                    {log.added.map(acc => (
                                      <li key={acc.id} className="text-[11px] bg-green-900/20 border border-green-800/30 p-2 rounded flex justify-between">
                                        <span className="text-gray-300">{acc.name}</span>
                                        <span className="text-gray-500 font-mono ml-2">({acc.id})</span>
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="text-xs text-gray-600 italic">無</p>
                                )}
                              </div>
                              {/* Removed List */}
                              <div>
                                <h5 className="text-xs font-bold text-red-400 uppercase mb-2">移除/未出帳名單 (-)</h5>
                                {log.removed.length > 0 ? (
                                  <ul className="space-y-1">
                                    {log.removed.map(acc => (
                                      <li key={acc.id} className="text-[11px] bg-red-900/20 border border-red-800/30 p-2 rounded flex justify-between">
                                        <span className="text-gray-300">{acc.name}</span>
                                        <span className="text-gray-500 font-mono ml-2">({acc.id})</span>
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="text-xs text-gray-600 italic">無</p>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      <Card title="每個帳號的金額變化" actionButton={sortedAccounts.length > 0 && <button onClick={handleExport} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded text-sm transition-colors">匯出總表</button>}>
        <div className="mb-4 p-4 bg-gray-700 rounded-lg flex items-center flex-wrap gap-4">
            <div className="flex items-center space-x-2">
                <label htmlFor="focus-month-select" className="text-sm font-medium text-gray-300">分析基準月份:</label>
                <select
                    id="focus-month-select"
                    value={focusMonth}
                    onChange={(e) => {
                        setFocusMonth(e.target.value);
                        setExpandedAccountId(null);
                        setExpandedProductKey(null);
                    }}
                    className="bg-gray-800 border border-gray-600 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2"
                >
                    {months.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
            </div>
            <span className="text-xs text-gray-400">
                點擊各層級表頭 <span className="text-blue-400 font-bold">↑↓</span> 即可自定義排序。
            </span>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-400">
            <thead className="text-xs text-gray-300 uppercase bg-gray-700 sticky top-0">
              <tr>
                <th scope="col" className="px-4 py-3 cursor-pointer hover:bg-gray-600 transition-colors" onClick={() => handleSort('accountId')}>
                  <div className="flex items-center">
                    Account ID <span className={`ml-1 ${sortConfig.key === 'accountId' ? 'text-blue-400' : 'text-gray-500'}`}>{getSortIcon(sortConfig.key, 'accountId', sortConfig.direction)}</span>
                  </div>
                </th>
                <th scope="col" className="px-4 py-3 cursor-pointer hover:bg-gray-600 transition-colors" onClick={() => handleSort('accountName')}>
                  <div className="flex items-center">
                    Account Name <span className={`ml-1 ${sortConfig.key === 'accountName' ? 'text-blue-400' : 'text-gray-500'}`}>{getSortIcon(sortConfig.key, 'accountName', sortConfig.direction)}</span>
                  </div>
                </th>
                {months.map((month, index) => {
                  const isFocused = month === focusMonth;
                  return (
                    <React.Fragment key={month}>
                        <th 
                            scope="col" 
                            className={`px-4 py-3 text-right ${isFocused ? 'cursor-pointer hover:bg-blue-800 bg-blue-900/40 text-blue-100' : ''}`}
                            onClick={isFocused ? () => handleSort('currentAmount') : undefined}
                        >
                            <div className="flex items-center justify-end">
                                {month} (USD)
                                {isFocused && <span className={`ml-1 ${sortConfig.key === 'currentAmount' ? 'text-blue-400' : 'text-blue-200/50'}`}>{getSortIcon(sortConfig.key, 'currentAmount', sortConfig.direction)}</span>}
                            </div>
                        </th>
                        {index > 0 && (
                            <th 
                                scope="col" 
                                className={`px-4 py-3 text-right ${isFocused ? 'cursor-pointer hover:bg-blue-800 bg-blue-900/40 text-blue-100' : ''}`}
                                onClick={isFocused ? () => handleSort('currentMom') : undefined}
                            >
                                <div className="flex items-center justify-end">
                                    MoM (USD)
                                    {isFocused && <span className={`ml-1 ${sortConfig.key === 'currentMom' ? 'text-blue-400' : 'text-blue-200/50'}`}>{getSortIcon(sortConfig.key, 'currentMom', sortConfig.direction)}</span>}
                                </div>
                            </th>
                        )}
                    </React.Fragment>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sortedAccounts.map(account => {
                const isAccExpanded = expandedAccountId === account.accountId;
                return (
                  <React.Fragment key={account.accountId}>
                    <tr 
                        className={`bg-gray-800 border-b border-gray-700 hover:bg-gray-700 cursor-pointer transition-colors ${isAccExpanded ? 'bg-gray-750' : ''}`}
                        onClick={() => {
                            setExpandedAccountId(isAccExpanded ? null : account.accountId);
                            setExpandedProductKey(null);
                        }}
                    >
                        <td className="px-4 py-4 font-medium text-white whitespace-nowrap">
                            <span className={`inline-block w-4 transition-transform duration-200 ${isAccExpanded ? 'rotate-90' : ''}`}>▶</span>
                            <span className="ml-2">{account.accountId}</span>
                        </td>
                        <td className="px-4 py-4 text-gray-300">{account.accountName}</td>
                        {months.map((month, index) => {
                            const total = account.monthlyTotals[month] ?? 0;
                            const isFocused = month === focusMonth;
                            let mom, momColor;
                            if (index > 0) {
                                const prevMonth = months[index - 1];
                                const prevTotal = account.monthlyTotals[prevMonth] ?? 0;
                                mom = total - prevTotal;
                                momColor = mom > 0 ? 'text-red-400' : mom < 0 ? 'text-green-400' : 'text-gray-400';
                            }
                            return (
                                <React.Fragment key={month}>
                                    <td className={`px-4 py-4 text-right ${isFocused ? 'bg-blue-900/10 font-bold text-white border-x border-blue-900/20' : ''}`}>{formatNumber(total)}</td>
                                    {index > 0 && <td className={`px-4 py-4 text-right ${isFocused ? 'bg-blue-900/10 font-bold border-r border-blue-900/20' : ''} ${momColor}`}>{mom !== undefined ? formatNumber(mom) : '-'}</td>}
                                </React.Fragment>
                            );
                        })}
                    </tr>
                    {isAccExpanded && (
                        <tr className="bg-gray-900">
                            <td colSpan={2 + months.length * 2} className="p-4">
                                <div className="rounded-lg overflow-hidden border border-gray-700 bg-gray-800 shadow-2xl">
                                    <div className="px-4 py-2 border-b border-gray-700 bg-gray-750 flex justify-between items-center text-xs">
                                        <span className="font-semibold text-blue-400 uppercase tracking-tight">{account.accountName} 費用明細 - {focusMonth}</span>
                                        <span className="text-gray-500 italic">點擊表頭排序產品</span>
                                    </div>
                                    <table className="w-full text-xs text-left">
                                        <thead className="bg-gray-700 text-gray-300 uppercase">
                                            <tr>
                                                <th className="px-4 py-2 cursor-pointer hover:bg-gray-600" onClick={(e) => { e.stopPropagation(); handleProductSort('productName'); }}>
                                                    <div className="flex items-center">
                                                        產品名稱 (Product) <span className={`ml-1 ${productSortConfig.key === 'productName' ? 'text-blue-400' : 'text-gray-500'}`}>{getSortIcon(productSortConfig.key, 'productName', productSortConfig.direction)}</span>
                                                    </div>
                                                </th>
                                                <th className="px-4 py-2 text-right">上月費用</th>
                                                <th className="px-4 py-2 text-right cursor-pointer hover:bg-gray-600" onClick={(e) => { e.stopPropagation(); handleProductSort('currentCost'); }}>
                                                    <div className="flex items-center justify-end">
                                                        本月費用 <span className={`ml-1 ${productSortConfig.key === 'currentCost' ? 'text-blue-400' : 'text-gray-500'}`}>{getSortIcon(productSortConfig.key, 'currentCost', productSortConfig.direction)}</span>
                                                    </div>
                                                </th>
                                                <th className="px-4 py-2 text-right cursor-pointer hover:bg-gray-600" onClick={(e) => { e.stopPropagation(); handleProductSort('diff'); }}>
                                                    <div className="flex items-center justify-end">
                                                        變動值 (MoM) <span className={`ml-1 ${productSortConfig.key === 'diff' ? 'text-blue-400' : 'text-gray-500'}`}>{getSortIcon(productSortConfig.key, 'diff', productSortConfig.direction)}</span>
                                                    </div>
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {getAccountServiceDetails(account.accountId).map((s, idx) => {
                                                const productKey = `${account.accountId}-${s.productName}`;
                                                const isProdExpanded = expandedProductKey === productKey;
                                                return (
                                                    <React.Fragment key={idx}>
                                                        <tr 
                                                            className={`border-b border-gray-700 hover:bg-gray-700 cursor-pointer transition-colors ${isProdExpanded ? 'bg-gray-700' : ''}`}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setExpandedProductKey(isProdExpanded ? null : productKey);
                                                            }}
                                                        >
                                                            <td className="px-4 py-2 text-gray-200">
                                                                <span className={`inline-block w-4 transition-transform duration-200 ${isProdExpanded ? 'rotate-90' : ''}`}>▶</span>
                                                                <span className="ml-2">{s.productName}</span>
                                                            </td>
                                                            <td className="px-4 py-2 text-right text-gray-400">{formatNumber(s.prevCost)}</td>
                                                            <td className="px-4 py-2 text-right text-white font-medium">{formatNumber(s.currentCost)}</td>
                                                            <td className={`px-4 py-2 text-right font-semibold ${s.diff > 0 ? 'text-red-400' : s.diff < 0 ? 'text-green-400' : 'text-gray-500'}`}>
                                                                {s.diff > 0 ? '+' : ''}{formatNumber(s.diff)}
                                                            </td>
                                                        </tr>
                                                        {isProdExpanded && (
                                                            <tr className="bg-black/30">
                                                                <td colSpan={4} className="p-3">
                                                                    <div className="bg-gray-900/80 rounded p-2 border border-gray-700">
                                                                        <table className="w-full text-[11px]">
                                                                            <thead className="text-gray-500 border-b border-gray-800 font-bold uppercase tracking-wider">
                                                                                <tr>
                                                                                    <th className="pb-1 text-left cursor-pointer hover:text-blue-400" onClick={(e) => { e.stopPropagation(); handleUsageSort('description'); }}>
                                                                                       <div className="flex items-center">
                                                                                            Usage Type / Item Description <span className={`ml-1 ${usageSortConfig.key === 'description' ? 'text-blue-400' : 'text-gray-500'}`}>{getSortIcon(usageSortConfig.key, 'description', usageSortConfig.direction)}</span>
                                                                                       </div>
                                                                                    </th>
                                                                                    <th className="pb-1 text-right">上月總用量</th>
                                                                                    <th className="pb-1 text-right">本月總用量</th>
                                                                                    <th className="pb-1 text-right">用量變動</th>
                                                                                    <th className="pb-1 text-right cursor-pointer hover:text-blue-400" onClick={(e) => { e.stopPropagation(); handleUsageSort('currentCost'); }}>
                                                                                        <div className="flex items-center justify-end">
                                                                                            本月總費用 <span className={`ml-1 ${usageSortConfig.key === 'currentCost' ? 'text-blue-400' : 'text-gray-500'}`}>{getSortIcon(usageSortConfig.key, 'currentCost', usageSortConfig.direction)}</span>
                                                                                        </div>
                                                                                    </th>
                                                                                    <th className="pb-1 text-right cursor-pointer hover:text-blue-400" onClick={(e) => { e.stopPropagation(); handleUsageSort('costDiff'); }}>
                                                                                        <div className="flex items-center justify-end">
                                                                                            費用變動 <span className={`ml-1 ${usageSortConfig.key === 'costDiff' ? 'text-blue-400' : 'text-gray-500'}`}>{getSortIcon(usageSortConfig.key, 'costDiff', usageSortConfig.direction)}</span>
                                                                                        </div>
                                                                                    </th>
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody>
                                                                                {getServiceUsageDetails(account.accountId, s.productName).map((u, uIdx) => {
                                                                                    const usageDiff = u.currentUsage - u.prevUsage;
                                                                                    const costDiff = u.currentCost - u.prevCost;
                                                                                    return (
                                                                                        <tr key={uIdx} className="border-b border-gray-800/50 last:border-0 hover:bg-white/5">
                                                                                            <td className="py-2 pr-4">
                                                                                                <div className="text-gray-300 font-medium">{u.usageType}</div>
                                                                                                <div className="text-gray-500 italic text-[10px]">{u.itemDescription}</div>
                                                                                            </td>
                                                                                            <td className="py-2 text-right text-gray-400">{formatNumber(u.prevUsage, 4)}</td>
                                                                                            <td className="py-2 text-right text-gray-200">{formatNumber(u.currentUsage, 4)}</td>
                                                                                            <td className={`py-2 text-right ${usageDiff > 0 ? 'text-red-300' : usageDiff < 0 ? 'text-green-300' : 'text-gray-600'}`}>
                                                                                                {usageDiff > 0 ? '+' : ''}{formatNumber(usageDiff, 4)}
                                                                                            </td>
                                                                                            <td className="py-2 text-right text-blue-300 font-bold">{formatNumber(u.currentCost)}</td>
                                                                                            <td className={`py-2 text-right ${costDiff > 0 ? 'text-red-400' : costDiff < 0 ? 'text-green-400' : 'text-gray-600'}`}>
                                                                                                {costDiff > 0 ? '+' : ''}{formatNumber(costDiff)}
                                                                                            </td>
                                                                                        </tr>
                                                                                    );
                                                                                })}
                                                                            </tbody>
                                                                        </table>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </React.Fragment>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </td>
                        </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default DashboardTab;