import { useState, useCallback } from 'react';
import { RiSpAnalysisResult, RiSpMonthData } from '../types';

declare const XLSX: any;

const parseNumber = (value: any): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const num = parseFloat(value.replace(/,/g, '').replace(/%/g, ''));
    return isNaN(num) ? 0 : num;
  }
  return 0;
};

export const useRiSpProcessor = () => {
  const [result, setResult] = useState<RiSpAnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const processFiles = useCallback(async (files: FileList) => {
    setIsLoading(true);
    setError(null);
    setResult(null);
    setProgress(0);

    const monthlyMap = new Map<string, { originalPriceTotal: number; riSpTotal: number }>();

    try {
      const totalFiles = files.length;
      for (let i = 0; i < totalFiles; i++) {
        const file = files[i];
        setProgress((i / totalFiles) * 100);

        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });

        // Find all matching sheets
        const targetSheetNames = workbook.SheetNames.filter(name => {
          const trimmed = name.trim();
          return trimmed === "中華電信" || 
                 trimmed === "中華電信(網創)" || 
                 trimmed === "中華電信（網創）";
        });

        if (targetSheetNames.length === 0) {
          continue;
        }

        for (const sheetName of targetSheetNames) {
          const worksheet = workbook.Sheets[sheetName];
          // Use header: 1 to get raw data as array of arrays
          // raw: false to get formatted strings for dates if needed
          const rawData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });

          if (rawData.length < 2) continue;

          // Find header row index
          let headerIdx = -1;
          for (let r = 0; r < Math.min(rawData.length, 20); r++) {
            const row = rawData[r];
            if (!row) continue;
            const rowStr = row.map(c => String(c || "")).join("|");
            if (rowStr.includes("計費期間") || rowStr.includes("Billing Period") || 
                rowStr.includes("帳號") || rowStr.includes("Account ID")) {
              headerIdx = r;
              break;
            }
          }

          if (headerIdx === -1) continue;

          const headers = rawData[headerIdx].map(h => String(h || "").trim());
          const colMap: { [key: string]: number } = {};
          headers.forEach((h, idx) => {
            if (h) colMap[h] = idx;
          });

          const getVal = (row: any[], keyPart: string) => {
            const key = Object.keys(colMap).find(k => k.includes(keyPart));
            if (key) return row[colMap[key]];
            return undefined;
          };

          // Process data rows
          for (let r = headerIdx + 1; r < rawData.length; r++) {
            const row = rawData[r];
            if (!row || row.length === 0) continue;

            let billingPeriod = String(getVal(row, "計費期間") || getVal(row, "Billing Period") || "").trim();
            const accountId = String(getVal(row, "帳號") || getVal(row, "Account ID") || "").trim();
            const discountRaw = getVal(row, "折扣") || getVal(row, "Discount");
            const originalPriceRaw = getVal(row, "原幣總計") || getVal(row, "Original Price");
            const itemDescription = String(getVal(row, "產品服務") || getVal(row, "項目") || getVal(row, "Product Service") || getVal(row, "Item") || "").trim();
            const itemDescriptionLower = itemDescription.toLowerCase();
            
            const originalPrice = parseNumber(originalPriceRaw);

            // Filter rules: 
            // 1. Must have billing period
            // 2. Exclude specific master account 927845210633
            // 3. Include if it has a valid account ID OR if it's a Support/Marketplace item
            const isSupportOrMarketplace = 
              itemDescriptionLower.includes("enterprise support plan") || 
              itemDescriptionLower.includes("marketplace") || 
              itemDescriptionLower.includes("support plan");

            if (!billingPeriod) continue;
            if (accountId === "927845210633") continue;
            
            // For Support/Marketplace items, we include them even if account ID is N/A or empty
            // For other items, we require a valid account ID
            if (!isSupportOrMarketplace && (!accountId || accountId === "N/A" || accountId === "")) {
              continue;
            }

            // Normalize billing period (e.g., "2024/01/01" or "2024-01 Support" -> "XX月流量費")
            const dateMatch = billingPeriod.match(/(\d{4})[/-](\d{1,2})/);
            if (dateMatch) {
              const month = parseInt(dateMatch[2], 10);
              billingPeriod = `${month}月流量費`;
            } else {
              // Fallback: try to extract month if it's just a number or has month name
              const monthMatch = billingPeriod.match(/(\d{1,2})/);
              if (monthMatch) {
                billingPeriod = `${parseInt(monthMatch[1], 10)}月流量費`;
              } else {
                billingPeriod = "未知月份流量費";
              }
            }

            if (!monthlyMap.has(billingPeriod)) {
              monthlyMap.set(billingPeriod, { originalPriceTotal: 0, riSpTotal: 0 });
            }

            const stats = monthlyMap.get(billingPeriod)!;
            
            // Requirement 2: Sum Original Price directly
            stats.originalPriceTotal += originalPrice;

            // Requirement 3: RI/SP total (Discount == 85.60%)
            const discountValue = parseNumber(discountRaw);
            const isRiSp = Math.abs(discountValue - 85.6) < 0.001 || Math.abs(discountValue - 0.856) < 0.00001;

            if (isRiSp) {
              stats.riSpTotal += originalPrice;
            }
          }
        }
      }

      const monthlyData: RiSpMonthData[] = Array.from(monthlyMap.entries())
        .map(([month, stats]) => ({
          month,
          originalPriceTotal: stats.originalPriceTotal,
          riSpTotal: stats.riSpTotal,
          ratio: stats.originalPriceTotal > 0 ? (stats.riSpTotal / stats.originalPriceTotal) * 100 : 0
        }))
        .sort((a, b) => {
          const getMonthNum = (s: string) => {
            const m = s.match(/(\d+)/);
            return m ? parseInt(m[1], 10) : 0;
          };
          return getMonthNum(a.month) - getMonthNum(b.month);
        });

      const grandTotalOriginalPrice = monthlyData.reduce((sum, d) => sum + d.originalPriceTotal, 0);
      const grandTotalRiSp = monthlyData.reduce((sum, d) => sum + d.riSpTotal, 0);
      const overallRatio = grandTotalOriginalPrice > 0 ? (grandTotalRiSp / grandTotalOriginalPrice) * 100 : 0;

      setResult({
        monthlyData,
        grandTotalOriginalPrice,
        grandTotalRiSp,
        overallRatio
      });
      setProgress(100);
    } catch (e) {
      console.error(e);
      setError("處理檔案時發生錯誤。請確認檔案格式是否正確。");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearData = useCallback(() => {
    setResult(null);
    setError(null);
    setProgress(0);
  }, []);

  return { result, isLoading, progress, error, processFiles, clearData };
};
