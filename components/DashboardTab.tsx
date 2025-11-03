import React, { useMemo } from 'react';
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

const DashboardTab: React.FC<DashboardTabProps> = ({ data }) => {
  
  const sortedData = useMemo(() => [...data].sort((a, b) => a.month.localeCompare(b.month)), [data]);
  const months = useMemo(() => sortedData.map(d => d.month), [sortedData]);

  const monthlyTotalData = useMemo(() => {
    return sortedData.map(monthData => ({
      month: monthData.month,
      'Total Amount of Payment (USD)': monthData.totalAmount,
    }));
  }, [sortedData]);
  
  const totalCumulativeAmount = useMemo(() => {
    return sortedData.reduce((sum, monthData) => sum + monthData.totalAmount, 0);
  }, [sortedData]);

  const accountChanges = useMemo(() => {
    if (sortedData.length < 1) return [];

    const changes = [];
    
    for (let i = 1; i < sortedData.length; i++) {
      const prevMonthData = sortedData[i - 1];
      const currentMonthData = sortedData[i];
      const prevAccounts = new Set(prevMonthData.accounts.map(acc => acc.accountId));
      const currentAccounts = new Set(currentMonthData.accounts.map(acc => acc.accountId));

      const newAccounts = [...currentAccounts].filter(id => !prevAccounts.has(id)).map(id => {
        const account = currentMonthData.accounts.find(acc => acc.accountId === id);
        return { id, name: account?.accountName || 'N/A' };
      });

      const removedAccounts = [...prevAccounts].filter(id => !currentAccounts.has(id)).map(id => {
        const account = prevMonthData.accounts.find(acc => acc.accountId === id);
        return { id, name: account?.accountName || 'N/A' };
      });
      
      changes.push({
        month: currentMonthData.month,
        prevCount: prevAccounts.size,
        currentCount: currentAccounts.size,
        newAccounts,
        removedAccounts
      });
    }

    return changes;
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

  const handleExport = () => {
      const exportData = perAccountChangesData.map(account => {
        const row: any = {
          'Account ID': account.accountId,
          'Account Name': account.accountName,
        };

        months.forEach((month, index) => {
          const total = account.monthlyTotals[month] ?? 0;
          row[`${month} (USD)`] = total.toFixed(2);

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

      if (exportData.length > 0) {
        exportToExcel(exportData, `account_cost_changes`);
      } else {
        alert("沒有可匯出的資料。");
      }
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
            <LineChart data={monthlyTotalData} margin={{ top: 5, right: 30, left: 50, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#4a5568" />
              <XAxis dataKey="month" stroke="#a0aec0" />
              <YAxis stroke="#a0aec0" tickFormatter={(value) => Number(value).toLocaleString()} />
              <Tooltip
                contentStyle={{ backgroundColor: '#2d3748', border: 'none', borderRadius: '0.5rem' }}
                labelStyle={{ color: '#e2e8f0' }}
                formatter={(value:number) => [formatNumber(value), 'Total Amount of Payment']}
              />
              <Legend wrapperStyle={{color: '#a0aec0'}} />
              <Line type="monotone" dataKey="Total Amount of Payment (USD)" stroke="#4299e1" strokeWidth={2} activeDot={{ r: 8 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
      
      <Card title="每月帳號數量變化">
        <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-400">
                <thead className="text-xs text-gray-300 uppercase bg-gray-700">
                    <tr>
                        <th scope="col" className="px-6 py-3">月份</th>
                        <th scope="col" className="px-6 py-3 text-right">帳號總數</th>
                        <th scope="col" className="px-6 py-3 text-right">數量變化</th>
                        <th scope="col" className="px-6 py-3">新增帳號</th>
                        <th scope="col" className="px-6 py-3">移除帳號</th>
                    </tr>
                </thead>
                <tbody>
                    {sortedData.length > 0 && (
                      <tr className="bg-gray-800 border-b border-gray-700">
                        <td className="px-6 py-4">{sortedData[0].month} (基準)</td>
                        <td className="px-6 py-4 text-right">{sortedData[0].accounts.length}</td>
                        <td className="px-6 py-4 text-right">-</td>
                        <td className="px-6 py-4">-</td>
                        <td className="px-6 py-4">-</td>
                      </tr>
                    )}
                    {accountChanges.map(change => (
                        <tr key={change.month} className="bg-gray-800 border-b border-gray-700">
                            <td className="px-6 py-4 font-medium text-white">{change.month}</td>
                            <td className="px-6 py-4 text-right">{change.currentCount}</td>
                            <td className={`px-6 py-4 text-right font-semibold ${change.currentCount > change.prevCount ? 'text-green-400' : change.currentCount < change.prevCount ? 'text-red-400' : ''}`}>
                                {change.currentCount - change.prevCount > 0 ? '+' : ''}{change.currentCount - change.prevCount}
                            </td>
                            <td className="px-6 py-4">{change.newAccounts.length > 0 ? change.newAccounts.map(a => `${a.name} (${a.id})`).join(', ') : '無'}</td>
                            <td className="px-6 py-4">{change.removedAccounts.length > 0 ? change.removedAccounts.map(a => `${a.name} (${a.id})`).join(', ') : '無'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
      </Card>

      <Card title="每個帳號的金額變化" actionButton={perAccountChangesData.length > 0 && <button onClick={handleExport} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded text-sm transition-colors">匯出 Excel</button>}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-400">
            <thead className="text-xs text-gray-300 uppercase bg-gray-700 sticky top-0">
              <tr>
                <th scope="col" className="px-4 py-3">Account ID</th>
                <th scope="col" className="px-4 py-3">Account Name</th>
                {months.map((month, index) => (
                  <React.Fragment key={month}>
                    <th scope="col" className="px-4 py-3 text-right">{month} (USD)</th>
                    {index > 0 && <th scope="col" className="px-4 py-3 text-right">MoM (USD)</th>}
                    {index > 0 && <th scope="col" className="px-4 py-3 text-right">MoM (%)</th>}
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {perAccountChangesData.map(account => {
                return (
                  <tr 
                      key={account.accountId}
                      className={`bg-gray-800 border-b border-gray-700`}
                  >
                      <td className="px-4 py-4 font-medium text-white whitespace-nowrap">
                          {account.accountId}
                      </td>
                      <td className="px-4 py-4 text-gray-300">{account.accountName}</td>
                      {months.map((month, index) => {
                        const total = account.monthlyTotals[month] ?? 0;
                        let mom, momPercent, momColor;
                        if (index > 0) {
                          const prevMonth = months[index - 1];
                          const prevTotal = account.monthlyTotals[prevMonth] ?? 0;
                          mom = total - prevTotal;
                          momPercent = prevTotal !== 0 ? (mom / prevTotal) * 100 : 0;
                          momColor = mom > 0 ? 'text-red-400' : mom < 0 ? 'text-green-400' : 'text-gray-400';
                        }
                        return (
                          <React.Fragment key={month}>
                            <td className="px-4 py-4 text-right">{formatNumber(total)}</td>
                            {index > 0 && <td className={`px-4 py-4 text-right ${momColor}`}>{mom !== undefined ? formatNumber(mom) : '-'}</td>}
                            {index > 0 && <td className={`px-4 py-4 text-right ${momColor}`}>{momPercent !== undefined ? formatNumber(momPercent, 2) : '-'}</td>}
                          </React.Fragment>
                        );
                      })}
                    </tr>
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
