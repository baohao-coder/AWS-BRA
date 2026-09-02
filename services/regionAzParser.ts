export interface RegionInfo {
  code: string;
  shortCode: string;
  nameZh: string;
  nameEn: string;
  location: string;
  color: string;
}

export const AWS_REGION_MAP: Record<string, RegionInfo> = {
  'APN1': {
    code: 'ap-northeast-1',
    shortCode: 'APN1',
    nameZh: '東京 (Tokyo)',
    nameEn: 'Asia Pacific (Tokyo)',
    location: 'Japan',
    color: '#3b82f6'
  },
  'APE2': {
    code: 'ap-east-2',
    shortCode: 'APE2',
    nameZh: '台北 (Taipei)',
    nameEn: 'Asia Pacific (Taipei)',
    location: 'Taiwan',
    color: '#10b981'
  },
  'APE1': {
    code: 'ap-east-1',
    shortCode: 'APE1',
    nameZh: '香港 (Hong Kong)',
    nameEn: 'Asia Pacific (Hong Kong)',
    location: 'Hong Kong',
    color: '#06b6d4'
  },
  'APN2': {
    code: 'ap-northeast-2',
    shortCode: 'APN2',
    nameZh: '首爾 (Seoul)',
    nameEn: 'Asia Pacific (Seoul)',
    location: 'South Korea',
    color: '#8b5cf6'
  },
  'APN3': {
    code: 'ap-northeast-3',
    shortCode: 'APN3',
    nameZh: '大阪 (Osaka)',
    nameEn: 'Asia Pacific (Osaka)',
    location: 'Japan',
    color: '#6366f1'
  },
  'APS1': {
    code: 'ap-southeast-1',
    shortCode: 'APS1',
    nameZh: '新加坡 (Singapore)',
    nameEn: 'Asia Pacific (Singapore)',
    location: 'Singapore',
    color: '#ec4899'
  },
  'APS2': {
    code: 'ap-southeast-2',
    shortCode: 'APS2',
    nameZh: '雪梨 (Sydney)',
    nameEn: 'Asia Pacific (Sydney)',
    location: 'Australia',
    color: '#f59e0b'
  },
  'APS3': {
    code: 'ap-south-1',
    shortCode: 'APS3',
    nameZh: '孟買 (Mumbai)',
    nameEn: 'Asia Pacific (Mumbai)',
    location: 'India',
    color: '#f97316'
  },
  'APS4': {
    code: 'ap-southeast-3',
    shortCode: 'APS4',
    nameZh: '雅加達 (Jakarta)',
    nameEn: 'Asia Pacific (Jakarta)',
    location: 'Indonesia',
    color: '#14b8a6'
  },
  'APS5': {
    code: 'ap-southeast-5',
    shortCode: 'APS5',
    nameZh: '馬來西亞 (Malaysia)',
    nameEn: 'Asia Pacific (Malaysia)',
    location: 'Malaysia',
    color: '#84cc16'
  },
  'USE1': {
    code: 'us-east-1',
    shortCode: 'USE1',
    nameZh: '維吉尼亞 (N. Virginia)',
    nameEn: 'US East (N. Virginia)',
    location: 'US East',
    color: '#3b82f6'
  },
  'USE2': {
    code: 'us-east-2',
    shortCode: 'USE2',
    nameZh: '俄亥俄 (Ohio)',
    nameEn: 'US East (Ohio)',
    location: 'US East',
    color: '#60a5fa'
  },
  'USW1': {
    code: 'us-west-1',
    shortCode: 'USW1',
    nameZh: '加州 (N. California)',
    nameEn: 'US West (N. California)',
    location: 'US West',
    color: '#a855f7'
  },
  'USW2': {
    code: 'us-west-2',
    shortCode: 'USW2',
    nameZh: '奧勒岡 (Oregon)',
    nameEn: 'US West (Oregon)',
    location: 'US West',
    color: '#c084fc'
  },
  'EUC1': {
    code: 'eu-central-1',
    shortCode: 'EUC1',
    nameZh: '法蘭克福 (Frankfurt)',
    nameEn: 'Europe (Frankfurt)',
    location: 'Europe',
    color: '#eab308'
  },
  'EUW1': {
    code: 'eu-west-1',
    shortCode: 'EUW1',
    nameZh: '愛爾蘭 (Ireland)',
    nameEn: 'Europe (Ireland)',
    location: 'Europe',
    color: '#22c55e'
  },
  'EUW2': {
    code: 'eu-west-2',
    shortCode: 'EUW2',
    nameZh: '倫敦 (London)',
    nameEn: 'Europe (London)',
    location: 'Europe',
    color: '#16a34a'
  },
  'EUW3': {
    code: 'eu-west-3',
    shortCode: 'EUW3',
    nameZh: '巴黎 (Paris)',
    nameEn: 'Europe (Paris)',
    location: 'Europe',
    color: '#059669'
  },
  'EUN1': {
    code: 'eu-north-1',
    shortCode: 'EUN1',
    nameZh: '斯德哥爾摩 (Stockholm)',
    nameEn: 'Europe (Stockholm)',
    location: 'Europe',
    color: '#0284c7'
  },
  'CAC1': {
    code: 'ca-central-1',
    shortCode: 'CAC1',
    nameZh: '加拿大中部 (Central)',
    nameEn: 'Canada (Central)',
    location: 'Canada',
    color: '#dc2626'
  },
  'SAE1': {
    code: 'sa-east-1',
    shortCode: 'SAE1',
    nameZh: '聖保羅 (São Paulo)',
    nameEn: 'South America (São Paulo)',
    location: 'South America',
    color: '#ea580c'
  },
  'MEC1': {
    code: 'me-central-1',
    shortCode: 'MEC1',
    nameZh: '中東 (Middle East)',
    nameEn: 'Middle East (UAE/Bahrain)',
    location: 'Middle East',
    color: '#d97706'
  },
  'AFN1': {
    code: 'af-south-1',
    shortCode: 'AFN1',
    nameZh: '開普敦 (Cape Town)',
    nameEn: 'Africa (Cape Town)',
    location: 'Africa',
    color: '#7c3aed'
  },
  'GLOBAL': {
    code: 'global',
    shortCode: 'GLOBAL',
    nameZh: '全球服務 (Global / CloudFront / Route53)',
    nameEn: 'Global / Multi-Region',
    location: 'Global',
    color: '#64748b'
  }
};

