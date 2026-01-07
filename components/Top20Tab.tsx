import React, { useMemo, useState, useEffect } from 'react';
import { BillingData, PerAccountChange, Service, ServiceDetail } from '../types';
import { exportToExcel } from '../services/excelUtils';
import Card from './common/Card';

interface Top20TabProps {
  data: BillingData;
}

interface ProductCostChange {
  productName: string;
  currentCost: number;
  previousCost: number;
  change: number;
}

interface UsageDetailChange {
  usageType: string;
  itemDescription: string;
  
  previousTotalCost: number;
  currentTotalCost: number;
  totalCostMom: number;

  previousUsages: number;
  currentUsages: number;
  usagesMom: number;
}


interface TableColumn {
    month: string;
    showMom: boolean;
}

const formatNumber = (value: number, decimals: number = 2) => {
    if (typeof value !== 'number' || isNaN(value)) return '0.00';
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
};


const Top20Tab: React.FC<Top20TabProps> = ({ data }) => {
  
  const sortedData = useMemo(() => [...data].sort((a, b) => a.month.localeCompare(b.month)), [data]);
  const months = useMemo(() => sortedData.map(d => d.month), [sortedData]);
  
  const [selectedMonth, setSelectedMonth] = useState<string>(months[months.length - 1] || '');
  const [sortCriteria, setSortCriteria] = useState<'total' | 'mom' | 'mom_percent'>('total');
  const [exportHierarchy, setExportHierarchy] = useState<'usage' | 'product' | 'account'>('usage');
  const [expandedAccountId, setExpandedAccountId] = useState<string | null>(null);
  const [expandedProductKey, setExpandedProductKey] = useState<string | null>(null);

  const isFirstMonth = useMemo(() => months.indexOf(selectedMonth) === 0, [months, selectedMonth]);

  useEffect(() => {
    if (isFirstMonth && (sortCriteria === 'mom' || sortCriteria === 'mom_percent')) {
      setSortCriteria('total');
    }
  }, [isFirstMonth, sortCriteria]);


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

  const top20AllTimeData = useMemo(() => {
    return perAccountChangesData
      .map(account => ({
        ...account,
        totalSpend: Object.values(account.monthlyTotals).reduce((sum: number, total: number | undefined) => sum + (total || 0), 0)
      }))
      .sort((a, b) => b.totalSpend - a.totalSpend)
      .slice(0, 20);
  }, [perAccountChangesData]);

  const top20ByMonthData = useMemo(() => {
    if (!selectedMonth) return [];

    const currentMonthIndex = months.indexOf(selectedMonth);
    const prevMonth = currentMonthIndex > 0 ? months[currentMonthIndex - 1] : null;

    let sortedAccounts: (PerAccountChange & { momAbs?: number; momPercentAbs?: number })[] = [...perAccountChangesData];

    if (sortCriteria === 'mom' && prevMonth) {
        sortedAccounts = sortedAccounts.map(account => {
            const currentTotal = account.monthlyTotals[selectedMonth] ?? 0;
            const prevTotal = account.monthlyTotals[prevMonth as string] ?? 0;
            const momAbs = Math.abs(currentTotal - prevTotal);
            return { ...account, momAbs };
        }).sort((a, b) => (b.momAbs ?? 0) - (a.momAbs ?? 0));
    } else if (sortCriteria === 'mom_percent' && prevMonth) {
        sortedAccounts = sortedAccounts.map(account => {
            const currentTotal = account.monthlyTotals[selectedMonth] ?? 0;
            const prevTotal = account.monthlyTotals[prevMonth as string] ?? 0;
            const momPercent = prevTotal !== 0 ? ((currentTotal - prevTotal) / prevTotal) * 100 : 0;
            const momPercentAbs = Math.abs(momPercent);
            return { ...account, momPercentAbs };
        }).sort((a, b) => (b.momPercentAbs ?? 0) - (a.momPercentAbs ?? 0));
    } else { // sort by total or if it's the first month
        sortedAccounts.sort((a, b) => (b.monthlyTotals[selectedMonth] || 0) - (a.monthlyTotals[selectedMonth] || 0));
    }

    return sortedAccounts.slice(0, 20);
  }, [perAccountChangesData, selectedMonth, months, sortCriteria]);

  const productChangesByAccount = useMemo(() => {
    if (!selectedMonth || !expandedAccountId) return new Map<string, ProductCostChange[]>();

    const productChanges = new Map<string, ProductCostChange[]>();
    const currentMonthIndex = months.indexOf(selectedMonth);
    if (currentMonthIndex < 0) return productChanges;

    const prevMonth = currentMonthIndex > 0 ? months[currentMonthIndex - 1] : null;

    const currentMonthData = sortedData.find(d => d.month === selectedMonth);
    const prevMonthData = prevMonth ? sortedData.find(d => d.month === prevMonth) : null;

    if (!currentMonthData) return productChanges;

    const account = top20ByMonthData.find(acc => acc.accountId === expandedAccountId);
    if (!account) return productChanges;
    
    const changes: ProductCostChange[] = [];
    const currentAccountServices = currentMonthData.accounts.find(a => a.accountId === account.accountId)?.services || [];
    const prevAccountServices = prevMonthData?.accounts.find(a => a.accountId === account.accountId)?.services || [];
    const prevServicesMap: Map<string, number> = new Map(prevAccountServices.map(s => [s.productName, s.totalCost]));

    currentAccountServices.forEach(currentService => {
        const previousCost = prevServicesMap.get(currentService.productName) || 0;
        changes.push({
            productName: currentService.productName,
            currentCost: Number(currentService.totalCost),
            previousCost: previousCost,
            change: Number(currentService.totalCost) - previousCost,
        });
        prevServicesMap.delete(currentService.productName);
    });

    for (const [name, cost] of prevServicesMap.entries()) {
        changes.push({ productName: name, currentCost: 0, previousCost: cost, change: -cost });
    }

    changes.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
    productChanges.set(account.accountId, changes);
    
    return productChanges;
  }, [selectedMonth, months, sortedData, top20ByMonthData, expandedAccountId]);

  const usageDetailChanges = useMemo(() => {
    if (!expandedProductKey) return new Map<string, UsageDetailChange[]>();

    const [accountId, ...productNameParts] = expandedProductKey.split('-');
    const productName = productNameParts.join('-');

    const currentMonthIndex = months.indexOf(selectedMonth);
    if (currentMonthIndex < 0) return new Map();

    const prevMonth = currentMonthIndex > 0 ? months[currentMonthIndex - 1] : null;
    
    const currentMonthData = sortedData.find(d => d.month === selectedMonth);
    const prevMonthData = prevMonth ? sortedData.find(d => d.month === prevMonth) : null;

    const currentService = currentMonthData?.accounts.find(a => a.accountId === accountId)?.services.find(s => s.productName === productName);
    const prevService = prevMonthData?.accounts.find(a => a.accountId === accountId)?.services.find(s => s.productName === productName);

    const currentDetails = currentService?.details || [];
    const prevDetails = prevService?.details || [];

    // 聚合本月明細
    const currentAggregated = new Map<string, { usages: number; totalCost: number; usageType: string; itemDescription: string }>();
    currentDetails.forEach(d => {
        const key = `${d.usageType}#${d.itemDescription}`;
        const existing = currentAggregated.get(key) || { usages: 0, totalCost: 0, usageType: d.usageType, itemDescription: d.itemDescription };
        currentAggregated.set(key, {
            ...existing,
            usages: existing.usages + d.usages,
            totalCost: existing.totalCost + d.totalCost
        });
    });

    // 聚合上月明細
    const prevAggregated = new Map<string, { usages: number; totalCost: number; usageType: string; itemDescription: string }>();
    prevDetails.forEach(d => {
        const key = `${d.usageType}#${d.itemDescription}`;
        const existing = prevAggregated.get(key) || { usages: 0, totalCost: 0, usageType: d.usageType, itemDescription: d.itemDescription };
        prevAggregated.set(key, {
            ...existing,
            usages: existing.usages + d.usages,
            totalCost: existing.totalCost + d.totalCost
        });
    });

    const relevantKeys = new Set<string>();
    currentAggregated.forEach((_, key) => relevantKeys.add(key));
    prevAggregated.forEach((_, key) => relevantKeys.add(key));
    
    const changes: UsageDetailChange[] = [];

    for (const key of relevantKeys) {
        const currentData = currentAggregated.get(key) || { usages: 0, totalCost: 0, usageType: '', itemDescription: '' };
        const prevData = prevAggregated.get(key) || { usages: 0, totalCost: 0, usageType: '', itemDescription: '' };
        
        const usageType = currentData.usageType || prevData.usageType;
        const itemDescription = currentData.itemDescription || prevData.itemDescription;

        const previousTotalCost = prevData.totalCost;
        const currentTotalCost = currentData.totalCost;
        const totalCostMom = currentTotalCost - previousTotalCost;

        const previousUsages = prevData.usages;
        const currentUsages = currentData.usages;
        const usagesMom = currentUsages - previousUsages;
        
        changes.push({
            usageType,
            itemDescription,
            previousTotalCost,
            currentTotalCost,
            totalCostMom,
            previousUsages,
            currentUsages,
            usagesMom,
        });
    }

    changes.sort((a, b) => Math.abs(b.totalCostMom) - Math.abs(a.totalCostMom));

    const resultMap = new Map<string, UsageDetailChange[]>();
    resultMap.set(expandedProductKey, changes);
    return resultMap;
  }, [expandedProductKey, selectedMonth, months, sortedData]);


  const createExportDataForAllTime = (accounts: (PerAccountChange & { totalSpend?: number })[]) => {
    return accounts.map(account => {
        const row: any = {
            'Account ID': account.accountId,
            'Account Name': account.accountName,
            '累計總金額 (USD)': (account.totalSpend ?? 0).toFixed(2),
        };
        months.forEach((month, index) => {
            const total = account.monthlyTotals[month] ?? 0;
            row[`${month} Total (USD)`] = total.toFixed(2);

            if (index > 0) {
                const prevMonth = months[index - 1];
                const prevTotal = account.monthlyTotals[prevMonth] ?? 0;
                const mom = total - prevTotal;
                const momPercent = prevTotal !== 0 ? (mom / prevTotal) * 100 : 0;
                row[`${month} MoM (USD)`] = mom.toFixed(2);
                row[`${month} MoM (%)`] = momPercent.toFixed(2);
            }
        });
        return row;
    });
  };

  const handleExportAllTime = () => {
    const exportData = createExportDataForAllTime(top20AllTimeData);
    exportToExcel(exportData, 'top20_all_time_spend');
  };

  const handleExportByMonth = () => {
    const exportData: any[] = [];
    const selectedMonthIndex = months.indexOf(selectedMonth);
    if (selectedMonthIndex < 0) return;
    
    const prevMonth = selectedMonthIndex > 0 ? months[selectedMonthIndex - 1] : null;
    const currentMonthData = sortedData.find(d => d.month === selectedMonth);
    const prevMonthData = prevMonth ? sortedData.find(d => d.month === prevMonth) : null;

    if (!currentMonthData) {
        alert("找不到當前月份的數據。");
        return;
    }
    
    const prevMonthHeader = prevMonth || 'Previous Month';
    const currentMonthHeader = selectedMonth;

    top20ByMonthData.forEach(account => {
        // --- Account Level ---
        const prevTotal = prevMonth ? (account.monthlyTotals[prevMonth] ?? 0) : 0;
        const currentTotal = account.monthlyTotals[selectedMonth] ?? 0;
        const mom = currentTotal - prevTotal;

        exportData.push({
            'Hierarchy': 'Account',
            'Name': `${account.accountName} (${account.accountId})`,
            'Description': '',
            [`${prevMonthHeader} Cost (USD)`]: prevTotal.toFixed(2),
            [`${currentMonthHeader} Cost (USD)`]: currentTotal.toFixed(2),
            'MoM Cost (USD)': mom.toFixed(2),
        });

        if (exportHierarchy === 'account') return;

        // --- Product Level ---
        const currentServices = currentMonthData.accounts.find(a => a.accountId === account.accountId)?.services || [];
        const prevServices = prevMonthData?.accounts.find(a => a.accountId === account.accountId)?.services || [];
        const prevServicesMap = new Map<string, Service>(prevServices.map(s => [s.productName, s]));
        const allProductNames = new Set([...currentServices.map(s => s.productName), ...prevServices.map(s => s.productName)]);

        Array.from(allProductNames).sort().forEach(productName => {
            const currentService = currentServices.find(s => s.productName === productName);
            const prevService = prevServicesMap.get(productName);
            const currentCost = currentService?.totalCost || 0;
            const prevCost = prevService?.totalCost || 0;
            const costMom = currentCost - prevCost;

            if (costMom === 0) return; // Skip products with no change

            exportData.push({
                'Hierarchy': '  Product',
                'Name': productName,
                'Description': 'Cost Change',
                [`${prevMonthHeader} Cost (USD)`]: prevCost.toFixed(2),
                [`${currentMonthHeader} Cost (USD)`]: currentCost.toFixed(2),
                'MoM Cost (USD)': costMom.toFixed(2),
            });

            if (exportHierarchy === 'product') return;

            // --- Usage Level (含聚合邏輯) ---
            const currentDetails = currentService?.details || [];
            const prevDetails = prevService?.details || [];

            const currentAggregated = new Map<string, any>();
            currentDetails.forEach(d => {
                const key = `${d.usageType}#${d.itemDescription}`;
                const existing = currentAggregated.get(key) || { usages: 0, cost: 0, usageType: d.usageType, itemDesc: d.itemDescription };
                currentAggregated.set(key, { ...existing, usages: existing.usages + d.usages, cost: existing.cost + d.totalCost });
            });

            const prevAggregated = new Map<string, any>();
            prevDetails.forEach(d => {
                const key = `${d.usageType}#${d.itemDescription}`;
                const existing = prevAggregated.get(key) || { usages: 0, cost: 0, usageType: d.usageType, itemDesc: d.itemDescription };
                prevAggregated.set(key, { ...existing, usages: existing.usages + d.usages, cost: existing.cost + d.totalCost });
            });

            const allDetailKeys = new Set([...currentAggregated.keys(), ...prevAggregated.keys()]);

            allDetailKeys.forEach(key => {
                const cur = currentAggregated.get(key);
                const pre = prevAggregated.get(key);
                
                const uType = cur?.usageType || pre?.usageType || '';
                const iDesc = cur?.itemDesc || pre?.itemDesc || '';
                const pCost = pre?.cost || 0;
                const cCost = cur?.cost || 0;
                const pUsage = pre?.usages || 0;
                const cUsage = cur?.usages || 0;

                const totalCostMom = cCost - pCost;
                const usagesMom = cUsage - pUsage;

                if (totalCostMom !== 0 || usagesMom !== 0) {
                    exportData.push({
                        'Hierarchy': '    Usage',
                        'Name': uType,
                        'Description': iDesc,
                        [`${prevMonthHeader} Usages`]: pUsage,
                        [`${currentMonthHeader} Usages`]: cUsage,
                        'MoM Usages': usagesMom,
                        [`${prevMonthHeader} Cost (USD)`]: pCost.toFixed(2),
                        [`${currentMonthHeader} Cost (USD)`]: cCost.toFixed(2),
                        'MoM Cost (USD)': totalCostMom.toFixed(2),
                    });
                }
            });
        });
    });
    
    if (exportData.length > 0) {
      exportToExcel(exportData, `top20_spend_details_${selectedMonth}_vs_${prevMonth || 'start'}`);
    } else {
      alert("沒有可匯出的差異數據。");
    }
  };


  const handleToggleExpand = (accountId: string) => {
    const newId = expandedAccountId === accountId ? null : accountId;
    setExpandedAccountId(newId);
    if (newId !== expandedAccountId) {
        setExpandedProductKey(null);
    }
  };

  const handleToggleProductExpand = (accountId: string, productName: string) => {
    const key = `${accountId}-${productName}`;
    setExpandedProductKey(prevKey => (prevKey === key ? null : key));
  };
  
  const AccountChangeTable: React.FC<{
    accounts: (PerAccountChange & { totalSpend?: number })[];
    isExpandable: boolean;
    displayMode: 'all' | 'focused';
    showCumulativeTotal: boolean;
  }> = ({ accounts, isExpandable, displayMode, showCumulativeTotal }) => {

    const tableColumns = useMemo((): TableColumn[] => {
      // 'all' mode will always show all months, 'focused' shows only relevant months for detail views
      if (displayMode === 'focused') {
        const selectedMonthIndex = months.indexOf(selectedMonth);
        if (selectedMonthIndex === -1) return [];
        const cols: TableColumn[] = [];
        
        if (selectedMonthIndex > 0) {
          cols.push({ month: months[selectedMonthIndex - 1], showMom: false });
        }
        cols.push({ month: selectedMonth, showMom: selectedMonthIndex > 0 });
        return cols;
      }
      return months.map((month, index) => ({
          month,
          showMom: index > 0,
      }));
    }, [displayMode, selectedMonth, months]);

    const renderAccountTableRow = (account: PerAccountChange & { totalSpend?: number }) => {
      const isExpanded = expandedAccountId === account.accountId;
      const currentMonthIndex = months.indexOf(selectedMonth);
      const prevMonth = currentMonthIndex > 0 ? months[currentMonthIndex - 1] : null;

      let colSpan = 2; // Account ID, Account Name
      if (showCumulativeTotal) {
          colSpan += 1;
      }
      tableColumns.forEach(col => {
          colSpan += 1; // Monthly total
          if (col.showMom) colSpan += 2; // MoM $, MoM %
      });
      

      return (
          <React.Fragment key={account.accountId}>
              <tr 
                className={`bg-gray-800 border-b border-gray-700 ${isExpandable ? 'cursor-pointer hover:bg-gray-700' : ''}`} 
                onClick={isExpandable ? () => handleToggleExpand(account.accountId) : undefined}
              >
                <td className="px-4 py-4 font-medium text-white whitespace-nowrap">
                  {isExpandable && (
                    <span className={`inline-block w-4 transition-transform duration-200 ${isExpanded ? 'transform rotate-90' : ''}`}>
                      ▶
                    </span>
                  )}
                  <span className={isExpandable ? 'ml-2' : ''}>{account.accountId}</span>
                </td>
                <td className="px-4 py-4 text-gray-300">{account.accountName}</td>
                {showCumulativeTotal && (
                  <td className="px-4 py-4 text-right font-bold text-white">
                    {formatNumber(account.totalSpend ?? 0)}
                  </td>
                )}
                {tableColumns.map(({ month, showMom }) => {
                  const total = account.monthlyTotals[month] ?? 0;
                  let mom, momPercent, momColor;
                  if (showMom) {
                    const monthIndex = months.indexOf(month);
                    const prevMonth = months[monthIndex - 1];
                    const prevTotal = account.monthlyTotals[prevMonth] ?? 0;
                    mom = total - prevTotal;
                    momPercent = prevTotal !== 0 ? (mom / prevTotal) * 100 : 0;
                    momColor = mom > 0 ? 'text-red-400' : mom < 0 ? 'text-green-400' : 'text-gray-400';
                  }
                  return (
                    <React.Fragment key={month}>
                      <td className="px-4 py-4 text-right">{formatNumber(total)}</td>
                      {showMom && <td className={`px-4 py-4 text-right ${momColor}`}>{mom !== undefined ? formatNumber(mom) : '-'}</td>}
                      {showMom && <td className={`px-4 py-4 text-right ${momColor}`}>{momPercent !== undefined ? formatNumber(momPercent, 2) : '-'}</td>}
                    </React.Fragment>
                  );
                })}
              </tr>
              {isExpandable && isExpanded && (
                  <tr className="bg-gray-800">
                      <td colSpan={colSpan} className="p-4 bg-gray-900">
                        <div className="flex justify-between items-center mb-2">
                           <h4 className="text-lg font-semibold text-white">產品費用明細與變化 ({selectedMonth})</h4>
                        </div>
                          <div className="overflow-x-auto max-h-96">
                              <table className="w-full text-sm">
                                  <thead className="text-xs text-gray-300 uppercase bg-gray-700 sticky top-0">
                                      <tr>
                                          <th className="px-4 py-2 text-left">Product Name</th>
                                          <th className="px-4 py-2 text-right">{prevMonth ? `${prevMonth} (USD)` : '上月費用 (USD)'}</th>
                                          <th className="px-4 py-2 text-right">{`${selectedMonth} (USD)`}</th>
                                          <th className="px-4 py-2 text-right">MOM(USD)</th>
                                      </tr>
                                  </thead>
                                  <tbody className="text-gray-400">
                                      {(productChangesByAccount.get(account.accountId) || []).map(p => {
                                        const productKey = `${account.accountId}-${p.productName}`;
                                        const isProductExpanded = expandedProductKey === productKey;
                                        const details = usageDetailChanges.get(productKey) || [];
                                        
                                        return (
                                          <React.Fragment key={p.productName}>
                                            <tr className="border-b border-gray-700 cursor-pointer hover:bg-gray-800" onClick={() => handleToggleProductExpand(account.accountId, p.productName)}>
                                                <td className="px-4 py-2 text-left text-white">
                                                    <span className={`inline-block w-4 transition-transform duration-200 ${isProductExpanded ? 'transform rotate-90' : ''}`}>
                                                        ▶
                                                    </span>
                                                    <span className="ml-2">{p.productName}</span>
                                                </td>
                                                <td className="px-4 py-2 text-right">{formatNumber(p.previousCost)}</td>
                                                <td className="px-4 py-2 text-right">{formatNumber(p.currentCost)}</td>
                                                <td className={`px-4 py-2 text-right ${p.change > 0 ? 'text-red-400' : p.change < 0 ? 'text-green-400' : ''}`}>
                                                    {formatNumber(p.change)}
                                                </td>
                                            </tr>
                                            {isProductExpanded && (
                                                <tr className="bg-gray-900">
                                                    <td colSpan={4} className="p-4 bg-gray-950">
                                                        <div className="flex justify-between items-center mb-2">
                                                            <h5 className="text-md font-semibold text-white">使用類型明細比較 (已按說明加總)</h5>
                                                        </div>
                                                        <div className="overflow-x-auto max-h-60">
                                                            <table className="w-full text-sm">
                                                                <thead className="text-xs text-gray-300 uppercase bg-gray-700 sticky top-0">
                                                                    <tr>
                                                                        <th rowSpan={2} className="px-2 py-2 text-left align-bottom border-b border-gray-700">Usage Type</th>
                                                                        <th rowSpan={2} className="px-2 py-2 text-left align-bottom border-b border-gray-700">Item Description</th>
                                                                        <th colSpan={3} className="px-2 py-1 text-center border-b border-gray-700">Usages</th>
                                                                        <th colSpan={3} className="px-2 py-1 text-center border-b border-gray-700">Total Cost (USD)</th>
                                                                    </tr>
                                                                    <tr>
                                                                        <th className="px-2 py-1 text-right font-normal">{prevMonth ? `${prevMonth}` : '上月'}</th>
                                                                        <th className="px-2 py-1 text-right font-normal">{selectedMonth}</th>
                                                                        <th className="px-2 py-1 text-right font-normal">MOM</th>
                                                                        <th className="px-2 py-1 text-right font-normal">{prevMonth ? `${prevMonth}` : '上月'}</th>
                                                                        <th className="px-2 py-1 text-right font-normal">{selectedMonth}</th>
                                                                        <th className="px-2 py-1 text-right font-normal">MOM</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {details.map((d, i) => (
                                                                        <tr key={i} className="border-b border-gray-700">
                                                                            <td className="px-2 py-1 text-left">{d.usageType}</td>
                                                                            <td className="px-2 py-1 text-left">{d.itemDescription}</td>
                                                                            {/* Usages */}
                                                                            <td className="px-2 py-1 text-right">{formatNumber(d.previousUsages, 0)}</td>
                                                                            <td className="px-2 py-1 text-right">{formatNumber(d.currentUsages, 0)}</td>
                                                                            <td className={`px-2 py-1 text-right ${d.usagesMom > 0 ? 'text-red-400' : d.usagesMom < 0 ? 'text-green-400' : ''}`}>{formatNumber(d.usagesMom, 0)}</td>
                                                                            {/* Total Cost */}
                                                                            <td className="px-2 py-1 text-right">{formatNumber(d.previousTotalCost)}</td>
                                                                            <td className="px-2 py-1 text-right text-white">{formatNumber(d.currentTotalCost)}</td>
                                                                            <td className={`px-2 py-1 text-right ${d.totalCostMom > 0 ? 'text-red-400' : d.totalCostMom < 0 ? 'text-green-400' : ''}`}>{formatNumber(d.totalCostMom)}</td>
                                                                        </tr>
                                                                    ))}
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
    };

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-gray-400">
          <thead className="text-xs text-gray-300 uppercase bg-gray-700 sticky top-0">
            <tr>
              <th scope="col" className="px-4 py-3">Account ID</th>
              <th scope="col" className="px-4 py-3">Account Name</th>
              {showCumulativeTotal && <th scope="col" className="px-4 py-3 text-right">累計總金額 (USD)</th>}
              {tableColumns.map(({ month, showMom }) => (
                <React.Fragment key={month}>
                  <th scope="col" className="px-4 py-3 text-right">{month} (USD)</th>
                  {showMom && <th scope="col" className="px-4 py-3 text-right">MoM (USD)</th>}
                  {showMom && <th scope="col" className="px-4 py-3 text-right">MoM (%)</th>}
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {accounts.map(account => renderAccountTableRow(account))}
          </tbody>
        </table>
      </div>
    );
  };


  return (
    <div className="space-y-8">
      <Card title="Top 20 帳號 (依所有月份累計總額排序)" actionButton={<button onClick={handleExportAllTime} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded text-sm transition-colors">匯出 Excel</button>}>
        <AccountChangeTable accounts={top20AllTimeData} isExpandable={false} displayMode="all" showCumulativeTotal={true} />
      </Card>
      
      <Card 
        title="Top 20 帳號 (依月份排序)" 
        actionButton={
          top20ByMonthData.length > 0 && (
            <div className="flex items-center space-x-2">
                <select
                    value={exportHierarchy}
                    onChange={(e) => setExportHierarchy(e.target.value as any)}
                    className="bg-gray-700 border border-gray-600 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2.5"
                >
                    <option value="usage">匯出完整明細</option>
                    <option value="product">匯出至產品層級</option>
                    <option value="account">僅匯出帳號層級</option>
                </select>
                <button onClick={handleExportByMonth} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded text-sm transition-colors">匯出 Excel</button>
            </div>
          )
        }
      >
        <div className="p-4 bg-gray-800 flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center space-x-2">
                <label htmlFor="month-select" className="font-semibold text-gray-300">選擇月份:</label>
                <select
                    id="month-select"
                    value={selectedMonth}
                    onChange={(e) => {
                      setSelectedMonth(e.target.value);
                      setExpandedAccountId(null);
                      setExpandedProductKey(null);
                    }}
                    className="bg-gray-700 border border-gray-600 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2.5"
                >
                    {months.map(month => (
                        <option key={month} value={month}>{month}</option>
                    ))}
                </select>
            </div>
            <div className="flex items-center space-x-4 flex-wrap">
                <span className="font-semibold text-gray-300">排序依據:</span>
                <div className="flex items-center">
                    <input id="sort-total" type="radio" value="total" name="sort-criteria" checked={sortCriteria === 'total'} onChange={() => setSortCriteria('total')} className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 focus:ring-blue-600"/>
                    <label htmlFor="sort-total" className="ml-2 text-sm font-medium text-gray-300">當月總金額</label>
                </div>
                <div className="flex items-center">
                    <input id="sort-mom" type="radio" value="mom" name="sort-criteria" disabled={isFirstMonth} checked={sortCriteria === 'mom'} onChange={() => setSortCriteria('mom')} className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 disabled:opacity-50"/>
                    <label htmlFor="sort-mom" className={`ml-2 text-sm font-medium transition-colors ${isFirstMonth ? 'text-gray-500 cursor-not-allowed' : 'text-gray-300'}`}>費用變化絕對值 (USD)</label>
                </div>
                <div className="flex items-center">
                    <input id="sort-mom-percent" type="radio" value="mom_percent" name="sort-criteria" disabled={isFirstMonth} checked={sortCriteria === 'mom_percent'} onChange={() => setSortCriteria('mom_percent')} className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 disabled:opacity-50"/>
                    <label htmlFor="sort-mom-percent" className={`ml-2 text-sm font-medium transition-colors ${isFirstMonth ? 'text-gray-500 cursor-not-allowed' : 'text-gray-300'}`}>費用變化百分比絕對值 (%)</label>
                </div>
            </div>
        </div>
        <p className="px-6 pb-2 text-gray-400 text-sm">點擊任一帳號列以展開產品明細，再點擊產品列以展開用量明細 (相同項目已彙總)。</p>
        <AccountChangeTable accounts={top20ByMonthData} isExpandable={true} displayMode="all" showCumulativeTotal={false} />
      </Card>
    </div>
  );
};

export default Top20Tab;