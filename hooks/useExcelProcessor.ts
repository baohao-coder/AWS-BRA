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

  const processFiles = useCallback(async (files: FileList, options?: { anonymize?: boolean }) => {
    setIsLoading(true);
    setError(null);
    setBillingData([]);
    setProgress(0);

    const anonymize = options?.anonymize ?? false;
    const accountIdMap = new Map<string, string>();
    const accountNameMap = new Map<string, string>();
    const productNameMap = new Map<string, string>();
    const usageTypeMap = new Map<string, string>();
    const itemDescMap = new Map<string, string>();

    const MAX_FILE_SIZE_MB = 20;
    const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
    const ALLOWED_EXTENSIONS = ['.xlsx', '.xls'];

    // Enhance file security by validating before processing.
    for (const file of Array.from(files)) {
      // 1. Validate file size to prevent browser crashes with excessively large files.
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setError(`檔案 "${file.name}" 過大 (超過 ${MAX_FILE_SIZE_MB}MB)，為安全起見已拒絕處理。`);
        setIsLoading(false);
        return;
      }
      
      // 2. Validate file extension to ensure it's a supported Excel format.
      const fileExtension = `.${file.name.split('.').pop()?.toLowerCase()}`;
      if (!ALLOWED_EXTENSIONS.includes(fileExtension)) {
        setError(`檔案 "${file.name}" 的類型不支援。僅接受 .xlsx 和 .xls 檔案。`);
        setIsLoading(false);
        return;
      }
    }

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

            const originalNameMatch = accountInfoRaw.match(/Account ID\s*:\s*(.*?)\s*\(/);
            const originalIdMatch = accountInfoRaw.match(/\((\d+)\)/);
            const originalAccountName = originalNameMatch ? originalNameMatch[1].trim() : `Unknown Account ${j}`;
            const originalAccountId = originalIdMatch ? originalIdMatch[1] : `Unknown_ID_${j}`;
            
            let accountId = originalAccountId;
            let accountName = originalAccountName;

            if (anonymize) {
              if (!accountIdMap.has(originalAccountId)) {
                accountIdMap.set(originalAccountId, `ACCOUNT-${accountIdMap.size + 1}`);
              }
              accountId = accountIdMap.get(originalAccountId)!;

              if (!accountNameMap.has(originalAccountName)) {
                accountNameMap.set(originalAccountName, `Account Name ${accountNameMap.size + 1}`);
              }
              accountName = accountNameMap.get(originalAccountName)!;
            }

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

                    let serviceName = row[0] as string;
                    if (serviceName?.toLowerCase().includes('taxes')) {
                        currentService = null;
                        continue;
                    }
                    
                    if (anonymize && serviceName) {
                      if (!productNameMap.has(serviceName)) {
                        productNameMap.set(serviceName, `Product-${productNameMap.size + 1}`);
                      }
                      serviceName = productNameMap.get(serviceName)!;
                    }

                    currentService = {
                        productName: serviceName,
                        totalCost: parseNumber(row[4]),
                        details: [],
                    };
                } else if (currentService && row[0] !== 'UsageType' && !String(row[0]).toLowerCase().includes('taxes') && !String(row[1]).toLowerCase().includes('taxes')) {
                    let usageType = String(row[0] || '');
                    let itemDescription = String(row[1] || '');

                    if (anonymize) {
                      if (usageType && !usageTypeMap.has(usageType)) {
                          usageTypeMap.set(usageType, `UsageType-${usageTypeMap.size + 1}`);
                      }
                      usageType = usageType ? usageTypeMap.get(usageType)! : '';

                      if (itemDescription && !itemDescMap.has(itemDescription)) {
                          itemDescMap.set(itemDescription, `Item-Desc-${itemDescMap.size + 1}`);
                      }
                      itemDescription = itemDescription ? itemDescMap.get(itemDescription)! : '';
                    }

                    const detail: ServiceDetail = {
                        productName: currentService.productName,
                        usageType,
                        itemDescription,
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
      // The error is intentionally not logged to the console to prevent any potential
      // leakage of sensitive information from the file contents during a parsing failure.
      // The user is notified of the error through the UI.
      setError("處理檔案時發生錯誤。請確認檔案格式是否正確。");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearData = useCallback(() => {
    setBillingData([]);
    setError(null);
    setProgress(0);
  }, []);

  return { billingData, isLoading, progress, error, processFiles, clearData };
};
