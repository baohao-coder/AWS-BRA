import React, { useState, useMemo, useEffect, useRef } from 'react';
import { BillingData, ServiceDetail } from '../../types';
import { exportToExcel } from '../../services/excelUtils';
import { 
  getServiceCategory, 
  CATEGORY_METAS, 
  ALL_CATEGORIES, 
  ServiceCategory 
} from '../../services/serviceTaxonomy';
import Card from '../common/Card';

export interface ProductUsageQuerySectionProps {
  data: BillingData;
  months: string[];
  selectedMonth: string;
  analysisMode: 'monthly' | 'cumulative';
  selectedProductName?: string;
  selectedProductNames?: string[];
  onSelectProductName?: (productName: string) => void;
  onSelectProductNames?: (productNames: string[]) => void;
  accountFilterSummaryText: string;
}

export interface FlattenedServiceDetail extends ServiceDetail {
  category: ServiceCategory;
}

type SortColumn = 
  | 'category' 
  | 'accountId' 
  | 'accountName' 
  | 'productName' 
  | 'usageType' 
  | 'itemDescription' 
  | 'unitPrice' 
  | 'usages' 
  | 'totalCost' 
  | 'month';

type SortDirection = 'asc' | 'desc';

const formatNumber = (value: number, decimals: number = 2) => {
  if (typeof value !== 'number' || isNaN(value)) return '0.00';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
};

const formatUnitPrice = (price: number) => {
  if (typeof price !== 'number' || isNaN(price)) return '$0.00';
  if (price === 0) return '$0.00';
  if (price < 0.01) {
    return `$${price.toFixed(6)}`;
  }
  return `$${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(price)}`;
};

