
import React, { useMemo, useState } from 'react';
import { BillingData, ServiceDetail } from '../types';
import { exportToExcel } from '../services/excelUtils';
import Card from './common/Card';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, 
  PieChart, Pie, Legend 
} from 'recharts';

interface ServiceAnalysisTabProps {
  data: BillingData;
}

interface ProductAccountSummary {
  accountId: string;
  accountName: string;
  cost: number;
}

interface ProductDetailSummary {
  usageType: string;
  itemDescription: string;
  usage: number;
  cost: number;
}

interface ProductSummary {
  productName: string;
  totalCost: number;
  accounts: Map<string, ProductAccountSummary>;
  details: Map<string, ProductDetailSummary>;
}

interface ServiceBreakdownItem {
  productName: string;
  cost: number;
  percentage: number;
}

interface RgtSubCategory {
  id: string;
  name: string;
  description: string;
  cost: number;
  percentage: number;
  services: ServiceBreakdownItem[];
}

interface RgtCategory {
  key: 'R' | 'G' | 'T';
  name: string;
  alias: string;
  description: string;
  cost: number;
  percentage: number;
  subCategories?: RgtSubCategory[];
  services?: ServiceBreakdownItem[];
}

interface AccountOption {
  accountId: string;
  accountName: string;
  totalCost: number;
}

const formatNumber = (value: number, decimals: number = 2) => {
  if (typeof value !== 'number' || isNaN(value)) return '0.00';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
};

// --- RGT Classification Helpers ---

const isAiProduct = (prodName: string, usageType: string = '', desc: string = '') => {
  const text = `${prodName} ${usageType} ${desc}`.toLowerCase();
  const compact = text.replace(/[\s\-_]+/g, '');
  const aiKeywords = [
    'amazonq', 'bedrock', 'kiro', 'sagemaker', 'textract', 'rekognition',
    'comprehend', 'transcribe', 'translate', 'polly', 'lex', 'kendra',
    'codewhisperer', 'genai', 'generativeai', 'qbusiness', 'qdeveloper',
    'deepracer', 'forecast', 'personalize', 'frauddetector'
  ];
  return aiKeywords.some(kw => compact.includes(kw));
};

const isResilienceProduct = (prodName: string, usageType: string = '', desc: string = '') => {
  const text = `${prodName} ${usageType} ${desc}`.toLowerCase();
  const resilienceKeywords = [
    'aws backup', 'elastic disaster recovery', 'route 53', 'route53', 
    'cloudfront', 'global accelerator', 'elastic load balancing', 'loadbalancing',
    'transit gateway', 'site-to-site vpn', 'direct connect', 'multiaz', 'multi-az',
    'elastic disaster', 'drs', 'autoscaling'
  ];
  return resilienceKeywords.some(kw => text.includes(kw));
};

const isModernizationProduct = (prodName: string, usageType: string = '', desc: string = '') => {
  const text = `${prodName} ${usageType} ${desc}`.toLowerCase();
  const modKeywords = [
    'elastic container service', 'ecs', 'elastic kubernetes service', 'eks',
    'aws lambda', 'lambda', 'fargate', 'app runner', 'step functions', 'states',
    'eventbridge', 'simple queue service', 'sqs', 'simple notification service',
    'sns', 'api gateway', 'aurora serverless', 'dynamodb'
  ];
  const isGraviton = usageType.toLowerCase().includes('g.') || text.includes('graviton');
  return modKeywords.some(kw => text.includes(kw)) || isGraviton;
};

const isSecurityProduct = (prodName: string, usageType: string = '', desc: string = '') => {
  const text = `${prodName} ${usageType} ${desc}`.toLowerCase();
  const secKeywords = [
    'waf', 'shield', 'guardduty', 'security hub', 'securityhub', 'key management service',
    'kms', 'amazon inspector', 'inspector', 'macie', 'detective', 'cloudtrail',
    'aws config', 'secrets manager', 'secretsmanager', 'audit manager',
    'network firewall', 'verified access', 'identity and access management', 'iam'
  ];
  return secKeywords.some(kw => text.includes(kw));
};

type ProductSortKey = 'name' | 'totalCost';
type SortDirection = 'asc' | 'desc';
type AnalysisMode = 'monthly' | 'cumulative';