/**
 * Parses the AWS Region and AZ from usageType, productName, and itemDescription
 */
export function parseRegionAndAz(
  productName: string = '',
  usageType: string = '',
  itemDescription: string = ''
): { regionCode: string; regionInfo: RegionInfo; azCode: string; azDisplay: string } {
  const cleanUsage = usageType.trim();
  const cleanDesc = itemDescription.trim();
  const lowerDesc = cleanDesc.toLowerCase();
  const upperUsage = cleanUsage.toUpperCase();

  let detectedPrefix = 'GLOBAL';

  // 1. Check UsageType prefix (e.g., APN1-BoxUsage, APE2-DataTransfer, USE1-...)
  const prefixMatch = upperUsage.match(/^([A-Z]{2,4}[0-9]?)-/);
  if (prefixMatch && AWS_REGION_MAP[prefixMatch[1]]) {
    detectedPrefix = prefixMatch[1];
  } else {
    // 2. Check region code in usageType or itemDescription
    if (upperUsage.includes('APN1') || lowerDesc.includes('tokyo') || lowerDesc.includes('ap-northeast-1')) {
      detectedPrefix = 'APN1';
    } else if (upperUsage.includes('APE2') || lowerDesc.includes('taipei') || lowerDesc.includes('ap-east-2')) {
      detectedPrefix = 'APE2';
    } else if (upperUsage.includes('APE1') || lowerDesc.includes('hong kong') || lowerDesc.includes('ap-east-1')) {
      detectedPrefix = 'APE1';
    } else if (upperUsage.includes('APS1') || lowerDesc.includes('singapore') || lowerDesc.includes('ap-southeast-1')) {
      detectedPrefix = 'APS1';
    } else if (upperUsage.includes('APS2') || lowerDesc.includes('sydney') || lowerDesc.includes('ap-southeast-2')) {
      detectedPrefix = 'APS2';
    } else if (upperUsage.includes('APN2') || lowerDesc.includes('seoul') || lowerDesc.includes('ap-northeast-2')) {
      detectedPrefix = 'APN2';
    } else if (upperUsage.includes('APN3') || lowerDesc.includes('osaka') || lowerDesc.includes('ap-northeast-3')) {
      detectedPrefix = 'APN3';
    } else if (upperUsage.includes('APS3') || lowerDesc.includes('mumbai') || lowerDesc.includes('ap-south-1')) {
      detectedPrefix = 'APS3';
    } else if (upperUsage.includes('USE1') || lowerDesc.includes('virginia') || lowerDesc.includes('us-east-1')) {
      detectedPrefix = 'USE1';
    } else if (upperUsage.includes('USE2') || lowerDesc.includes('ohio') || lowerDesc.includes('us-east-2')) {
      detectedPrefix = 'USE2';
    } else if (upperUsage.includes('USW2') || lowerDesc.includes('oregon') || lowerDesc.includes('us-west-2')) {
      detectedPrefix = 'USW2';
    } else if (upperUsage.includes('USW1') || lowerDesc.includes('california') || lowerDesc.includes('us-west-1')) {
      detectedPrefix = 'USW1';
    } else if (upperUsage.includes('EUC1') || lowerDesc.includes('frankfurt') || lowerDesc.includes('eu-central-1')) {
      detectedPrefix = 'EUC1';
    } else if (upperUsage.includes('EUW1') || lowerDesc.includes('ireland') || lowerDesc.includes('eu-west-1')) {
      detectedPrefix = 'EUW1';
    } else if (upperUsage.includes('EUW2') || lowerDesc.includes('london') || lowerDesc.includes('eu-west-2')) {
      detectedPrefix = 'EUW2';
    } else if (productName.includes('CloudFront') || productName.includes('Route 53') || productName.includes('IAM')) {
      detectedPrefix = 'GLOBAL';
    } else if (upperUsage.startsWith('GLOBAL-') || lowerDesc.includes('global')) {
      detectedPrefix = 'GLOBAL';
    } else {
      // Default fallback if no region found
      detectedPrefix = 'GLOBAL';
    }
  }

  const regionInfo = AWS_REGION_MAP[detectedPrefix] || {
    code: detectedPrefix.toLowerCase(),
    shortCode: detectedPrefix,
    nameZh: detectedPrefix,
    nameEn: detectedPrefix,
    location: 'Other',
    color: '#64748b'
  };

  // 3. Detect Availability Zone (AZ)
  let azCode = 'Regional / Multi-AZ';
  let azDisplay = `${regionInfo.shortCode} (Regional)`;

  // Match explicit AZ patterns like APN1-AZ1, APE2-AZ1, USE1-AZ2, etc.
  const azMatch = upperUsage.match(/(?:APN1|APE2|APE1|APS1|APS2|APS3|APN2|USE1|USE2|USW1|USW2|EUC1|EUW1)-AZ([0-9]+)/i);
  if (azMatch) {
    const azNum = azMatch[1];
    azCode = `${detectedPrefix}-AZ${azNum}`;
    azDisplay = `${detectedPrefix}-AZ${azNum} (可用區 ${azNum})`;
  } else {
    // Check for zone letters in description or usage (e.g. ap-northeast-1a, zone a)
    const zoneLetterMatch = lowerDesc.match(/zone\s+([a-f])\b|in\s+([a-z0-9\-]+[a-f])\b/i);
    if (zoneLetterMatch) {
      const letter = (zoneLetterMatch[1] || zoneLetterMatch[2]).slice(-1).toUpperCase();
      azCode = `${detectedPrefix}-${letter}`;
      azDisplay = `${detectedPrefix}-Zone ${letter}`;
    } else if (lowerDesc.includes('multi-az') || upperUsage.includes('MULTIAZ')) {
      azCode = `${detectedPrefix}-Multi-AZ`;
      azDisplay = `${detectedPrefix} Multi-AZ (高可用多區)`;
    } else if (detectedPrefix === 'GLOBAL') {
      azCode = 'Global-Edge';
      azDisplay = 'Global Edge / Non-AZ';
    } else {
      azCode = `${detectedPrefix}-Regional`;
      azDisplay = `${detectedPrefix} 區域彙總 (Regional / Unspecified AZ)`;
    }
  }

  return {
    regionCode: detectedPrefix,
    regionInfo,
    azCode,
    azDisplay
  };
}
