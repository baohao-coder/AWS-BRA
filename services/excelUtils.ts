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
    
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    
    // Create a Blob to handle the file in memory, client-side.
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    // Generate a temporary local URL for the Blob to trigger download.
    // This is a secure method and does not involve any network transmission.
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();

    // Clean up the temporary elements and URL.
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Failed to export to Excel. This is a client-side operation and no data was transmitted.");
    alert("匯出 Excel 失敗。");
  }
};