const ServiceAnalysisTab: React.FC<ServiceAnalysisTabProps> = ({ data }) => {
  const sortedData = useMemo(() => [...data].sort((a, b) => a.month.localeCompare(b.month)), [data]);
  const months = useMemo(() => sortedData.map(d => d.month), [sortedData]);
  
  // Extract all unique accounts across the dataset
  const allAccounts = useMemo<AccountOption[]>(() => {
    const accMap = new Map<string, { accountId: string; accountName: string; totalCost: number }>();
    sortedData.forEach(m => {
      m.accounts.forEach(a => {
        if (!accMap.has(a.accountId)) {
          accMap.set(a.accountId, { accountId: a.accountId, accountName: a.accountName, totalCost: 0 });
        }
        accMap.get(a.accountId)!.totalCost += a.totalCost;
      });
    });
    return Array.from(accMap.values()).sort((a, b) => b.totalCost - a.totalCost);
  }, [sortedData]);

  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>('monthly');
  const [selectedMonth, setSelectedMonth] = useState<string>(months[months.length - 1] || '');
  const [expandedProductName, setExpandedProductName] = useState<string | null>(null);
  const [expandedRgtKey, setExpandedRgtKey] = useState<string | null>(null);
  
  // Account filtering states
  const [isCustomAccountMode, setIsCustomAccountMode] = useState<boolean>(false);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [accountSearchQuery, setAccountSearchQuery] = useState<string>('');
  const [showAccountSelector, setShowAccountSelector] = useState<boolean>(false);

  const [sortConfig, setSortConfig] = useState<{ key: ProductSortKey; direction: SortDirection }>({
    key: 'totalCost',
    direction: 'desc'
  });

  // Filtered accounts list based on search in modal
  const filteredAccountsList = useMemo(() => {
    if (!accountSearchQuery.trim()) return allAccounts;
    const q = accountSearchQuery.toLowerCase().trim();
    return allAccounts.filter(a => 
      a.accountName.toLowerCase().includes(q) || 
      a.accountId.toLowerCase().includes(q)
    );
  }, [allAccounts, accountSearchQuery]);

  // Account selection handlers
  const handleSelectAllAccounts = () => {
    setIsCustomAccountMode(false);
    setSelectedAccountIds([]);
    setExpandedProductName(null);
    setExpandedRgtKey(null);
  };

  const handleSelectSingleAccountFromDropdown = (accId: string) => {
    if (accId === '__ALL__') {
      handleSelectAllAccounts();
    } else {
      setIsCustomAccountMode(true);
      setSelectedAccountIds([accId]);
      setExpandedProductName(null);
      setExpandedRgtKey(null);
    }
  };

  const handleToggleAccount = (accId: string) => {
    setExpandedProductName(null);
    setExpandedRgtKey(null);
    if (!isCustomAccountMode) {
      // Switching from 'all' to custom with all accounts except the toggled one (or just the selected one if user intention is to deselect)
      setIsCustomAccountMode(true);
      const remaining = allAccounts.map(a => a.accountId).filter(id => id !== accId);
      setSelectedAccountIds(remaining);
    } else {
      setSelectedAccountIds(prev => {
        if (prev.includes(accId)) {
          return prev.filter(id => id !== accId);
        } else {
          return [...prev, accId];
        }
      });
    }
  };

  const handleSelectOnlyAccount = (accId: string) => {
    setIsCustomAccountMode(true);
    setSelectedAccountIds([accId]);
    setExpandedProductName(null);
    setExpandedRgtKey(null);
  };

  const handleSelectMultipleAll = () => {
    setIsCustomAccountMode(true);
    setSelectedAccountIds(allAccounts.map(a => a.accountId));
    setExpandedProductName(null);
    setExpandedRgtKey(null);
  };

  const handleClearAllCustomAccounts = () => {
    setIsCustomAccountMode(true);
    setSelectedAccountIds([]);
    setExpandedProductName(null);
    setExpandedRgtKey(null);
  };

  const handleInvertAccounts = () => {
    setIsCustomAccountMode(true);
    const currentSet = new Set(selectedAccountIds);
    const inverted = allAccounts.map(a => a.accountId).filter(id => !currentSet.has(id));
    setSelectedAccountIds(inverted);
    setExpandedProductName(null);
    setExpandedRgtKey(null);
  };

  // Base Data Filtered by Account Dimension
  const filteredData = useMemo(() => {
    if (!isCustomAccountMode) {
      return sortedData;
    }
    if (selectedAccountIds.length === 0) {
      return sortedData.map(m => ({
        ...m,
        accounts: [],
        totalCost: 0
      }));
    }
    const accountSet = new Set(selectedAccountIds);
    return sortedData.map(m => {
      const filteredAccounts = m.accounts.filter(acc => accountSet.has(acc.accountId));
      const totalCost = filteredAccounts.reduce((sum, a) => sum + a.totalCost, 0);
      return {
        ...m,
        accounts: filteredAccounts,
        totalCost
      };
    });
  }, [sortedData, isCustomAccountMode, selectedAccountIds]);

  // Current selected account label for UI and exports
  const accountFilterSummaryText = useMemo(() => {
    if (!isCustomAccountMode) {
      return `全部帳號 (共 ${allAccounts.length} 個)`;
    }
    if (selectedAccountIds.length === 0) {
      return '未選擇任何帳號';
    }
    if (selectedAccountIds.length === 1) {
      const acc = allAccounts.find(a => a.accountId === selectedAccountIds[0]);
      return acc ? `${acc.accountName} (${acc.accountId})` : selectedAccountIds[0];
    }
    return `自選 ${selectedAccountIds.length} / ${allAccounts.length} 個帳號`;
  }, [isCustomAccountMode, selectedAccountIds, allAccounts]);

  // --- RGT (公雲使用花費分佈) Calculation ---
  const rgtAnalysis = useMemo(() => {
    const dataToProcess = analysisMode === 'monthly'
      ? filteredData.filter(d => d.month === selectedMonth)
      : filteredData;

    if (dataToProcess.length === 0) {
      return {
        categories: [] as RgtCategory[],
        totalCost: 0,
        tBreakdown: [] as { name: string; cost: number; percentage: number }[],
        pieData: [] as { name: string; value: number; color: string }[]
      };
    }

    const currentMonthIndex = filteredData.findIndex(d => d.month === selectedMonth);
    const prevMonthData = (analysisMode === 'monthly' && currentMonthIndex > 0)
      ? filteredData[currentMonthIndex - 1]
      : null;

    // Previous month product costs for calculating Growth (G)
    const prevProductCosts = new Map<string, number>();
    if (prevMonthData) {
      prevMonthData.accounts.forEach(acc => {
        acc.services.forEach(srv => {
          const current = prevProductCosts.get(srv.productName) || 0;
          prevProductCosts.set(srv.productName, current + srv.totalCost);
        });
      });
    }

    // Accumulators for T sub-categories
    const aiServices = new Map<string, number>();
    const resilienceServices = new Map<string, number>();
    const modernizationServices = new Map<string, number>();
    const securityServices = new Map<string, number>();
    const otherTransformServices = new Map<string, number>();

    // Accumulators for Core (Non-T) services
    const nonTServices = new Map<string, number>();
    let totalSpend = 0;

    dataToProcess.forEach(m => {
      m.accounts.forEach(acc => {
        acc.services.forEach(srv => {
          totalSpend += srv.totalCost;

          // Categorize each service or its details
          srv.details.forEach(det => {
            const cost = det.totalCost;
            if (cost === 0) return;

            const pName = det.productName || srv.productName;
            const uType = det.usageType || '';
            const desc = det.itemDescription || '';

            if (isAiProduct(pName, uType, desc)) {
              aiServices.set(pName, (aiServices.get(pName) || 0) + cost);
            } else if (isSecurityProduct(pName, uType, desc)) {
              securityServices.set(pName, (securityServices.get(pName) || 0) + cost);
            } else if (isResilienceProduct(pName, uType, desc)) {
              resilienceServices.set(pName, (resilienceServices.get(pName) || 0) + cost);
            } else if (isModernizationProduct(pName, uType, desc)) {
              modernizationServices.set(pName, (modernizationServices.get(pName) || 0) + cost);
            } else {
              nonTServices.set(pName, (nonTServices.get(pName) || 0) + cost);
            }
          });
        });
      });
    });

    const sumMap = (m: Map<string, number>) => Array.from(m.values()).reduce((sum, v) => sum + v, 0);
    const mapToBreakdown = (m: Map<string, number>, totalCatCost: number): ServiceBreakdownItem[] => {
      return Array.from(m.entries())
        .map(([productName, cost]) => ({
          productName,
          cost,
          percentage: totalCatCost > 0 ? (cost / totalCatCost) * 100 : 0
        }))
        .sort((a, b) => b.cost - a.cost);
    };

    const aiCost = sumMap(aiServices);
    const resilienceCost = sumMap(resilienceServices);
    const modernCost = sumMap(modernizationServices);
    const securityCost = sumMap(securityServices);
    const otherTransformCost = sumMap(otherTransformServices);
    const transformTotalCost = aiCost + resilienceCost + modernCost + securityCost + otherTransformCost;

    const nonTTotalCost = sumMap(nonTServices);

    // Calculate Growth (G) and Run (R)
    let growCost = 0;
    const growServicesMap = new Map<string, number>();
    const runServicesMap = new Map<string, number>();

    if (analysisMode === 'monthly') {
      if (prevMonthData) {
        nonTServices.forEach((cost, prodName) => {
          const prevCost = prevProductCosts.get(prodName) || 0;
          const deltaGrowth = Math.max(0, cost - prevCost);
          if (deltaGrowth > 0) {
            growServicesMap.set(prodName, deltaGrowth);
            growCost += deltaGrowth;
          }
          const baseRun = Math.max(0, cost - deltaGrowth);
          if (baseRun > 0) {
            runServicesMap.set(prodName, baseRun);
          }
        });
      } else {
        // First month without baseline: identify variable scalable traffic/data transfer as variable scale, rest as baseline
        nonTServices.forEach((cost, prodName) => {
          if (prodName.toLowerCase().includes('data transfer') || prodName.toLowerCase().includes('bandwidth')) {
            growServicesMap.set(prodName, cost);
            growCost += cost;
          } else {
            runServicesMap.set(prodName, cost);
          }
        });
      }
    } else {
      // Cumulative mode: baseline first month vs subsequent aggregate growth
      const firstMonth = filteredData[0];
      const firstMonthNonTCosts = new Map<string, number>();
      if (firstMonth) {
        firstMonth.accounts.forEach(acc => {
          acc.services.forEach(srv => {
            if (!isAiProduct(srv.productName) && !isSecurityProduct(srv.productName) && !isResilienceProduct(srv.productName) && !isModernizationProduct(srv.productName)) {
              firstMonthNonTCosts.set(srv.productName, (firstMonthNonTCosts.get(srv.productName) || 0) + srv.totalCost);
            }
          });
        });
      }
      const baselineTotal = sumMap(firstMonthNonTCosts);
      const totalNonTOverTime = nonTTotalCost;
      growCost = Math.max(0, totalNonTOverTime - (baselineTotal * filteredData.length > totalNonTOverTime ? baselineTotal : baselineTotal));
      
      nonTServices.forEach((cost, prodName) => {
        const baseCost = firstMonthNonTCosts.get(prodName) || 0;
        const totalBaseAlloc = Math.min(cost, baseCost * filteredData.length);
        const growthAlloc = Math.max(0, cost - totalBaseAlloc);
        if (growthAlloc > 0) growServicesMap.set(prodName, growthAlloc);
        if (totalBaseAlloc > 0) runServicesMap.set(prodName, totalBaseAlloc);
      });
    }

    // Ensure mathematical guarantee: R + G = nonTTotalCost
    growCost = Math.min(growCost, nonTTotalCost);
    const runCost = Math.max(0, nonTTotalCost - growCost);

    const safeTotal = totalSpend > 0 ? totalSpend : 1;

    const tSubCategories: RgtSubCategory[] = [
      {
        id: 'T_AI',
        name: 'AI 應用',
        description: 'Amazon Bedrock, Amazon Q, SageMaker, GenAI 服務等',
        cost: aiCost,
        percentage: (aiCost / safeTotal) * 100,
        services: mapToBreakdown(aiServices, aiCost)
      },
      {
        id: 'T_RESILIENCE',
        name: '韌性提升',
        description: 'AWS Backup, Route 53, CloudFront, Elastic Disaster Recovery, ELB 等',
        cost: resilienceCost,
        percentage: (resilienceCost / safeTotal) * 100,
        services: mapToBreakdown(resilienceServices, resilienceCost)
      },
      {
        id: 'T_MODERN',
        name: '現代化演進',
        description: 'EKS, ECS, Lambda, Fargate, Serverless, Graviton, DynamoDB 等',
        cost: modernCost,
        percentage: (modernCost / safeTotal) * 100,
        services: mapToBreakdown(modernizationServices, modernCost)
      },
      {
        id: 'T_SECURITY',
        name: '資安提升',
        description: 'GuardDuty, WAF, Security Hub, KMS, Inspector, Secrets Manager 等',
        cost: securityCost,
        percentage: (securityCost / safeTotal) * 100,
        services: mapToBreakdown(securityServices, securityCost)
      },
      {
        id: 'T_OTHER',
        name: '其他',
        description: '新興與創新領域轉型技術',
        cost: otherTransformCost,
        percentage: (otherTransformCost / safeTotal) * 100,
        services: mapToBreakdown(otherTransformServices, otherTransformCost)
      }
    ];

    const categories: RgtCategory[] = [
      {
        key: 'R',
        name: '既有(R)',
        alias: '(固本)',
        description: '已使用中系統或單位既有作業所需花費',
        cost: runCost,
        percentage: (runCost / safeTotal) * 100,
        services: mapToBreakdown(runServicesMap, runCost)
      },
      {
        key: 'G',
        name: '成長(G)',
        alias: '',
        description: '因應業務增長',
        cost: growCost,
        percentage: (growCost / safeTotal) * 100,
        services: mapToBreakdown(growServicesMap, growCost)
      },
      {
        key: 'T',
        name: '創新/新興與轉型(T)',
        alias: '',
        description: '涵蓋 AI 應用、韌性提升、現代化演進、資安提升等戰略轉型投資',
        cost: transformTotalCost,
        percentage: (transformTotalCost / safeTotal) * 100,
        subCategories: tSubCategories
      }
    ];

    const pieData = [
      { name: '既有(R) 固本', value: runCost, color: '#3b82f6' },
      { name: '成長(G) 業務', value: growCost, color: '#10b981' },
      { name: '創新/轉型(T)', value: transformTotalCost, color: '#8b5cf6' },
    ].filter(item => item.value > 0);

    const tBreakdown = tSubCategories
      .filter(sub => sub.cost > 0)
      .map(sub => ({
        name: sub.name,
        cost: sub.cost,
        percentage: sub.percentage
      }));

    return {
      categories,
      totalCost: totalSpend,
      tBreakdown,
      pieData
    };
  }, [analysisMode, selectedMonth, filteredData]);

  // --- Product Analysis Data ---
  const productAnalysis = useMemo(() => {
    const dataToProcess = analysisMode === 'monthly' 
      ? filteredData.filter(d => d.month === selectedMonth)
      : filteredData;

    if (dataToProcess.length === 0) return [];

    const productMap = new Map<string, ProductSummary>();

    dataToProcess.forEach(monthData => {
      monthData.accounts.forEach(account => {
        account.services.forEach(service => {
          if (!productMap.has(service.productName)) {
            productMap.set(service.productName, {
              productName: service.productName,
              totalCost: 0,
              accounts: new Map<string, ProductAccountSummary>(),
              details: new Map<string, ProductDetailSummary>()
            });
          }
          
          const p = productMap.get(service.productName)!;
          p.totalCost += service.totalCost;

          if (!p.accounts.has(account.accountId)) {
            p.accounts.set(account.accountId, { accountId: account.accountId, accountName: account.accountName, cost: 0 });
          }
          p.accounts.get(account.accountId)!.cost += service.totalCost;

          service.details.forEach(detail => {
            const detailKey = `${detail.usageType}|||${detail.itemDescription}`;
            if (!p.details.has(detailKey)) {
              p.details.set(detailKey, { 
                usageType: detail.usageType, 
                itemDescription: detail.itemDescription, 
                usage: 0, 
                cost: 0 
              });
            }
            const d = p.details.get(detailKey)!;
            d.usage += detail.usages;
            d.cost += detail.totalCost;
          });
        });
      });
    });

    return Array.from(productMap.values()).sort((a, b) => {
        let valA: any, valB: any;
        if (sortConfig.key === 'name') {
            valA = a.productName; valB = b.productName;
        } else {
            valA = a.totalCost; valB = b.totalCost;
        }
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });
  }, [analysisMode, selectedMonth, filteredData, sortConfig]);

  const top10ChartData = useMemo(() => {
    return [...productAnalysis]
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, 10)
      .map(p => ({
        name: p.productName,
        cost: p.totalCost
      }));
  }, [productAnalysis]);

  const handleExportRgt = () => {
    const accountSuffix = isCustomAccountMode 
      ? `_accounts_${selectedAccountIds.length}` 
      : '_all_accounts';
    const filename = analysisMode === 'monthly'
      ? `public_cloud_spend_distribution_${selectedMonth}${accountSuffix}`
      : `public_cloud_spend_distribution_cumulative${accountSuffix}`;

    const rows: Record<string, string>[] = [];

    rgtAnalysis.categories.forEach(cat => {
      if (cat.subCategories && cat.subCategories.length > 0) {
        cat.subCategories.forEach((sub, subIdx) => {
          rows.push({
            '性質': subIdx === 0 ? `${cat.name} ${cat.alias}`.trim() : '',
            '說明': sub.name,
            '金額 ($USD)': sub.cost.toFixed(2),
            '佔比 (%)': `${sub.percentage.toFixed(2)}%`,
            '計費期間': analysisMode === 'monthly' ? selectedMonth : '全期間累計',
            '分析帳號維度': accountFilterSummaryText
          });
        });
      } else {
        rows.push({
          '性質': `${cat.name} ${cat.alias}`.trim(),
          '說明': cat.description,
          '金額 ($USD)': cat.cost.toFixed(2),
          '佔比 (%)': `${cat.percentage.toFixed(2)}%`,
          '計費期間': analysisMode === 'monthly' ? selectedMonth : '全期間累計',
          '分析帳號維度': accountFilterSummaryText
        });
      }
    });

    rows.push({
      '性質': '總計',
      '說明': '全雲端花費加總',
      '金額 ($USD)': rgtAnalysis.totalCost.toFixed(2),
      '佔比 (%)': '100.00%',
      '計費期間': analysisMode === 'monthly' ? selectedMonth : '全期間累計',
      '分析帳號維度': accountFilterSummaryText
    });

    exportToExcel(rows, filename);
  };

  const handleExport = () => {
    const accountSuffix = isCustomAccountMode 
      ? `_accounts_${selectedAccountIds.length}` 
      : '_all_accounts';
    const filename = analysisMode === 'monthly' 
      ? `service_analysis_${selectedMonth}${accountSuffix}` 
      : `service_analysis_cumulative_all_time${accountSuffix}`;

    const exportData = productAnalysis.map(p => ({
      'Product Name': p.productName,
      'Total Cost (USD)': p.totalCost.toFixed(2),
      'Analysis Period': analysisMode === 'monthly' ? selectedMonth : 'All-Time Cumulative',
      'Account Dimension': accountFilterSummaryText
    }));
    exportToExcel(exportData, filename);
  };

  const handleSort = (key: ProductSortKey) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const getSortIcon = (key: ProductSortKey) => {
    if (sortConfig.key !== key) return '↕';
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  };

  const COLORS = ['#4299e1', '#48bb78', '#ed8936', '#9f7aea', '#f56565', '#38b2ac', '#ecc94b', '#a0aec0', '#667eea', '#ed64a1'];
  const T_COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ec4899'];

  const toggleRgtDetails = (key: string) => {
    setExpandedRgtKey(prev => prev === key ? null : key);
  };

  return (
    <div className="space-y-8">
      {/* 頂部維度選擇與篩選看板 */}
      <div className="bg-gray-800 p-5 rounded-xl border border-gray-700 shadow-md space-y-4">
        {/* 第一行：時間維度與月份選擇 */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 pb-4 border-b border-gray-700/80">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-bold text-gray-300 whitespace-nowrap">時間維度:</span>
            <div className="inline-flex rounded-lg shadow-sm" role="group">
              <button
                type="button"
                onClick={() => {
                  setAnalysisMode('monthly');
                  setExpandedProductName(null);
                  setExpandedRgtKey(null);
                }}
                className={`px-4 py-2 text-sm font-medium border border-gray-600 rounded-l-lg transition-all ${
                  analysisMode === 'monthly' 
                    ? 'bg-blue-600 text-white border-blue-600 shadow' 
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
                }`}
              >
                單月分析 (Monthly)
              </button>
              <button
                type="button"
                onClick={() => {
                  setAnalysisMode('cumulative');
                  setExpandedProductName(null);
                  setExpandedRgtKey(null);
                }}
                className={`px-4 py-2 text-sm font-medium border border-gray-600 rounded-r-lg transition-all ${
                  analysisMode === 'cumulative' 
                    ? 'bg-blue-600 text-white border-blue-600 shadow' 
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
                }`}
              >
                全期間累計 (All-Time)
              </button>
            </div>

            {analysisMode === 'monthly' && (
              <div className="flex items-center space-x-2 pl-2">
                <label className="text-sm font-medium text-gray-300 whitespace-nowrap">選擇月份:</label>
                <select
                  value={selectedMonth}
                  onChange={(e) => {
                    setSelectedMonth(e.target.value);
                    setExpandedProductName(null);
                    setExpandedRgtKey(null);
                  }}
                  className="bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm cursor-pointer"
                >
                  {months.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* 帳號篩選統計狀態 badge */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">目前帳號範圍:</span>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium border ${
              !isCustomAccountMode 
                ? 'bg-blue-900/40 text-blue-300 border-blue-700/50' 
                : selectedAccountIds.length === 0
                ? 'bg-red-900/40 text-red-300 border-red-700/50'
                : 'bg-purple-900/40 text-purple-300 border-purple-700/50'
            }`}>
              {accountFilterSummaryText}
            </span>
          </div>
        </div>

        {/* 第二行：帳號維度控制列 */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <span className="text-sm font-bold text-gray-300 whitespace-nowrap">帳號維度:</span>
            
            {/* 快速下拉：全部帳號 或 單一帳號切換 */}
            <div className="flex items-center space-x-2">
              <select
                value={!isCustomAccountMode ? '__ALL__' : (selectedAccountIds.length === 1 ? selectedAccountIds[0] : '__MULTI__')}
                onChange={(e) => {
                  if (e.target.value === '__MULTI__') {
                    setShowAccountSelector(true);
                  } else {
                    handleSelectSingleAccountFromDropdown(e.target.value);
                  }
                }}
                className="bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm cursor-pointer max-w-xs truncate"
              >
                <option value="__ALL__">🌐 全部帳號 (預設，共 {allAccounts.length} 個)</option>
                {isCustomAccountMode && selectedAccountIds.length > 1 && (
                  <option value="__MULTI__">📑 已自選 {selectedAccountIds.length} 個帳號</option>
                )}
                <optgroup label="單一帳號切換">
                  {allAccounts.map(acc => (
                    <option key={acc.accountId} value={acc.accountId}>
                      {acc.accountName || acc.accountId} ({acc.accountId}) - ${formatNumber(acc.totalCost, 0)}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            {/* 快捷切換「全部帳號」按鈕 */}
            <button
              type="button"
              onClick={handleSelectAllAccounts}
              className={`px-3 py-2 text-xs font-medium rounded-lg border transition-all ${
                !isCustomAccountMode 
                  ? 'bg-blue-600 text-white border-blue-500 shadow' 
                  : 'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600 hover:text-white'
              }`}
            >
              全部帳號
            </button>

            {/* 自選多個帳號彈窗/面板開關按鈕 */}
            <button
              type="button"
              onClick={() => setShowAccountSelector(prev => !prev)}
              className={`px-3.5 py-2 text-xs font-medium rounded-lg border transition-all flex items-center gap-1.5 ${
                showAccountSelector || (isCustomAccountMode && selectedAccountIds.length > 1)
                  ? 'bg-purple-600 text-white border-purple-500 shadow'
                  : 'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600 hover:text-white'
              }`}
            >
              <span>自選多個帳號</span>
              <span className="bg-black/30 px-1.5 py-0.5 rounded text-[11px] font-mono">
                {isCustomAccountMode ? selectedAccountIds.length : allAccounts.length}/{allAccounts.length}
              </span>
              <span className="text-[10px]">{showAccountSelector ? '▲' : '▼'}</span>
            </button>
          </div>

          {/* 快速提示或清空選項 */}
          {isCustomAccountMode && (
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={handleSelectAllAccounts}
                className="text-blue-400 hover:text-blue-300 underline font-medium cursor-pointer"
              >
                重設為全部帳號
              </button>
            </div>
          )}
        </div>

        {/* 自選帳號面板 (Collapsible Multi-select Box) */}
        {showAccountSelector && (
          <div className="mt-3 p-4 bg-gray-900/90 rounded-xl border border-purple-500/40 shadow-inner space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-gray-700">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-purple-300">🎯 自選多個帳號分析維度</span>
                <span className="text-xs text-gray-400">
                  (已選取 <strong className="text-white font-mono">{selectedAccountIds.length}</strong> / {allAccounts.length} 個帳號)
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={handleSelectMultipleAll}
                  className="px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded border border-gray-600 transition"
                >
                  全選 ({allAccounts.length})
                </button>
                <button
                  type="button"
                  onClick={handleClearAllCustomAccounts}
                  className="px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded border border-gray-600 transition"
                >
                  清空
                </button>
                <button
                  type="button"
                  onClick={handleInvertAccounts}
                  className="px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded border border-gray-600 transition"
                >
                  反選
                </button>
                <button
                  type="button"
                  onClick={handleSelectAllAccounts}
                  className="px-2.5 py-1 bg-blue-600/80 hover:bg-blue-600 text-white rounded border border-blue-500 transition"
                >
                  切換全部帳號模式
                </button>
                <button
                  type="button"
                  onClick={() => setShowAccountSelector(false)}
                  className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded border border-gray-700 transition"
                >
                  收合 ✕
                </button>
              </div>
            </div>

            {/* 搜尋帳號輸入框 */}
            <div className="relative">
              <input
                type="text"
                placeholder="搜尋帳號名稱或 12 位帳號 ID..."
                value={accountSearchQuery}
                onChange={(e) => setAccountSearchQuery(e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
              />
              {accountSearchQuery && (
                <button
                  onClick={() => setAccountSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* 帳號清單格點 (Account Items Grid) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-64 overflow-y-auto pr-1">
              {filteredAccountsList.map(acc => {
                const isSelected = isCustomAccountMode 
                  ? selectedAccountIds.includes(acc.accountId) 
                  : true;
                
                return (
                  <div
                    key={acc.accountId}
                    className={`p-2.5 rounded-lg border text-xs flex items-center justify-between gap-2 transition-all ${
                      isSelected 
                        ? 'bg-purple-950/40 border-purple-600/60 text-white shadow-sm' 
                        : 'bg-gray-800/60 border-gray-700 text-gray-400 hover:border-gray-600'
                    }`}
                  >
                    <label className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleAccount(acc.accountId)}
                        className="w-4 h-4 rounded text-purple-600 bg-gray-700 border-gray-600 focus:ring-purple-500 cursor-pointer"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-gray-200 truncate" title={acc.accountName || acc.accountId}>
                          {acc.accountName || '未命名帳號'}
                        </div>
                        <div className="text-[11px] text-gray-400 font-mono flex items-center justify-between">
                          <span>{acc.accountId}</span>
                          <span className="text-gray-300 font-medium">${formatNumber(acc.totalCost, 0)}</span>
                        </div>
                      </div>
                    </label>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectOnlyAccount(acc.accountId);
                      }}
                      className="text-[10px] px-1.5 py-0.5 bg-gray-700 hover:bg-purple-700 text-gray-300 hover:text-white rounded border border-gray-600 transition whitespace-nowrap"
                      title="只選擇這個帳號"
                    >
                      僅此帳號
                    </button>
                  </div>
                );
              })}
              {filteredAccountsList.length === 0 && (
                <div className="col-span-full py-4 text-center text-gray-400 text-xs">
                  找不到符合「{accountSearchQuery}」的帳號
                </div>
              )}
            </div>
          </div>
        )}

        {/* 若為自選模式且有選取帳號，顯示快速標籤列表 */}
        {isCustomAccountMode && selectedAccountIds.length > 0 && !showAccountSelector && (
          <div className="pt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-gray-400">已選帳號:</span>
            {selectedAccountIds.slice(0, 8).map(id => {
              const acc = allAccounts.find(a => a.accountId === id);
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 text-xs bg-purple-900/50 border border-purple-700 text-purple-200 px-2 py-0.5 rounded-md"
                >
                  <span className="truncate max-w-[150px]">{acc?.accountName || id}</span>
                  <button
                    type="button"
                    onClick={() => handleToggleAccount(id)}
                    className="text-purple-300 hover:text-white ml-0.5 text-[10px]"
                    title="移除此帳號"
                  >
                    ✕
                  </button>
                </span>
              );
            })}
            {selectedAccountIds.length > 8 && (
              <button
                type="button"
                onClick={() => setShowAccountSelector(true)}
                className="text-xs text-purple-400 hover:text-purple-300 underline font-medium"
              >
                + 更多 {selectedAccountIds.length - 8} 個帳號
              </button>
            )}
          </div>
        )}

        {/* 警告提示：自選模式但 0 個帳號選取 */}
        {isCustomAccountMode && selectedAccountIds.length === 0 && (
          <div className="p-3 bg-red-900/30 border border-red-700/60 rounded-lg text-red-200 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span>⚠️</span>
              <span>您目前尚未勾選任何帳號，所有報表及圖表數據將顯示為 0。請選擇 1 個或多個帳號，或點擊右側按鈕恢復全部帳號。</span>
            </div>
            <button
              type="button"
              onClick={handleSelectAllAccounts}
              className="px-3 py-1 bg-red-800 hover:bg-red-700 text-white rounded font-medium transition whitespace-nowrap"
            >
              切換回全部帳號
            </button>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 1. 公雲使用花費分佈 (長官決策看板) - Public Cloud Spend Distribution Table */}
      {/* ========================================================================= */}
      <Card 
        title={`公雲使用花費分佈 ${analysisMode === 'monthly' ? `(${selectedMonth})` : '(全期間累計)'} - ${accountFilterSummaryText}`}
        actionButton={
          <button 
            onClick={handleExportRgt} 
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-lg text-sm transition-all shadow hover:shadow-lg flex items-center gap-2"
          >
            <span>匯出公雲花費分佈 Excel</span>
          </button>
        }
      >
        <div className="space-y-6">
          {/* Executive KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-blue-950/40 border border-blue-600/40 rounded-xl p-4 shadow-sm">
              <div className="text-xs font-semibold text-blue-300 uppercase tracking-wider">既有 (R) 固本維運</div>
              <div className="text-2xl font-bold text-white mt-1">${formatNumber(rgtAnalysis.categories[0]?.cost || 0)}</div>
              <div className="text-xs text-blue-400 mt-1 font-medium">佔比 {rgtAnalysis.categories[0]?.percentage.toFixed(1)}%</div>
            </div>

            <div className="bg-emerald-950/40 border border-emerald-600/40 rounded-xl p-4 shadow-sm">
              <div className="text-xs font-semibold text-emerald-300 uppercase tracking-wider">成長 (G) 業務增長</div>
              <div className="text-2xl font-bold text-white mt-1">${formatNumber(rgtAnalysis.categories[1]?.cost || 0)}</div>
              <div className="text-xs text-emerald-400 mt-1 font-medium">佔比 {rgtAnalysis.categories[1]?.percentage.toFixed(1)}%</div>
            </div>

            <div className="bg-purple-950/40 border border-purple-600/40 rounded-xl p-4 shadow-sm">
              <div className="text-xs font-semibold text-purple-300 uppercase tracking-wider">創新與轉型 (T)</div>
              <div className="text-2xl font-bold text-white mt-1">${formatNumber(rgtAnalysis.categories[2]?.cost || 0)}</div>
              <div className="text-xs text-purple-400 mt-1 font-medium">佔比 {rgtAnalysis.categories[2]?.percentage.toFixed(1)}%</div>
            </div>

            <div className="bg-gray-800/80 border border-gray-600/50 rounded-xl p-4 shadow-sm">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">公雲總花費 (Total)</div>
              <div className="text-2xl font-bold text-yellow-400 mt-1">${formatNumber(rgtAnalysis.totalCost)}</div>
              <div className="text-xs text-gray-400 mt-1 font-medium">100.0% 完整收錄</div>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
            <div className="bg-gray-800/60 p-4 rounded-xl border border-gray-700">
              <h4 className="text-sm font-bold text-gray-200 mb-2 text-center">R / G / T 策略花費佔比分佈</h4>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={rgtAnalysis.pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {rgtAnalysis.pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '0.5rem' }}
                      formatter={(value: number) => [`$${formatNumber(value)} (${((value / (rgtAnalysis.totalCost || 1)) * 100).toFixed(1)}%)`, '金額']}
                    />
                    <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '12px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-gray-800/60 p-4 rounded-xl border border-gray-700">
              <h4 className="text-sm font-bold text-gray-200 mb-2 text-center">創新與轉型 (T) 細項分佈 ($USD)</h4>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rgtAnalysis.tBreakdown} layout="vertical" margin={{ top: 5, right: 30, left: 70, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
                    <XAxis type="number" stroke="#9ca3af" fontSize={11} />
                    <YAxis dataKey="name" type="category" stroke="#9ca3af" fontSize={11} width={75} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '0.5rem' }}
                      formatter={(value: number) => [`$${formatNumber(value)} (${((value / (rgtAnalysis.totalCost || 1)) * 100).toFixed(2)}%)`, '金額']}
                    />
                    <Bar dataKey="cost" radius={[0, 4, 4, 0]}>
                      {rgtAnalysis.tBreakdown.map((entry, index) => (
                        <Cell key={`t-cell-${index}`} fill={T_COLORS[index % T_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Exact Table Layout requested by User */}
          <div className="border border-gray-700 rounded-xl overflow-hidden shadow-md">
            <table className="w-full text-sm text-left border-collapse">
              <thead>
                <tr className="bg-gray-700 text-gray-200 text-xs uppercase font-bold border-b border-gray-600">
                  <th className="px-6 py-3.5 border-r border-gray-600 w-1/4">性質</th>
                  <th className="px-6 py-3.5 border-r border-gray-600 w-1/2">說明</th>
                  <th className="px-6 py-3.5 text-right w-1/4">金額 ($USD)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700 text-gray-300">
                {/* 1. 既有(R) (固本) */}
                <tr 
                  className={`bg-gray-800 hover:bg-gray-750 transition-colors cursor-pointer ${expandedRgtKey === 'R' ? 'bg-gray-750' : ''}`}
                  onClick={() => toggleRgtDetails('R')}
                >
                  <td className="px-6 py-4 font-bold text-blue-300 border-r border-gray-700 align-top">
                    <div className="flex items-center">
                      <span className={`inline-block w-4 transition-transform duration-200 ${expandedRgtKey === 'R' ? 'rotate-90' : ''}`}>▶</span>
                      <span className="ml-1 text-base">既有(R)</span>
                    </div>
                    <div className="text-xs text-blue-400 font-normal ml-5">(固本)</div>
                  </td>
                  <td className="px-6 py-4 border-r border-gray-700 text-gray-200 align-middle">
                    <div>已使用中系統或單位既有作業所需花費</div>
                    <div className="text-xs text-gray-400 mt-0.5">點擊可檢視貢獻服務明細</div>
                  </td>
                  <td className="px-6 py-4 text-right font-mono font-bold text-blue-300 text-base align-middle">
                    ${formatNumber(rgtAnalysis.categories[0]?.cost || 0)}
                    <span className="block text-xs font-normal text-gray-400 mt-0.5">({rgtAnalysis.categories[0]?.percentage.toFixed(1)}%)</span>
                  </td>
                </tr>
                {expandedRgtKey === 'R' && (
                  <tr className="bg-gray-900/90">
                    <td colSpan={3} className="px-6 py-4">
                      <div className="text-xs font-bold text-blue-300 mb-2">既有(R) 固本主要服務明細：</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                        {rgtAnalysis.categories[0]?.services?.slice(0, 9).map((srv, idx) => (
                          <div key={idx} className="bg-gray-800 p-2 rounded border border-gray-700 flex justify-between">
                            <span className="text-gray-300 truncate pr-2" title={srv.productName}>{srv.productName}</span>
                            <span className="text-blue-300 font-mono font-bold">${formatNumber(srv.cost)}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}

                {/* 2. 成長(G) */}
                <tr 
                  className={`bg-gray-800 hover:bg-gray-750 transition-colors cursor-pointer ${expandedRgtKey === 'G' ? 'bg-gray-750' : ''}`}
                  onClick={() => toggleRgtDetails('G')}
                >
                  <td className="px-6 py-4 font-bold text-emerald-300 border-r border-gray-700 align-top">
                    <div className="flex items-center">
                      <span className={`inline-block w-4 transition-transform duration-200 ${expandedRgtKey === 'G' ? 'rotate-90' : ''}`}>▶</span>
                      <span className="ml-1 text-base">成長(G)</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 border-r border-gray-700 text-gray-200 align-middle">
                    <div>因應業務增長</div>
                    <div className="text-xs text-gray-400 mt-0.5">點擊可檢視業務擴充服務明細</div>
                  </td>
                  <td className="px-6 py-4 text-right font-mono font-bold text-emerald-300 text-base align-middle">
                    ${formatNumber(rgtAnalysis.categories[1]?.cost || 0)}
                    <span className="block text-xs font-normal text-gray-400 mt-0.5">({rgtAnalysis.categories[1]?.percentage.toFixed(1)}%)</span>
                  </td>
                </tr>
                {expandedRgtKey === 'G' && (
                  <tr className="bg-gray-900/90">
                    <td colSpan={3} className="px-6 py-4">
                      <div className="text-xs font-bold text-emerald-300 mb-2">成長(G) 業務增長貢獻明細：</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                        {rgtAnalysis.categories[1]?.services && rgtAnalysis.categories[1].services.length > 0 ? (
                          rgtAnalysis.categories[1].services.slice(0, 9).map((srv, idx) => (
                            <div key={idx} className="bg-gray-800 p-2 rounded border border-gray-700 flex justify-between">
                              <span className="text-gray-300 truncate pr-2" title={srv.productName}>{srv.productName}</span>
                              <span className="text-emerald-300 font-mono font-bold">${formatNumber(srv.cost)}</span>
                            </div>
                          ))
                        ) : (
                          <div className="text-gray-500 text-xs italic">無顯著月增長差額或首期為全固本基線</div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}

                {/* 3. 創新/新興與轉型(T) - Multi-row sub-items */}
                {rgtAnalysis.categories[2]?.subCategories?.map((sub, subIdx, arr) => {
                  const isExpanded = expandedRgtKey === sub.id;
                  return (
                    <React.Fragment key={sub.id}>
                      <tr 
                        className={`bg-gray-800 hover:bg-gray-750 transition-colors cursor-pointer ${isExpanded ? 'bg-gray-750' : ''}`}
                        onClick={() => toggleRgtDetails(sub.id)}
                      >
                        {/* 性質欄位合併顯示 */}
                        {subIdx === 0 && (
                          <td 
                            rowSpan={arr.length} 
                            className="px-6 py-4 font-bold text-purple-300 border-r border-gray-700 align-middle bg-gray-800/90"
                          >
                            <div className="text-base">創新/新興與轉型(T)</div>
                            <div className="text-xs text-purple-400 font-normal mt-1">小計: ${formatNumber(rgtAnalysis.categories[2]?.cost || 0)}</div>
                            <div className="text-xs text-gray-400 font-normal font-mono">({rgtAnalysis.categories[2]?.percentage.toFixed(1)}%)</div>
                          </td>
                        )}
                        <td className="px-6 py-3.5 border-r border-gray-700 text-gray-200 align-middle">
                          <div className="flex items-center">
                            <span className={`inline-block w-4 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                            <span className="font-semibold text-white ml-1">{sub.name}</span>
                          </div>
                          <div className="text-xs text-gray-400 ml-5">{sub.description}</div>
                        </td>
                        <td className="px-6 py-3.5 text-right font-mono font-bold text-purple-300 text-base align-middle">
                          ${formatNumber(sub.cost)}
                          <span className="block text-xs font-normal text-gray-400 mt-0.5">({sub.percentage.toFixed(2)}%)</span>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-gray-900/90">
                          <td colSpan={2} className="px-6 py-3 border-l border-gray-700">
                            <div className="text-xs font-bold text-purple-300 mb-2">【{sub.name}】涵蓋之 AWS 服務列表：</div>
                            <div className="space-y-1 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                              {sub.services.length > 0 ? (
                                sub.services.map((srv, sIdx) => (
                                  <div key={sIdx} className="flex justify-between text-xs bg-gray-800/80 p-1.5 rounded border border-gray-700/60">
                                    <span className="text-gray-300">{srv.productName}</span>
                                    <span className="text-purple-300 font-mono font-bold">${formatNumber(srv.cost)}</span>
                                  </div>
                                ))
                              ) : (
                                <div className="text-xs text-gray-500 italic">此期間尚未產生此類別之費用</div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}

                {/* 4. 總計 (Total Row) */}
                <tr className="bg-gray-750 font-bold border-t-2 border-gray-600">
                  <td className="px-6 py-4 text-white border-r border-gray-600 text-base">總計</td>
                  <td className="px-6 py-4 text-gray-200 border-r border-gray-600">全雲端花費加總</td>
                  <td className="px-6 py-4 text-right font-mono text-yellow-400 text-lg">
                    ${formatNumber(rgtAnalysis.totalCost)}
                    <span className="block text-xs font-normal text-gray-300 mt-0.5">(100.0%)</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {/* ========================================================================= */}
      {/* 2. Top 10 服務費用分佈 - Top 10 Chart */}
      {/* ========================================================================= */}
      <Card title={`Top 10 服務費用分佈 ${analysisMode === 'cumulative' ? '(全期間累計)' : `(${selectedMonth})`} - ${accountFilterSummaryText}`}>
        <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={top10ChartData} layout="vertical" margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#4a5568" horizontal={false} />
                    <XAxis type="number" stroke="#a0aec0" />
                    <YAxis dataKey="name" type="category" stroke="#a0aec0" width={90} fontSize={10} />
                    <Tooltip 
                        contentStyle={{ backgroundColor: '#2d3748', border: 'none', borderRadius: '0.5rem' }}
                        labelStyle={{ color: '#e2e8f0' }}
                        formatter={(value: number) => [`$${formatNumber(value)}`, 'Total Cost']}
                    />
                    <Bar dataKey="cost" radius={[0, 4, 4, 0]}>
                        {top10ChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
      </Card>

      {/* ========================================================================= */}
      {/* 3. 產品服務清單與明細 - Product Service Breakdown List */}
      {/* ========================================================================= */}
      <Card 
        title={`${analysisMode === 'monthly' ? `產品服務清單 (${selectedMonth})` : "產品服務清單 (全期間累計)"} - ${accountFilterSummaryText}`} 
        actionButton={
            <div className="flex items-center space-x-4">
                <button onClick={handleExport} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded text-sm transition-colors shadow-lg">匯出產品清單 Excel</button>
            </div>
        }
      >
        <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-400">
                <thead className="text-xs text-gray-300 uppercase bg-gray-700 sticky top-0">
                    <tr>
                        <th scope="col" className="px-6 py-3 cursor-pointer hover:bg-gray-600 transition-colors" onClick={() => handleSort('name')}>
                            產品名稱 <span className={sortConfig.key === 'name' ? 'text-blue-400' : 'text-gray-500'}>{getSortIcon('name')}</span>
                        </th>
                        <th scope="col" className="px-6 py-3 text-right cursor-pointer hover:bg-gray-600 transition-colors" onClick={() => handleSort('totalCost')}>
                            {analysisMode === 'monthly' ? '本月總費用' : '全期間總費用'} (USD) <span className={sortConfig.key === 'totalCost' ? 'text-blue-400' : 'text-gray-500'}>{getSortIcon('totalCost')}</span>
                        </th>
                        <th scope="col" className="px-6 py-3 text-center">佔比</th>
                    </tr>
                </thead>
                <tbody>
                    {productAnalysis.map(product => {
                        const isExpanded = expandedProductName === product.productName;
                        const totalPeriodCost = productAnalysis.reduce((sum, p) => sum + p.totalCost, 0);
                        const percentage = totalPeriodCost > 0 ? (product.totalCost / totalPeriodCost) * 100 : 0;

                        return (
                            <React.Fragment key={product.productName}>
                                <tr 
                                    className={`bg-gray-800 border-b border-gray-700 hover:bg-gray-700 cursor-pointer transition-colors ${isExpanded ? 'bg-gray-750' : ''}`}
                                    onClick={() => setExpandedProductName(isExpanded ? null : product.productName)}
                                >
                                    <td className="px-6 py-4 font-medium text-white">
                                        <span className={`inline-block w-4 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                                        <span className="ml-2">{product.productName}</span>
                                    </td>
                                    <td className="px-6 py-4 text-right font-bold text-blue-400">{formatNumber(product.totalCost)}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center">
                                            <div className="w-full bg-gray-700 rounded-full h-1.5 mr-2">
                                                <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${percentage}%` }}></div>
                                            </div>
                                            <span className="text-xs w-10 text-right">{percentage.toFixed(1)}%</span>
                                        </div>
                                    </td>
                                </tr>
                                {isExpanded && (
                                    <tr className="bg-gray-900">
                                        <td colSpan={3} className="p-6">
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                                {/* 帳號分佈 */}
                                                <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 shadow-inner">
                                                    <h5 className="text-sm font-bold text-gray-300 mb-3 border-b border-gray-700 pb-2">
                                                      {analysisMode === 'monthly' ? '帳號分佈 (本月)' : '帳號累計貢獻度'}
                                                    </h5>
                                                    <div className="space-y-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                                                        {Array.from(product.accounts.values())
                                                            .sort((a: ProductAccountSummary, b: ProductAccountSummary) => b.cost - a.cost)
                                                            .map((acc: ProductAccountSummary) => {
                                                                const accPerc = (acc.cost / product.totalCost) * 100;
                                                                return (
                                                                    <div key={acc.accountId} className="flex flex-col mb-2">
                                                                        <div className="flex justify-between text-xs mb-1">
                                                                            <span className="text-gray-400">{acc.accountName} <span className="text-gray-600">({acc.accountId})</span></span>
                                                                            <span className="text-white font-medium">${formatNumber(acc.cost)}</span>
                                                                        </div>
                                                                        <div className="w-full bg-gray-900 rounded-full h-1">
                                                                            <div className="bg-green-500 h-1 rounded-full" style={{ width: `${accPerc}%` }}></div>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })
                                                        }
                                                    </div>
                                                </div>

                                                {/* 使用明細 */}
                                                <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 shadow-inner">
                                                    <h5 className="text-sm font-bold text-gray-300 mb-3 border-b border-gray-700 pb-2">
                                                      {analysisMode === 'monthly' ? '產品使用明細彙總' : '產品使用明細 (全期間彙總)'}
                                                    </h5>
                                                    <div className="overflow-x-auto max-h-64 overflow-y-auto custom-scrollbar">
                                                        <table className="w-full text-[11px] text-left">
                                                            <thead className="text-gray-500 uppercase sticky top-0 bg-gray-800">
                                                                <tr>
                                                                    <th className="pb-2">Usage Type / Item Description</th>
                                                                    <th className="pb-2 text-right">彙總用量</th>
                                                                    <th className="pb-2 text-right">彙總費用</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-gray-700">
                                                                {Array.from(product.details.values())
                                                                    .sort((a: ProductDetailSummary, b: ProductDetailSummary) => b.cost - a.cost)
                                                                    .map((detail: ProductDetailSummary, dIdx) => (
                                                                        <tr key={dIdx} className="hover:bg-white/5 transition-colors">
                                                                            <td className="py-2 pr-4">
                                                                                <div className="text-gray-300 font-medium">{detail.usageType}</div>
                                                                                <div className="text-gray-500 italic text-[10px] leading-tight">{detail.itemDescription}</div>
                                                                            </td>
                                                                            <td className="py-2 text-right text-gray-400">{formatNumber(detail.usage, 4)}</td>
                                                                            <td className="py-2 text-right text-blue-300 font-bold">${formatNumber(detail.cost)}</td>
                                                                        </tr>
                                                                    ))
                                                                }
                                                            </tbody>
                                                        </table>
                                                    </div>
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
      </Card>
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #1a202c;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #4a5568;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #718096;
        }
      `}</style>
    </div>
  );
};

export default ServiceAnalysisTab;