export const ProductUsageQuerySection: React.FC<ProductUsageQuerySectionProps> = ({
  data,
  months,
  selectedMonth,
  analysisMode,
  selectedProductName,
  selectedProductNames,
  onSelectProductName,
  onSelectProductNames,
  accountFilterSummaryText
}) => {
  // Time scope within query section: 'sync' (follow upper view), 'all' (all months), or specific month
  const [timeScope, setTimeScope] = useState<'sync' | 'all' | 'custom'>('sync');
  const [customMonth, setCustomMonth] = useState<string>(selectedMonth || months[months.length - 1] || '');

  // Category filter
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<ServiceCategory | 'ALL'>('ALL');

  // Account filter
  const [selectedAccountFilter, setSelectedAccountFilter] = useState<string>('ALL');

  // Multi-select product state: array of productNames or ['__ALL__']
  const [selectedProducts, setSelectedProducts] = useState<string[]>(() => {
    if (selectedProductNames && selectedProductNames.length > 0) {
      return selectedProductNames;
    }
    if (selectedProductName && selectedProductName !== '__ALL__') {
      return [selectedProductName];
    }
    return ['__ALL__'];
  });

  // Dropdown open/close state
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Product search in dropdown
  const [productSearchKeyword, setProductSearchKeyword] = useState<string>('');

  // Table search keyword
  const [tableSearchKeyword, setTableSearchKeyword] = useState<string>('');

  // Sorting
  const [sortColumn, setSortColumn] = useState<SortColumn>('totalCost');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // Sync if parent updates selectedProductNames or selectedProductName
  useEffect(() => {
    if (selectedProductNames !== undefined) {
      setSelectedProducts(selectedProductNames.length > 0 ? selectedProductNames : ['__ALL__']);
    } else if (selectedProductName !== undefined) {
      if (selectedProductName === '' || selectedProductName === '__ALL__') {
        setSelectedProducts(['__ALL__']);
      } else {
        setSelectedProducts([selectedProductName]);
      }
    }
  }, [selectedProductName, selectedProductNames]);

  // Click outside listener for dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  // Determine if all products are selected
  const isAllProductsSelected = useMemo(() => {
    return selectedProducts.length === 0 || selectedProducts.includes('__ALL__');
  }, [selectedProducts]);

  // Set of selected individual product names with explicit string type
  const selectedProductsSet = useMemo<Set<string>>(() => {
    if (isAllProductsSelected) return new Set<string>();
    return new Set<string>(selectedProducts.filter(p => p !== '__ALL__'));
  }, [selectedProducts, isAllProductsSelected]);

  // Array of selected product names
  const selectedProductsList = useMemo<string[]>(() => {
    return Array.from(selectedProductsSet);
  }, [selectedProductsSet]);

  // Dispatch selection changes to parent
  const updateSelectedProducts = (newSelection: string[]) => {
    setSelectedProducts(newSelection);
    onSelectProductNames?.(newSelection);
    if (onSelectProductName) {
      if (newSelection.includes('__ALL__') || newSelection.length === 0) {
        onSelectProductName('__ALL__');
      } else if (newSelection.length === 1) {
        onSelectProductName(newSelection[0]);
      } else {
        onSelectProductName(newSelection[0]);
      }
    }
    setCurrentPage(1);
  };

  const handleSelectAllProducts = () => {
    updateSelectedProducts(['__ALL__']);
  };

  const handleSelectAllFiltered = () => {
    const filteredNames = filteredProductOptions.map(p => p.productName);
    const nextSet = new Set<string>(selectedProductsSet);
    filteredNames.forEach(n => nextSet.add(n));
    updateSelectedProducts(Array.from(nextSet));
  };

  const handleClearSelection = () => {
    updateSelectedProducts([]);
  };

  const handleInvertFilteredSelection = () => {
    const nextSet = new Set<string>(selectedProductsSet);
    filteredProductOptions.forEach(p => {
      if (nextSet.has(p.productName)) {
        nextSet.delete(p.productName);
      } else {
        nextSet.add(p.productName);
      }
    });
    const nextArr = Array.from(nextSet);
    updateSelectedProducts(nextArr.length === 0 ? ['__ALL__'] : nextArr);
  };

  const handleToggleProduct = (prodName: string) => {
    if (prodName === '__ALL__') {
      updateSelectedProducts(['__ALL__']);
      return;
    }

    if (isAllProductsSelected) {
      updateSelectedProducts([prodName]);
      return;
    }

    const nextSet = new Set<string>(selectedProductsSet);
    if (nextSet.has(prodName)) {
      nextSet.delete(prodName);
    } else {
      nextSet.add(prodName);
    }

    const nextArr = Array.from(nextSet);
    updateSelectedProducts(nextArr);
  };

  const handleRemoveProductTag = (prodName: string) => {
    const nextSet = new Set<string>(selectedProductsSet);
    nextSet.delete(prodName);
    const nextArr = Array.from(nextSet);
    updateSelectedProducts(nextArr.length === 0 ? ['__ALL__'] : nextArr);
  };

  // Determine which months to include based on timeScope
  const activeMonths = useMemo(() => {
    if (timeScope === 'all') return months;
    if (timeScope === 'custom') return [customMonth];
    // 'sync' mode: follow upper analysisMode
    if (analysisMode === 'monthly') return [selectedMonth];
    return months;
  }, [timeScope, customMonth, analysisMode, selectedMonth, months]);

  // Extract all unique accounts available in the current dataset
  const availableAccounts = useMemo(() => {
    const accMap = new Map<string, string>();
    data.forEach(m => {
      m.accounts.forEach(a => {
        if (!accMap.has(a.accountId)) {
          accMap.set(a.accountId, a.accountName || a.accountId);
        }
      });
    });
    return Array.from(accMap.entries()).map(([id, name]) => ({
      accountId: id,
      accountName: name
    })).sort((a, b) => a.accountName.localeCompare(b.accountName));
  }, [data]);

  // Extract all unique products with total cost and category in the active scope
  const availableProducts = useMemo(() => {
    const prodMap = new Map<string, { productName: string; category: ServiceCategory; totalCost: number; recordCount: number }>();
    
    const relevantMonths = new Set(activeMonths);

    data.forEach(m => {
      if (!relevantMonths.has(m.month)) return;
      m.accounts.forEach(a => {
        if (selectedAccountFilter !== 'ALL' && a.accountId !== selectedAccountFilter) return;
        a.services.forEach(s => {
          const cat = getServiceCategory(s.productName);
          if (selectedCategoryFilter !== 'ALL' && cat !== selectedCategoryFilter) return;

          if (!prodMap.has(s.productName)) {
            prodMap.set(s.productName, {
              productName: s.productName,
              category: cat,
              totalCost: 0,
              recordCount: 0
            });
          }
          const item = prodMap.get(s.productName)!;
          item.totalCost += s.totalCost || 0;
          item.recordCount += s.details?.length || 1;
        });
      });
    });

    return Array.from(prodMap.values()).sort((a, b) => b.totalCost - a.totalCost);
  }, [data, activeMonths, selectedAccountFilter, selectedCategoryFilter]);

  // Filtered product options for dropdown based on search keyword, sorted alphabetically A-Z
  const filteredProductOptions = useMemo(() => {
    let list = availableProducts;
    if (productSearchKeyword.trim()) {
      const q = productSearchKeyword.toLowerCase().trim();
      list = availableProducts.filter(p => 
        p.productName.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => 
      a.productName.localeCompare(b.productName, undefined, { numeric: true, sensitivity: 'base' })
    );
  }, [availableProducts, productSearchKeyword]);

  // Top products by cost for quick-pick buttons
  const topProducts = useMemo(() => {
    return availableProducts.slice(0, 8);
  }, [availableProducts]);

  // Flatten and extract all line-item details matching criteria
  const { allDetails, kpiSummary } = useMemo(() => {
    const relevantMonths = new Set(activeMonths);
    const details: FlattenedServiceDetail[] = [];
    const accountsSet = new Set<string>();
    const monthsSet = new Set<string>();
    let totalCostSum = 0;
    let totalUsagesSum = 0;

    data.forEach(monthData => {
      if (!relevantMonths.has(monthData.month)) return;

      monthData.accounts.forEach(account => {
        if (selectedAccountFilter !== 'ALL' && account.accountId !== selectedAccountFilter) return;

        account.services.forEach(service => {
          // If specific products are selected (not all), filter by productName in selectedProductsSet
          if (!isAllProductsSelected) {
            if (selectedProductsSet.size === 0) {
              return;
            }
            if (!selectedProductsSet.has(service.productName)) {
              return;
            }
          }

          // Category filter
          const srvCategory = getServiceCategory(service.productName);
          if (selectedCategoryFilter !== 'ALL' && srvCategory !== selectedCategoryFilter) {
            return;
          }

          if (service.details && service.details.length > 0) {
            service.details.forEach(detail => {
              const category = getServiceCategory(
                detail.productName || service.productName, 
                detail.usageType, 
                detail.itemDescription
              );

              if (selectedCategoryFilter !== 'ALL' && category !== selectedCategoryFilter) {
                return;
              }

              const itemCost = detail.totalCost || 0;
              const itemUsage = detail.usages || 0;
              const itemMonth = detail.month || monthData.month;
              const itemAccountId = detail.accountId || account.accountId;
              const itemAccountName = detail.accountName || account.accountName;

              totalCostSum += itemCost;
              totalUsagesSum += itemUsage;
              accountsSet.add(itemAccountId);
              monthsSet.add(itemMonth);

              details.push({
                ...detail,
                productName: detail.productName || service.productName,
                accountId: itemAccountId,
                accountName: itemAccountName,
                month: itemMonth,
                category
              });
            });
          } else {
            // Service has no details array, create fallback detail row
            totalCostSum += service.totalCost || 0;
            accountsSet.add(account.accountId);
            monthsSet.add(monthData.month);

            details.push({
              productName: service.productName,
              usageType: 'Default',
              itemDescription: service.productName,
              unitPrice: service.totalCost || 0,
              usages: 1,
              totalCost: service.totalCost || 0,
              accountId: account.accountId,
              accountName: account.accountName,
              month: monthData.month,
              category: srvCategory
            });
          }
        });
      });
    });

    return {
      allDetails: details,
      kpiSummary: {
        totalRecords: details.length,
        totalCost: totalCostSum,
        totalUsages: totalUsagesSum,
        accountCount: accountsSet.size,
        monthCount: monthsSet.size
      }
    };
  }, [data, activeMonths, selectedAccountFilter, selectedCategoryFilter, isAllProductsSelected, selectedProductsSet]);

  // Filtered details based on tableSearchKeyword
  const filteredDetails = useMemo(() => {
    if (!tableSearchKeyword.trim()) return allDetails;
    const q = tableSearchKeyword.toLowerCase().trim();
    return allDetails.filter(d => 
      d.usageType.toLowerCase().includes(q) ||
      d.itemDescription.toLowerCase().includes(q) ||
      d.accountId.toLowerCase().includes(q) ||
      d.accountName.toLowerCase().includes(q) ||
      d.productName.toLowerCase().includes(q) ||
      d.month.toLowerCase().includes(q) ||
      d.category.toLowerCase().includes(q)
    );
  }, [allDetails, tableSearchKeyword]);

  // Sorted details
  const sortedDetails = useMemo(() => {
    const list = [...filteredDetails];
    list.sort((a, b) => {
      let valA: any = a[sortColumn];
      let valB: any = b[sortColumn];

      if (typeof valA === 'string') {
        const cmp = valA.localeCompare(valB || '', undefined, { numeric: true, sensitivity: 'base' });
        return sortDirection === 'asc' ? cmp : -cmp;
      }
      valA = Number(valA) || 0;
      valB = Number(valB) || 0;
      return sortDirection === 'asc' ? valA - valB : valB - valA;
    });
    return list;
  }, [filteredDetails, sortColumn, sortDirection]);

  // Pagination calculation
  const totalPages = useMemo(() => {
    if (pageSize === -1) return 1;
    return Math.max(1, Math.ceil(sortedDetails.length / pageSize));
  }, [sortedDetails.length, pageSize]);

  const pagedDetails = useMemo(() => {
    if (pageSize === -1) return sortedDetails;
    const start = (currentPage - 1) * pageSize;
    return sortedDetails.slice(start, start + pageSize);
  }, [sortedDetails, currentPage, pageSize]);

  // Reset page when filters change
  const handleFilterChange = () => {
    setCurrentPage(1);
  };

  // Toggle sorting on column click
  const handleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(col);
      setSortDirection(col === 'totalCost' || col === 'usages' || col === 'unitPrice' ? 'desc' : 'asc');
    }
    setCurrentPage(1);
  };

  // Export to Excel with exact columns requested:
  // 分類, Account ID, Account Name, Product Name, Usage Type, Item Description, Unit Price (USD), Usages, Total Cost (USD), Month
  const handleExportDetails = () => {
    if (sortedDetails.length === 0) {
      alert('無可匯出之明細資料');
      return;
    }

    const exportRows = sortedDetails.map(item => {
      const meta = CATEGORY_METAS[item.category];
      const catText = meta ? `${meta.id} - ${meta.name}` : item.category;

      return {
        '分類': catText,
        'Account ID': item.accountId,
        'Account Name': item.accountName,
        'Product Name': item.productName,
        'Usage Type': item.usageType,
        'Item Description': item.itemDescription,
        'Unit Price (USD)': item.unitPrice,
        'Usages': item.usages,
        'Total Cost (USD)': item.totalCost,
        'Month': item.month,
      };
    });

    const cleanProdName = isAllProductsSelected
      ? '全部產品'
      : selectedProductsSet.size === 1
        ? (selectedProductsList[0] || 'Product').replace(/[\\/:*?"<>|]/g, '_').slice(0, 30)
        : `選定${selectedProductsSet.size}個產品`;
    const timeLabel = timeScope === 'all' 
      ? '全期間' 
      : timeScope === 'custom' 
        ? customMonth 
        : (analysisMode === 'monthly' ? selectedMonth : '全期間');

    exportToExcel(exportRows, `產品使用狀況明細_${cleanProdName}_${timeLabel}`);
  };

  const currentProductMeta = useMemo(() => {
    if (isAllProductsSelected || selectedProductsSet.size !== 1) return null;
    const singleProduct = selectedProductsList[0] || '';
    const cat = getServiceCategory(singleProduct);
    return CATEGORY_METAS[cat];
  }, [isAllProductsSelected, selectedProductsSet, selectedProductsList]);

  return (
    <div id="product-usage-query-section" className="space-y-6">
      <Card
        title={`產品使用狀況查詢 (Product Usage Details Query)`}
        actionButton={
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleExportDetails}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-lg text-xs sm:text-sm transition-all shadow flex items-center gap-2 cursor-pointer"
            >
              <span>📥</span>
              <span>匯出明細 Excel ({sortedDetails.length.toLocaleString()} 筆)</span>
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          {/* Query Controls Panel */}
          <div 
            style={{ backgroundColor: '#111827' }} 
            className="bg-gray-900 p-4 sm:p-5 rounded-xl border border-gray-700 shadow-xl space-y-4"
          >
            {/* Dedicated Product Selector Card */}
            <div 
              style={{ backgroundColor: '#1f2937' }} 
              className="bg-gray-800 border-2 border-blue-500/80 rounded-xl p-4 sm:p-5 shadow-lg space-y-3.5"
            >
              {/* Product Selector Header & Status */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-700/80 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-blue-600/30 text-blue-400 border border-blue-500/50 text-base">
                    🔍
                  </span>
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <span>選擇查詢產品名稱 (可勾選多個產品)</span>
                      <span className="text-[11px] font-semibold text-blue-300 bg-blue-950/90 border border-blue-700/70 px-2 py-0.5 rounded-full">
                        共 {availableProducts.length} 個服務
                      </span>
                    </h4>
                    <p className="text-[11px] text-gray-400">
                      支援多選產品查詢：點擊下拉按鈕展開勾選清單、搜尋關鍵字批次全選，或點選下方熱門服務快速切換
                    </p>
                  </div>
                </div>

                {/* Current selection status pill */}
                <div className="flex items-center gap-2">
                  {isAllProductsSelected ? (
                    <span className="text-xs text-blue-300 bg-blue-900/40 border border-blue-700/60 px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                      <span>🌟 目前狀態：顯示全部產品明細</span>
                    </span>
                  ) : selectedProductsSet.size > 0 ? (
                    <div className="flex items-center gap-2 bg-emerald-950/90 border border-emerald-600/70 px-2.5 py-1 rounded-lg">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      <span className="text-xs text-emerald-300 font-bold">
                        已勾選 {selectedProductsSet.size} 個產品
                      </span>
                      <button
                        type="button"
                        onClick={handleSelectAllProducts}
                        className="text-[11px] text-emerald-400 hover:text-white underline ml-1 cursor-pointer font-medium"
                      >
                        切換為全部
                      </button>
                      <button
                        type="button"
                        onClick={handleClearSelection}
                        className="text-[11px] text-red-400 hover:text-red-300 underline ml-1 cursor-pointer font-medium"
                      >
                        清除
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 bg-yellow-950/90 border border-yellow-600/70 px-2.5 py-1 rounded-lg">
                      <span className="text-xs text-yellow-300 font-bold">
                        ⚠️ 目前未勾選任何產品
                      </span>
                      <button
                        type="button"
                        onClick={handleSelectAllProducts}
                        className="text-[11px] text-yellow-300 hover:text-white underline ml-1 cursor-pointer font-bold"
                      >
                        顯示全部
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Multi-Select Dropdown Control & Search Box */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start">
                {/* Multi-Select Trigger Button with Popover Panel */}
                <div ref={dropdownRef} className="lg:col-span-7 space-y-1.5 relative">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-gray-200">
                      產品多選下拉清單 (點擊展開勾選/取消):
                    </label>
                    <span className="text-[11px] text-blue-300 font-medium">
                      {isAllProductsSelected 
                        ? '全部產品' 
                        : `已選 ${selectedProductsSet.size} 項`}
                    </span>
                  </div>

                  {/* Trigger Button */}
                  <button
                    type="button"
                    onClick={() => setIsDropdownOpen(prev => !prev)}
                    style={{
                      backgroundColor: '#111827',
                      color: '#ffffff',
                      borderColor: '#3b82f6',
                    }}
                    className="w-full bg-gray-900 border-2 border-blue-500 hover:border-blue-400 text-left text-sm font-bold rounded-lg px-3.5 py-2.5 shadow-md flex items-center justify-between gap-2 cursor-pointer transition-colors"
                  >
                    <div className="truncate flex-1">
                      {isAllProductsSelected ? (
                        <span className="text-blue-300 flex items-center gap-1.5">
                          <span>🌟</span>
                          <span>全部產品 (All Products - 點擊展開可勾選多個產品)</span>
                        </span>
                      ) : selectedProductsSet.size === 0 ? (
                        <span className="text-yellow-400">⚠️ 未勾選任何產品 (點擊展開選擇)</span>
                      ) : selectedProductsSet.size === 1 ? (
                        <span className="text-white">
                          已選擇 1 個產品: <span className="text-emerald-400 font-bold">{selectedProductsList[0]}</span>
                        </span>
                      ) : (
                        <span className="text-white flex items-center gap-2">
                          <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                            已選 {selectedProductsSet.size} 個產品
                          </span>
                          <span className="text-gray-300 text-xs truncate">
                            {selectedProductsList.slice(0, 3).join(', ')}
                            {selectedProductsSet.size > 3 ? ` 等共 ${selectedProductsSet.size} 個` : ''}
                          </span>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-blue-400 text-xs font-mono">
                      <span>{isDropdownOpen ? '▲ 收合' : '▼ 展開'}</span>
                    </div>
                  </button>

                  {/* Dropdown Multi-Select Menu Panel */}
                  {isDropdownOpen && (
                    <div 
                      style={{ backgroundColor: '#111827', borderColor: '#3b82f6' }}
                      className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-gray-900 border-2 border-blue-500 rounded-xl shadow-2xl p-3 space-y-2.5 max-w-full"
                    >
                      {/* Action buttons inside dropdown */}
                      <div className="flex flex-wrap items-center justify-between gap-1.5 pb-2 border-b border-gray-700">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <button
                            type="button"
                            onClick={handleSelectAllProducts}
                            className={`px-2.5 py-1 rounded text-xs font-bold cursor-pointer transition-colors border ${
                              isAllProductsSelected
                                ? 'bg-blue-600 text-white border-blue-400 shadow'
                                : 'bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700'
                            }`}
                          >
                            🌟 全部產品
                          </button>
                          <button
                            type="button"
                            onClick={handleSelectAllFiltered}
                            className="px-2 py-1 rounded text-xs bg-gray-800 text-blue-300 hover:bg-gray-700 border border-gray-700 cursor-pointer"
                            title="全選搜尋結果清單中的所有項目"
                          >
                            全選清單 ({filteredProductOptions.length})
                          </button>
                          <button
                            type="button"
                            onClick={handleInvertFilteredSelection}
                            className="px-2 py-1 rounded text-xs bg-gray-800 text-purple-300 hover:bg-gray-700 border border-gray-700 cursor-pointer"
                          >
                            反向勾選
                          </button>
                          <button
                            type="button"
                            onClick={handleClearSelection}
                            className="px-2 py-1 rounded text-xs bg-gray-800 text-red-300 hover:bg-gray-700 border border-gray-700 cursor-pointer"
                          >
                            清除全部
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => setIsDropdownOpen(false)}
                          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded cursor-pointer shadow"
                        >
                          完成 ✕
                        </button>
                      </div>

                      {/* Dropdown Options List */}
                      <div className="max-h-64 sm:max-h-72 overflow-y-auto space-y-1 custom-scrollbar pr-1">
                        {/* Option 1: ALL */}
                        <div
                          onClick={handleSelectAllProducts}
                          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors text-xs sm:text-sm font-bold border ${
                            isAllProductsSelected
                              ? 'bg-blue-900/50 text-white border-blue-500'
                              : 'hover:bg-gray-800 text-gray-300 border-transparent'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isAllProductsSelected}
                            onChange={() => {}}
                            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 bg-gray-800 border-gray-600 cursor-pointer"
                          />
                          <span className="flex-1">🌟 全部產品 (All Products)</span>
                          <span className="text-[11px] text-blue-300 font-mono font-normal">
                            共 {availableProducts.length} 個服務
                          </span>
                        </div>

                        {/* Product Checkboxes (Alphabetically A-Z, no [DB], no amounts, no counts) */}
                        {filteredProductOptions.length === 0 ? (
                          <div className="py-4 text-center text-gray-400 text-xs">
                            無符合搜尋「{productSearchKeyword}」的產品名稱
                          </div>
                        ) : (
                          filteredProductOptions.map((p) => {
                            const isChecked = !isAllProductsSelected && selectedProductsSet.has(p.productName);
                            return (
                              <div
                                key={p.productName}
                                onClick={() => handleToggleProduct(p.productName)}
                                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors text-xs sm:text-sm border ${
                                  isChecked
                                    ? 'bg-blue-900/40 text-blue-100 font-bold border-blue-500/80 shadow-sm'
                                    : 'hover:bg-gray-800 text-gray-200 border-transparent'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {}}
                                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 bg-gray-800 border-gray-600 cursor-pointer"
                                />
                                <span className="flex-1 select-none break-words">
                                  {p.productName}
                                </span>
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* Dropdown footer info */}
                      <div className="pt-2 border-t border-gray-700/80 flex items-center justify-between text-[11px] text-gray-400">
                        <span>按字母 A-Z 順序排列</span>
                        <span>
                          {isAllProductsSelected ? '已選擇全部產品' : `目前已選 ${selectedProductsSet.size} 個產品`}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Quick Search Box (5 cols on lg) */}
                <div className="lg:col-span-5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-gray-200">
                      快速篩選產品清單 (Search):
                    </label>
                    {productSearchKeyword && (
                      <span className="text-[11px] text-blue-300 font-mono font-medium">
                        篩選符合 {filteredProductOptions.length} 項
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="輸入關鍵字篩選 (如 EC2, S3, RDS, Lambda, Bedrock...)"
                      value={productSearchKeyword}
                      onChange={(e) => setProductSearchKeyword(e.target.value)}
                      style={{
                        backgroundColor: '#111827',
                        color: '#ffffff',
                        borderColor: '#4b5563',
                        colorScheme: 'dark'
                      }}
                      className="w-full bg-gray-900 border-2 border-gray-600 focus:border-blue-400 rounded-lg pl-8 pr-8 py-2 text-xs text-white placeholder-gray-400 focus:outline-none shadow-sm"
                    />
                    <span className="absolute left-2.5 top-2.5 text-xs text-gray-400">🔍</span>
                    {productSearchKeyword && (
                      <button
                        type="button"
                        onClick={() => setProductSearchKeyword('')}
                        className="absolute right-2.5 top-2 text-xs text-gray-400 hover:text-white px-1 py-0.5 rounded cursor-pointer"
                        title="清除搜尋"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Selected Product Tags / Chips Bar (Visible when specific products are selected) */}
              {!isAllProductsSelected && selectedProductsSet.size > 0 && (
                <div className="pt-2 border-t border-gray-700/60 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1.5">
                      <span>✓ 已勾選產品項目 ({selectedProductsSet.size} 個):</span>
                      <span className="text-gray-400 font-normal">點擊 ✕ 標籤可立即移除</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSelectAllProducts}
                        className="text-[11px] text-blue-400 hover:text-blue-300 underline cursor-pointer"
                      >
                        切換為全部產品
                      </button>
                      <button
                        type="button"
                        onClick={handleClearSelection}
                        className="text-[11px] text-red-400 hover:text-red-300 underline cursor-pointer"
                      >
                        清除全部已選
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 max-h-32 overflow-y-auto custom-scrollbar p-1 bg-gray-900/60 rounded-lg border border-gray-700/60">
                    {selectedProductsList.map((name) => (
                      <span
                        key={name}
                        className="inline-flex items-center gap-1.5 bg-blue-950/90 border border-blue-500/70 text-blue-200 text-xs px-2.5 py-1 rounded-md shadow-sm"
                      >
                        <span className="truncate max-w-[280px]" title={name}>{name}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveProductTag(name)}
                          className="text-blue-400 hover:text-red-400 hover:bg-blue-900 rounded-full w-4 h-4 flex items-center justify-center font-bold text-[10px] cursor-pointer transition-colors"
                          title={`移除 ${name}`}
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Notice when 0 products are selected */}
              {!isAllProductsSelected && selectedProductsSet.size === 0 && (
                <div className="pt-2 border-t border-gray-700/60 flex items-center justify-between text-xs bg-yellow-950/40 border border-yellow-700/40 rounded-lg p-2.5">
                  <span className="text-yellow-300 font-medium">
                    ⚠️ 目前未勾選任何產品項目，明細清單暫無資料。請點擊上方下拉選單勾選產品，或切換為全部產品。
                  </span>
                  <button
                    type="button"
                    onClick={handleSelectAllProducts}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded text-xs cursor-pointer transition-colors shadow"
                  >
                    🌟 顯示全部產品
                  </button>
                </div>
              )}

              {/* Quick Pick Buttons for Popular Top Services */}
              <div className="pt-2 border-t border-gray-700/60 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-[11px] text-gray-300 font-bold whitespace-nowrap mr-1 flex items-center gap-1">
                  <span>⚡ 熱門服務快速切換:</span>
                </span>

                <button
                  type="button"
                  onClick={handleSelectAllProducts}
                  style={isAllProductsSelected ? {} : { backgroundColor: '#111827' }}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer border ${
                    isAllProductsSelected
                      ? 'bg-blue-600 text-white border-blue-400 shadow-md ring-1 ring-blue-300'
                      : 'bg-gray-900 text-gray-300 border-gray-700 hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  🌟 全部產品
                </button>

                {topProducts.map((p) => {
                  const isChecked = !isAllProductsSelected && selectedProductsSet.has(p.productName);
                  const shortName = p.productName.replace('Amazon', '').replace('AWS', '').trim() || p.productName;
                  return (
                    <button
                      key={p.productName}
                      type="button"
                      onClick={() => handleToggleProduct(p.productName)}
                      style={isChecked ? {} : { backgroundColor: '#111827' }}
                      className={`px-2.5 py-1 rounded-md text-xs transition-all cursor-pointer border flex items-center gap-1 ${
                        isChecked
                          ? 'bg-blue-600 text-white border-blue-400 shadow-md ring-1 ring-blue-300 font-bold'
                          : 'bg-gray-900 text-gray-300 border-gray-700 hover:bg-gray-800 hover:text-white'
                      }`}
                      title={`${isChecked ? '已勾選 (點擊取消)' : '點擊加入多選'}: ${p.productName}`}
                    >
                      {isChecked && <span>✓</span>}
                      <span>{shortName}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Row 2: Secondary Dimension Filters (Month Scope, Account, Category, Keyword) */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 pt-1">
              {/* Month Scope (md:col-span-4) */}
              <div className="md:col-span-4 space-y-1">
                <label className="text-xs font-bold text-gray-200 flex items-center gap-1">
                  <span className="text-purple-400 text-sm">📅</span>
                  <span>月份維度 (Month Scope):</span>
                </label>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setTimeScope('sync');
                      handleFilterChange();
                    }}
                    className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                      timeScope === 'sync'
                        ? 'bg-blue-600 text-white border-blue-500 shadow'
                        : 'bg-gray-800 text-gray-300 border-gray-600 hover:bg-gray-700'
                    }`}
                  >
                    同上方時間 ({analysisMode === 'monthly' ? selectedMonth : '全期間'})
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTimeScope('all');
                      handleFilterChange();
                    }}
                    className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                      timeScope === 'all'
                        ? 'bg-purple-600 text-white border-purple-500 shadow'
                        : 'bg-gray-800 text-gray-300 border-gray-600 hover:bg-gray-700'
                    }`}
                  >
                    全部月份
                  </button>

                  <div className="inline-flex items-center gap-1">
                    <select
                      value={timeScope === 'custom' ? customMonth : ''}
                      onChange={(e) => {
                        setTimeScope('custom');
                        setCustomMonth(e.target.value);
                        handleFilterChange();
                      }}
                      style={{
                        backgroundColor: '#1f2937',
                        color: '#ffffff',
                        borderColor: '#4b5563',
                        colorScheme: 'dark'
                      }}
                      className={`text-xs rounded-lg px-2 py-1.5 font-semibold border cursor-pointer ${
                        timeScope === 'custom'
                          ? 'bg-emerald-600 text-white border-emerald-500 shadow'
                          : 'bg-gray-800 text-gray-300 border-gray-600 hover:bg-gray-700'
                      }`}
                    >
                      <option value="" disabled style={{ backgroundColor: '#1f2937', color: '#ffffff' }}>指定單月...</option>
                      {months.map(m => (
                        <option key={m} value={m} style={{ backgroundColor: '#1f2937', color: '#ffffff' }}>{m}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Account Filter (md:col-span-3) */}
              <div className="md:col-span-3 space-y-1">
                <label className="block text-[11px] font-bold text-gray-300">
                  帳號篩選 (Account):
                </label>
                <select
                  value={selectedAccountFilter}
                  onChange={(e) => {
                    setSelectedAccountFilter(e.target.value);
                    handleFilterChange();
                  }}
                  style={{
                    backgroundColor: '#1f2937',
                    color: '#ffffff',
                    borderColor: '#4b5563',
                    colorScheme: 'dark'
                  }}
                  className="w-full bg-gray-800 border-2 border-gray-600 text-white text-xs rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-blue-400 focus:border-blue-400 cursor-pointer"
                >
                  <option value="ALL" style={{ backgroundColor: '#1f2937', color: '#ffffff' }}>全部帳號 ({accountFilterSummaryText})</option>
                  {availableAccounts.map(a => (
                    <option key={a.accountId} value={a.accountId} style={{ backgroundColor: '#1f2937', color: '#ffffff' }}>
                      {a.accountName} ({a.accountId})
                    </option>
                  ))}
                </select>
              </div>

              {/* Category Filter (md:col-span-2) */}
              <div className="md:col-span-2 space-y-1">
                <label className="block text-[11px] font-bold text-gray-300">
                  服務分類 (Category):
                </label>
                <select
                  value={selectedCategoryFilter}
                  onChange={(e) => {
                    setSelectedCategoryFilter(e.target.value as any);
                    handleFilterChange();
                  }}
                  style={{
                    backgroundColor: '#1f2937',
                    color: '#ffffff',
                    borderColor: '#4b5563',
                    colorScheme: 'dark'
                  }}
                  className="w-full bg-gray-800 border-2 border-gray-600 text-white text-xs rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-blue-400 focus:border-blue-400 cursor-pointer"
                >
                  <option value="ALL" style={{ backgroundColor: '#1f2937', color: '#ffffff' }}>全部分類</option>
                  {ALL_CATEGORIES.map(cat => {
                    const meta = CATEGORY_METAS[cat];
                    return (
                      <option key={cat} value={cat} style={{ backgroundColor: '#1f2937', color: '#ffffff' }}>
                        {meta.icon} {meta.id} - {meta.name}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Table Keyword Search (md:col-span-3) */}
              <div className="md:col-span-3 space-y-1">
                <label className="block text-[11px] font-bold text-gray-300">
                  明細過濾 (Usage Type / Desc):
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="搜尋明細關鍵字..."
                    value={tableSearchKeyword}
                    onChange={(e) => {
                      setTableSearchKeyword(e.target.value);
                      handleFilterChange();
                    }}
                    style={{
                      backgroundColor: '#1f2937',
                      color: '#ffffff',
                      borderColor: '#4b5563',
                      colorScheme: 'dark'
                    }}
                    className="w-full bg-gray-800 border-2 border-gray-600 text-white text-xs rounded-lg pl-2.5 pr-7 py-1.5 placeholder-gray-400 focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
                  />
                  {tableSearchKeyword && (
                    <button
                      type="button"
                      onClick={() => {
                        setTableSearchKeyword('');
                        handleFilterChange();
                      }}
                      className="absolute right-2 top-1.5 text-xs text-gray-400 hover:text-white cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* KPI Summary Cards for Selected Product Query */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {/* Selected Product Banner */}
            <div className="col-span-2 sm:col-span-3 lg:col-span-2 bg-gradient-to-r from-blue-900/40 to-indigo-900/40 border border-blue-500/40 rounded-xl p-3.5 flex flex-col justify-between shadow-sm">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-blue-300 uppercase tracking-wider">查詢產品項目</span>
                  {currentProductMeta ? (
                    <span 
                      className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: `${currentProductMeta.color}25`,
                        color: currentProductMeta.color,
                        border: `1px solid ${currentProductMeta.color}50`
                      }}
                    >
                      <span>{currentProductMeta.icon}</span>
                      <span>{currentProductMeta.id}</span>
                    </span>
                  ) : !isAllProductsSelected ? (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-950/80 text-blue-300 border border-blue-700/60">
                      已選 {selectedProductsSet.size} 個產品
                    </span>
                  ) : (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-950/80 text-blue-300 border border-blue-700/60">
                      全部服務
                    </span>
                  )}
                </div>
                <div 
                  className="text-base sm:text-lg font-bold text-white mt-1 break-words line-clamp-2" 
                  title={isAllProductsSelected ? '全部產品' : selectedProductsList.join(', ')}
                >
                  {isAllProductsSelected ? (
                    '🌟 全部產品 (All Products)'
                  ) : selectedProductsSet.size === 0 ? (
                    <span className="text-yellow-400">⚠️ 未選取任何產品</span>
                  ) : selectedProductsSet.size === 1 ? (
                    selectedProductsList[0]
                  ) : (
                    `已選擇 ${selectedProductsSet.size} 個產品 (${selectedProductsList.slice(0, 2).join(', ')}${selectedProductsSet.size > 2 ? ' 等' : ''})`
                  )}
                </div>
              </div>
              <div className="text-xs text-blue-300/80 mt-2 font-mono">
                範圍: {timeScope === 'all' ? '全期間' : timeScope === 'custom' ? customMonth : (analysisMode === 'monthly' ? selectedMonth : '全期間')} ｜ 帳號: {selectedAccountFilter === 'ALL' ? '全部' : selectedAccountFilter}
              </div>
            </div>

            {/* Total Cost */}
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-3.5 shadow-sm">
              <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">明細總費用 (Total Cost)</div>
              <div className="text-xl sm:text-2xl font-bold text-yellow-400 font-mono mt-1">
                ${formatNumber(kpiSummary.totalCost)}
              </div>
              <div className="text-[11px] text-gray-400 mt-1">USD 計費金額加總</div>
            </div>

            {/* Total Usages */}
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-3.5 shadow-sm">
              <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">彙總總用量 (Usages)</div>
              <div className="text-xl sm:text-2xl font-bold text-emerald-400 font-mono mt-1">
                {formatNumber(kpiSummary.totalUsages, 2)}
              </div>
              <div className="text-[11px] text-gray-400 mt-1">各項用量數值累加</div>
            </div>

            {/* Total Line Items & Coverage */}
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-3.5 shadow-sm">
              <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">明細筆數 / 涵蓋廣度</div>
              <div className="text-xl sm:text-2xl font-bold text-purple-300 font-mono mt-1">
                {kpiSummary.totalRecords.toLocaleString()} <span className="text-xs font-normal text-gray-400">筆</span>
              </div>
              <div className="text-[11px] text-gray-400 mt-1">
                涵蓋 {kpiSummary.accountCount} 個帳號 ｜ {kpiSummary.monthCount} 個月份
              </div>
            </div>
          </div>

          {/* Table Controls (Rows per page, count summary) */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs text-gray-300">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white">共 {sortedDetails.length.toLocaleString()} 筆符合條件明細</span>
              {tableSearchKeyword && (
                <span className="bg-blue-900/60 text-blue-300 px-2 py-0.5 rounded text-[11px] border border-blue-600/40">
                  關鍵字: "{tableSearchKeyword}"
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-gray-400">每頁顯示:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  style={{
                    backgroundColor: '#1f2937',
                    color: '#ffffff',
                    colorScheme: 'dark'
                  }}
                  className="bg-gray-800 border border-gray-600 text-white rounded px-2.5 py-1 text-xs focus:ring-1 focus:ring-blue-400 cursor-pointer"
                >
                  <option value={25} style={{ backgroundColor: '#1f2937', color: '#ffffff' }}>25 筆</option>
                  <option value={50} style={{ backgroundColor: '#1f2937', color: '#ffffff' }}>50 筆</option>
                  <option value={100} style={{ backgroundColor: '#1f2937', color: '#ffffff' }}>100 筆</option>
                  <option value={200} style={{ backgroundColor: '#1f2937', color: '#ffffff' }}>200 筆</option>
                  <option value={-1} style={{ backgroundColor: '#1f2937', color: '#ffffff' }}>全部顯示 (無分頁)</option>
                </select>
              </div>

              {/* Pagination controls top */}
              {pageSize !== -1 && totalPages > 1 && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    className="px-2 py-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:hover:bg-gray-800 rounded border border-gray-700 font-bold cursor-pointer"
                  >
                    ◀
                  </button>
                  <span className="font-mono text-gray-300 text-xs px-1">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    className="px-2 py-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:hover:bg-gray-800 rounded border border-gray-700 font-bold cursor-pointer"
                  >
                    ▶
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Granular Line-item Details Table with the 10 Requested Columns */}
          <div className="border border-gray-700/80 rounded-xl overflow-hidden shadow-md">
            <div className="overflow-x-auto max-h-[640px] overflow-y-auto custom-scrollbar">
              <table className="w-full text-xs text-left text-gray-300">
                <thead className="text-[11px] text-gray-200 uppercase bg-gray-750 border-b border-gray-600 sticky top-0 z-10 font-bold shadow-sm">
                  <tr>
                    <th 
                      scope="col" 
                      className="px-3 py-3 whitespace-nowrap cursor-pointer hover:bg-gray-700 transition-colors"
                      onClick={() => handleSort('category')}
                    >
                      <div className="flex items-center gap-1">
                        <span>分類</span>
                        <span className={sortColumn === 'category' ? 'text-blue-400' : 'text-gray-500'}>
                          {sortColumn === 'category' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </div>
                    </th>

                    <th 
                      scope="col" 
                      className="px-3 py-3 whitespace-nowrap cursor-pointer hover:bg-gray-700 transition-colors"
                      onClick={() => handleSort('accountId')}
                    >
                      <div className="flex items-center gap-1">
                        <span>Account ID</span>
                        <span className={sortColumn === 'accountId' ? 'text-blue-400' : 'text-gray-500'}>
                          {sortColumn === 'accountId' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </div>
                    </th>

                    <th 
                      scope="col" 
                      className="px-3 py-3 whitespace-nowrap cursor-pointer hover:bg-gray-700 transition-colors"
                      onClick={() => handleSort('accountName')}
                    >
                      <div className="flex items-center gap-1">
                        <span>Account Name</span>
                        <span className={sortColumn === 'accountName' ? 'text-blue-400' : 'text-gray-500'}>
                          {sortColumn === 'accountName' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </div>
                    </th>

                    <th 
                      scope="col" 
                      className="px-3 py-3 whitespace-nowrap cursor-pointer hover:bg-gray-700 transition-colors"
                      onClick={() => handleSort('productName')}
                    >
                      <div className="flex items-center gap-1">
                        <span>Product Name</span>
                        <span className={sortColumn === 'productName' ? 'text-blue-400' : 'text-gray-500'}>
                          {sortColumn === 'productName' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </div>
                    </th>

                    <th 
                      scope="col" 
                      className="px-3 py-3 cursor-pointer hover:bg-gray-700 transition-colors"
                      onClick={() => handleSort('usageType')}
                    >
                      <div className="flex items-center gap-1">
                        <span>Usage Type</span>
                        <span className={sortColumn === 'usageType' ? 'text-blue-400' : 'text-gray-500'}>
                          {sortColumn === 'usageType' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </div>
                    </th>

                    <th 
                      scope="col" 
                      className="px-3 py-3 min-w-[220px] cursor-pointer hover:bg-gray-700 transition-colors"
                      onClick={() => handleSort('itemDescription')}
                    >
                      <div className="flex items-center gap-1">
                        <span>Item Description</span>
                        <span className={sortColumn === 'itemDescription' ? 'text-blue-400' : 'text-gray-500'}>
                          {sortColumn === 'itemDescription' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </div>
                    </th>

                    <th 
                      scope="col" 
                      className="px-3 py-3 text-right whitespace-nowrap cursor-pointer hover:bg-gray-700 transition-colors"
                      onClick={() => handleSort('unitPrice')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Unit Price (USD)</span>
                        <span className={sortColumn === 'unitPrice' ? 'text-blue-400' : 'text-gray-500'}>
                          {sortColumn === 'unitPrice' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </div>
                    </th>

                    <th 
                      scope="col" 
                      className="px-3 py-3 text-right whitespace-nowrap cursor-pointer hover:bg-gray-700 transition-colors"
                      onClick={() => handleSort('usages')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Usages</span>
                        <span className={sortColumn === 'usages' ? 'text-blue-400' : 'text-gray-500'}>
                          {sortColumn === 'usages' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </div>
                    </th>

                    <th 
                      scope="col" 
                      className="px-3 py-3 text-right whitespace-nowrap cursor-pointer hover:bg-gray-700 transition-colors"
                      onClick={() => handleSort('totalCost')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Total Cost (USD)</span>
                        <span className={sortColumn === 'totalCost' ? 'text-blue-400' : 'text-gray-500'}>
                          {sortColumn === 'totalCost' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </div>
                    </th>

                    <th 
                      scope="col" 
                      className="px-3 py-3 text-center whitespace-nowrap cursor-pointer hover:bg-gray-700 transition-colors"
                      onClick={() => handleSort('month')}
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>Month</span>
                        <span className={sortColumn === 'month' ? 'text-blue-400' : 'text-gray-500'}>
                          {sortColumn === 'month' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </div>
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-700">
                  {pagedDetails.length > 0 ? (
                    pagedDetails.map((item, idx) => {
                      const meta = CATEGORY_METAS[item.category];

                      return (
                        <tr 
                          key={`${item.month}-${item.accountId}-${item.productName}-${item.usageType}-${idx}`}
                          className={`hover:bg-gray-750 transition-colors ${idx % 2 === 0 ? 'bg-gray-800' : 'bg-gray-800/60'}`}
                        >
                          {/* 1. 分類 */}
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <span 
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold"
                              style={{
                                color: meta?.color || '#9ca3af',
                                backgroundColor: `${meta?.color || '#9ca3af'}20`,
                                border: `1px solid ${meta?.color || '#9ca3af'}40`
                              }}
                              title={meta?.name || item.category}
                            >
                              <span>{meta?.icon || '📦'}</span>
                              <span>{meta?.id || item.category}</span>
                            </span>
                          </td>

                          {/* 2. Account ID */}
                          <td className="px-3 py-2.5 whitespace-nowrap font-mono text-gray-300">
                            {item.accountId}
                          </td>

                          {/* 3. Account Name */}
                          <td className="px-3 py-2.5 whitespace-nowrap font-medium text-white max-w-[150px] truncate" title={item.accountName}>
                            {item.accountName}
                          </td>

                          {/* 4. Product Name */}
                          <td className="px-3 py-2.5 whitespace-nowrap font-semibold text-blue-300 max-w-[200px] truncate" title={item.productName}>
                            {item.productName}
                          </td>

                          {/* 5. Usage Type */}
                          <td className="px-3 py-2.5 font-mono text-gray-200 text-[11px] max-w-[220px] truncate" title={item.usageType}>
                            {item.usageType}
                          </td>

                          {/* 6. Item Description */}
                          <td className="px-3 py-2.5 text-gray-400 text-[11px] max-w-[320px] truncate" title={item.itemDescription}>
                            {item.itemDescription || '-'}
                          </td>

                          {/* 7. Unit Price (USD) */}
                          <td className="px-3 py-2.5 text-right font-mono text-gray-300 whitespace-nowrap">
                            {formatUnitPrice(item.unitPrice)}
                          </td>

                          {/* 8. Usages */}
                          <td className="px-3 py-2.5 text-right font-mono text-emerald-300 whitespace-nowrap">
                            {formatNumber(item.usages, item.usages % 1 === 0 ? 0 : 4)}
                          </td>

                          {/* 9. Total Cost (USD) */}
                          <td className="px-3 py-2.5 text-right font-mono font-bold text-yellow-400 whitespace-nowrap">
                            ${formatNumber(item.totalCost, 2)}
                          </td>

                          {/* 10. Month */}
                          <td className="px-3 py-2.5 text-center font-mono font-medium text-gray-300 whitespace-nowrap">
                            {item.month}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-gray-400">
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <span className="text-3xl">🔍</span>
                          <span className="text-sm font-semibold">
                            {!isAllProductsSelected && selectedProductsSet.size === 0
                              ? '目前未勾選任何產品項目'
                              : '查無符合目前篩選條件之產品使用明細'}
                          </span>
                          <span className="text-xs text-gray-500">
                            {!isAllProductsSelected && selectedProductsSet.size === 0
                              ? '請點擊上方產品下拉選單勾選所需產品，或點選顯示全部產品'
                              : '請嘗試勾選更多產品名稱、切換月份範圍，或清除關鍵字搜尋'}
                          </span>
                          {!isAllProductsSelected && selectedProductsSet.size === 0 && (
                            <button
                              type="button"
                              onClick={handleSelectAllProducts}
                              className="mt-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs cursor-pointer shadow"
                            >
                              🌟 顯示全部產品明細
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls Bottom */}
            {pageSize !== -1 && totalPages > 1 && (
              <div className="bg-gray-750 px-4 py-3 border-t border-gray-700 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-300">
                <div>
                  顯示第 <strong className="text-white font-mono">{((currentPage - 1) * pageSize) + 1}</strong> 到{' '}
                  <strong className="text-white font-mono">{Math.min(currentPage * pageSize, sortedDetails.length)}</strong> 筆，
                  共 <strong className="text-white font-mono">{sortedDetails.length.toLocaleString()}</strong> 筆
                </div>

                <div className="flex items-center space-x-1.5">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage(1)}
                    className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 rounded border border-gray-700 cursor-pointer"
                    title="第一頁"
                  >
                    «
                  </button>
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 rounded border border-gray-700 cursor-pointer"
                  >
                    上一頁
                  </button>

                  <span className="px-3 py-1 font-mono bg-blue-600/30 border border-blue-500/50 rounded text-blue-300 font-bold">
                    頁碼 {currentPage} / {totalPages}
                  </span>

                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 rounded border border-gray-700 cursor-pointer"
                  >
                    下一頁
                  </button>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage(totalPages)}
                    className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 rounded border border-gray-700 cursor-pointer"
                    title="最後一頁"
                  >
                    »
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
};

export default ProductUsageQuerySection;
