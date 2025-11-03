declare const XLSX: any;

export const exportToExcel = (data: any[], fileName: string): void => {
  try {
    if (!data || data.length === 0) {
      alert("沒有可匯出的資料。");
      return;
    }
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
    
    // Auto-adjust column widths
    const columnWidths = Object.keys(data[0]).map(key => {
        const headerWidth = key.length;
        const dataWidths = data.map(row => String(row[key] ?? '').length);
        const maxWidth = Math.max(headerWidth, ...dataWidths);
        return { wch: Math.min(maxWidth + 2, 80) }; // Add padding, cap at 80
    });
    worksheet["!cols"] = columnWidths;
    
    XLSX.writeFile(workbook, `${fileName}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  } catch (error) {
    console.error("Failed to export to Excel", error);
    alert("匯出 Excel 失敗。");
  }
};
