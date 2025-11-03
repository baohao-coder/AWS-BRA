import { useState, useCallback } from 'react';
import { BillingData, MonthlyBillingData, AccountData, Service, ServiceDetail } from '../types';

declare const XLSX: any; // Assuming XLSX is loaded from a script tag

const parseNumber = (value: any): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const num = parseFloat(value.replace(/,/g, ''));
    return isNaN(num) ? 0 : num;
  }
  return 0;
};

export const useExcelProcessor = () => {
  const [billingData, setBillingData] = useState<BillingData>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const processFiles = useCallback(async (files: FileList) => {
    setIsLoading(true);
    setError(null);
    setBillingData([]);
    setProgress(0);

    const allMonthlyData: MonthlyBillingData[] = [];
    const totalFiles = files.length;

    try {
      for (let i = 0; i < totalFiles; i++) {
        const file = files[i];
        const fileProgressStart = (i / totalFiles) * 100;
        const fileProgressEnd = ((i + 1) / totalFiles) * 100;
        setProgress(fileProgressStart);

        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'buffer' });

        const monthMatch = file.name.match(/(\d{6}|\d{4}-\d{2})/);
        const monthStr = monthMatch ? monthMatch[0].replace('-', '') : `File_${i + 1}`;
        const month = `${monthStr.slice(0, 4)}-${monthStr.slice(4, 6)}`;

        const monthlyAccounts: AccountData[] = [];
        let monthlyTotal = 0;

        const totalSheets = workbook.SheetNames.length;
        for (let j = 0; j < totalSheets; j++) {
            const sheetName = workbook.SheetNames[j];
            const worksheet = workbook.Sheets[sheetName];
            const json: (string | number | null)[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });

            const accountInfoRaw = json[0]?.[0] as string | null;
            if (!accountInfoRaw) continue;

            const nameMatch = accountInfoRaw.match(/Account ID\s*:\s*(.*?)\s*\(/);
            const idMatch = accountInfoRaw.match(/\((\d+)\)/);
            const accountName = nameMatch ? nameMatch[1].trim() : 'Unknown';
            const accountId = idMatch ? idMatch[1] : 'Unknown';

            const totalAmount = parseNumber(json[5]?.[4]);
            const currency = json[7]?.[4] as string || 'USD';

            const services: Service[] = [];
            let currentService: Service | null = null;

            for (let rowIdx = 9; rowIdx < json.length; rowIdx++) {
                const row = json[rowIdx];
                if (!row.some(cell => cell !== null)) continue;
                
                const isMergedAtoD = (worksheet['!merges'] || []).some(
                    (merge: any) => merge.s.r === rowIdx && merge.s.c === 0 && merge.e.c >= 3
                );
                
                if (isMergedAtoD) {
                    if (currentService) services.push(currentService);

                    const serviceName = row[0] as string;
                    if (serviceName?.toLowerCase().includes('taxes')) {
                        currentService = null;
                        continue;
                    }

                    currentService = {
                        productName: serviceName,
                        totalCost: parseNumber(row[4]),
                        details: [],
                    };
                } else if (currentService && row[0] !== 'UsageType' && !String(row[0]).toLowerCase().includes('taxes') && !String(row[1]).toLowerCase().includes('taxes')) {
                    const detail: ServiceDetail = {
                        productName: currentService.productName,
                        usageType: String(row[0] || ''),
                        itemDescription: String(row[1] || ''),
                        unitPrice: parseNumber(row[2]),
                        usages: parseNumber(row[3]),
                        totalCost: parseNumber(row[4]),
                        accountId,
                        accountName,
                        month,
                    };
                    currentService.details.push(detail);
                }
            }
            if (currentService) services.push(currentService);

            const accountData: AccountData = {
                accountId,
                accountName,
                totalAmount,
                currency,
                services,
            };
            monthlyAccounts.push(accountData);
            monthlyTotal += totalAmount;

            const currentFileProgress = (j / totalSheets) * (fileProgressEnd - fileProgressStart);
            setProgress(fileProgressStart + currentFileProgress);
        }

        allMonthlyData.push({ month, accounts: monthlyAccounts, totalAmount: monthlyTotal });
      }

      setBillingData(allMonthlyData);
      setProgress(100);
    } catch (e) {
      console.error("Error processing Excel files:", e);
      setError("處理檔案時發生錯誤。請確認檔案格式是否正確。");
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { billingData, isLoading, progress, error, processFiles };
};