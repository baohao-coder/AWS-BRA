/**
 * 遞迴讀取資料夾中的所有檔案
 */
export const getAllFilesFromEntries = async (entries: any[]): Promise<File[]> => {
  const files: File[] = [];
  
  const readEntry = async (entry: any) => {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve) => entry.file(resolve));
      files.push(file);
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const readEntries = async (): Promise<any[]> => {
        return new Promise((resolve) => {
          reader.readEntries((results: any[]) => resolve(results));
        });
      };
      
      let dirEntries = await readEntries();
      // readEntries might need to be called multiple times to get all entries
      while (dirEntries.length > 0) {
        for (const dirEntry of dirEntries) {
          await readEntry(dirEntry);
        }
        dirEntries = await readEntries();
      }
    }
  };

  for (const entry of entries) {
    await readEntry(entry);
  }
  return files;
};

/**
 * 依據使用者需求排序檔案：
 * 1. 英文開頭優先 (A-Z)
 * 2. 中文開頭次之 (按筆劃排序)
 * 3. 檔案名稱中的西元年月 (最近的排在最上面)
 */
export const sortFiles = (files: File[]): File[] => {
  const getFileInfo = (name: string) => {
    // 嘗試尋找西元年月 (YYYYMM, YYYY-MM, YYYY_MM)
    const dateMatch = name.match(/(\d{4})[-_]?(\d{2})/);
    let date = "";
    let prefix = name;
    
    if (dateMatch) {
      date = dateMatch[1] + dateMatch[2];
      // 前綴為日期前的文字
      prefix = name.substring(0, dateMatch.index).trim();
    }
    
    const firstChar = prefix.charAt(0) || name.charAt(0);
    // 判斷是否為英文開頭 (A-Z, a-z)
    const isEnglish = /^[a-zA-Z]/.test(firstChar);
    
    return { prefix, date, isEnglish, originalName: name };
  };

  return [...files].sort((a, b) => {
    const infoA = getFileInfo(a.name);
    const infoB = getFileInfo(b.name);

    // 1. 英文優先於中文
    if (infoA.isEnglish && !infoB.isEnglish) return -1;
    if (!infoA.isEnglish && infoB.isEnglish) return 1;

    // 2. 前綴排序 (英文 A-Z, 中文按筆劃)
    // 使用 zh-Hant-TW-u-co-stroke 進行筆劃排序
    const prefixComp = infoA.prefix.localeCompare(infoB.prefix, 'zh-Hant-TW-u-co-stroke', { sensitivity: 'base' });
    if (prefixComp !== 0) return prefixComp;

    // 3. 日期排序 (最近的排在最上面，即降序)
    if (infoA.date && infoB.date) {
      return infoB.date.localeCompare(infoA.date);
    }
    
    // 若無日期或前綴相同，則以原始名稱降序排列 (通常日期在後面的話，降序能讓新日期在前)
    return infoB.originalName.localeCompare(infoA.originalName);
  });
};
