export type ServiceCategory = 
  | 'AI' 
  | 'Compute' 
  | 'DB' 
  | 'Network' 
  | 'Security' 
  | 'Storage' 
  | '韌性' 
  | 'Other';

export interface CategoryMeta {
  id: ServiceCategory;
  name: string;
  enName: string;
  icon: string;
  color: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
  description: string;
}

export const CATEGORY_METAS: Record<ServiceCategory, CategoryMeta> = {
  'AI': {
    id: 'AI',
    name: 'AI (人工智慧與機器學習)',
    enName: 'AI & Machine Learning',
    icon: '🤖',
    color: '#8b5cf6', // purple
    bgColor: 'bg-purple-900/30',
    borderColor: 'border-purple-500/50',
    textColor: 'text-purple-300',
    description: 'Amazon Bedrock, SageMaker, Q, Rekognition, Claude 模型與 GenAI 服務'
  },
  'Compute': {
    id: 'Compute',
    name: 'Compute (運算服務)',
    enName: 'Compute & Containers',
    icon: '⚡',
    color: '#3b82f6', // blue
    bgColor: 'bg-blue-900/30',
    borderColor: 'border-blue-500/50',
    textColor: 'text-blue-300',
    description: 'EC2, Lambda, ECS, EKS, Glue, Marketplace OS 鏡像與運算資源'
  },
  'DB': {
    id: 'DB',
    name: 'DB (資料庫服務)',
    enName: 'Database & Analytics Store',
    icon: '🗄️',
    color: '#10b981', // emerald
    bgColor: 'bg-emerald-900/30',
    borderColor: 'border-emerald-500/50',
    textColor: 'text-emerald-300',
    description: 'RDS, DynamoDB, ElastiCache, Redshift, Athena, DocDB, OpenSearch'
  },
  'Network': {
    id: 'Network',
    name: 'Network (網路與分發)',
    enName: 'Networking & Content Delivery',
    icon: '🌐',
    color: '#06b6d4', // cyan
    bgColor: 'bg-cyan-900/30',
    borderColor: 'border-cyan-500/50',
    textColor: 'text-cyan-300',
    description: 'CloudFront, API Gateway, DirectConnect, GlobalAccelerator, DataTransfer'
  },
  'Security': {
    id: 'Security',
    name: 'Security (資安與合規)',
    enName: 'Security, Identity & Compliance',
    icon: '🛡️',
    color: '#f43f5e', // rose
    bgColor: 'bg-rose-900/30',
    borderColor: 'border-rose-500/50',
    textColor: 'text-rose-300',
    description: 'WAF, GuardDuty, KMS, SecretsManager, SecurityHub, Shield, IAM, ACM'
  },
  'Storage': {
    id: 'Storage',
    name: 'Storage (儲存服務)',
    enName: 'Storage & Transfer',
    icon: '📦',
    color: '#f59e0b', // amber
    bgColor: 'bg-amber-900/30',
    borderColor: 'border-amber-500/50',
    textColor: 'text-amber-300',
    description: 'S3, EFS, FSx, Glacier, StorageGateway, Transfer Family'
  },
  '韌性': {
    id: '韌性',
    name: '韌性 (架構韌性與高可用)',
    enName: 'Resilience & High Availability',
    icon: '🔄',
    color: '#14b8a6', // teal
    bgColor: 'bg-teal-900/30',
    borderColor: 'border-teal-500/50',
    textColor: 'text-teal-300',
    description: 'CloudWatch, Route53, ELB, Backup, Elastic Disaster Recovery, VPC, X-Ray, FIS'
  },
  'Other': {
    id: 'Other',
    name: 'Other (其他與整合服務)',
    enName: 'Integration & Governance',
    icon: '🧩',
    color: '#6b7280', // gray
    bgColor: 'bg-gray-800/60',
    borderColor: 'border-gray-600/50',
    textColor: 'text-gray-300',
    description: 'SNS, SQS, SES, MSK, Kinesis, MQ, CostExplorer, Enterprise Support'
  }
};

export const ALL_CATEGORIES: ServiceCategory[] = [
  'AI',
  'Compute',
  'DB',
  'Network',
  'Security',
  'Storage',
  '韌性',
  'Other'
];

/**
 * Exact mapping as provided by the user definition
 */
const EXACT_CATEGORY_MAP: Record<string, ServiceCategory> = {
  // === AI ===
  'AmazonBedrock': 'AI',
  'AmazonBedrockAgentCore': 'AI',
  'AmazonDevOpsGuru': 'AI',
  'AmazonPolly': 'AI',
  'AmazonQ': 'AI',
  'AmazonQuickSight': 'AI',
  'AmazonRekognition': 'AI',
  'AmazonSageMaker': 'AI',
  'AmazonTextract': 'AI',
  'AWS Marketplace-Claude 3 Haiku (Amazon Bedrock Edition)': 'AI',
  'AWS Marketplace-Claude 3 Opus (Amazon Bedrock Edition)': 'AI',
  'AWS Marketplace-Claude 3 Sonnet (Amazon Bedrock Edition)': 'AI',
  'AWS Marketplace-Claude 3.5 Haiku (Amazon Bedrock Edition)': 'AI',
  'AWS Marketplace-Claude 3.5 Sonnet (Amazon Bedrock Edition)': 'AI',
  'AWS Marketplace-Claude 3.5 Sonnet v2 (Amazon Bedrock Edition)': 'AI',
  'AWS Marketplace-Claude 3.7 Sonnet (Amazon Bedrock Edition)': 'AI',
  'AWS Marketplace-Claude Haiku 4.5 (Amazon Bedrock Edition)': 'AI',
  'AWS Marketplace-Claude Opus 4 (Amazon Bedrock Edition)': 'AI',
  'AWS Marketplace-Claude Opus 4.1 (Amazon Bedrock Edition)': 'AI',
  'AWS Marketplace-Claude Opus 4.5 (Amazon Bedrock Edition)': 'AI',
  'AWS Marketplace-Claude Opus 4.6 (Amazon Bedrock Edition)': 'AI',
  'AWS Marketplace-Claude Sonnet 4 (Amazon Bedrock Edition)': 'AI',
  'AWS Marketplace-Claude Sonnet 4.5 (Amazon Bedrock Edition)': 'AI',
  'AWS Marketplace-Claude Sonnet 4.6 (Amazon Bedrock Edition)': 'AI',
  'AWS Marketplace-Cohere Command R (Amazon Bedrock Edition)': 'AI',
  'AWS Marketplace-Cohere Rerank v3.5 (Amazon Bedrock Edition)': 'AI',
  'AWS Marketplace-Jamba 1.5 Large (Amazon Bedrock Edition)': 'AI',
  'AWS Marketplace-Jamba 1.5 Mini (Amazon Bedrock Edition)': 'AI',
  'AWS Marketplace-Palmyra X4 (Amazon Bedrock Edition)': 'AI',
  'AWS Marketplace-Stable Image Core (Amazon Bedrock Edition)': 'AI',
  'Kiro': 'AI',
  'transcribe': 'AI',
  'AmazonTranscribe': 'AI',
  'AmazonTranslate': 'AI',
  'AmazonComprehend': 'AI',
  'AmazonLex': 'AI',
  'AmazonKendra': 'AI',

  // === Compute ===
  'AmazonEC2': 'Compute',
  'AmazonECR': 'Compute',
  'AmazonECRPublic': 'Compute',
  'AmazonECS': 'Compute',
  'AmazonEKS': 'Compute',
  'AmazonLightsail': 'Compute',
  'AmazonWorkSpaces': 'Compute',
  'AWS Marketplace-Oracle Linux 8 | Support by SupportedImages': 'Compute',
  'AWS Marketplace-Oracle Linux 8.5': 'Compute',
  'AWS Marketplace-Oracle Linux 8.6': 'Compute',
  'AWS Marketplace-Oracle Linux 9': 'Compute',
  'AWS Marketplace-Oracle Linux 9 | Support by SupportedImages': 'Compute',
  'AWS Marketplace-Red Hat Enterprise Linux (RHEL) for AWS': 'Compute',
  'AWS Marketplace-Rocky Linux 10 (Official) - x86_64': 'Compute',
  'AWS Marketplace-Windows Server 2022 Chinese Traditional | Support by ProComputers': 'Compute',
  'AWS Marketplace-Windows Server 2025 Chinese Traditional | Support by ProComputers': 'Compute',
  'AWSAppRunner': 'Compute',
  'AWSCloudFormation': 'Compute',
  'AWSGlue': 'Compute',
  'AWSLambda': 'Compute',
  'AWSOutposts': 'Compute',
  'AWSServiceCatalog': 'Compute',
  'AWSSystemsManager': 'Compute',
  'CodeBuild': 'Compute',
  'ComputeSavingsPlans': 'Compute',

  // === DB ===
  'AmazonAthena': 'DB',
  'AmazonDocDB': 'DB',
  'AmazonDynamoDB': 'DB',
  'AmazonElastiCache': 'DB',
  'AmazonES': 'DB',
  'AmazonRDS': 'DB',
  'AmazonRDSOCPULicenseFees': 'DB',
  'AmazonRedshift': 'DB',
  'AmazonSimpleDB': 'DB',
  'AWS Marketplace-MongoDB Atlas (pay-as-you-go)': 'DB',
  'AWSDatabaseMigrationSvc': 'DB',
  'AmazonOpenSearchService': 'DB',
  'AmazonNeptune': 'DB',
  'AmazonMemoryDB': 'DB',

  // === Network ===
  'AmazonApiGateway': 'Network',
  'AmazonCloudFront': 'Network',
  'AmazonLocationService': 'Network',
  'AmazonPinpoint': 'Network',
  'AmazonRegistrar': 'Network',
  'AWSCloudMap': 'Network',
  'AWSDataTransfer': 'Network',
  'AWSDirectConnect': 'Network',
  'AWSGlobalAccelerator': 'Network',

  // === Other ===
  'AmazonKinesisAnalytics': 'Other',
  'AmazonKinesisFirehose': 'Other',
  'AmazonKinesisVideo': 'Other',
  'AmazonMQ': 'Other',
  'AmazonMSK': 'Other',
  'AmazonSES': 'Other',
  'AmazonSNS': 'Other',
  'AmazonWorkMail': 'Other',
  'AWSBudgets': 'Other',
  'AWSCodeArtifact': 'Other',
  'AWSCostExplorer': 'Other',
  'AWSIoT': 'Other',
  'AWSMigrationHubRefactorSpaces': 'Other',
  'AWSQueueService': 'Other',
  'AWSSupportEnterprise': 'Other',
  'AWSCodeCommit': 'Other',
  'AWSCodePipeline': 'Other',
  'AWSCodeDeploy': 'Other',

  // === Security ===
  'ACM': 'Security',
  'AmazonCognito': 'Security',
  'AmazonDetective': 'Security',
  'AmazonGuardDuty': 'Security',
  'AmazonInspectorV2': 'Security',
  'AmazonInspector': 'Security',
  'AmazonMacie': 'Security',
  'auditmanager': 'Security',
  'AWS Marketplace-Cloudbric Managed Rules for AWS WAF - OWASP Top 10 Rule Set': 'Security',
  'AWS Marketplace-Cyber Security Cloud Managed Rules for AWS WAF -HighSecurity OWASP Set-': 'Security',
  'AWSCertificateManager': 'Security',
  'AWSCloudTrail': 'Security',
  'AWSConfig': 'Security',
  'AWSDirectoryService': 'Security',
  'AWSIAMAccessAnalyzer': 'Security',
  'awskms': 'Security',
  'AWSKeyManagementService': 'Security',
  'AWSNetworkFirewall': 'Security',
  'AWSSecretsManager': 'Security',
  'AWSSecurityHub': 'Security',
  'awswaf': 'Security',
  'AWSShield': 'Security',
  'AWSShieldAdvanced': 'Security',

  // === Storage ===
  'AmazonEFS': 'Storage',
  'AmazonFSx': 'Storage',
  'AmazonGlacier': 'Storage',
  'AmazonS3': 'Storage',
  'AWSDataSync': 'Storage',
  'AWSStorageGateway': 'Storage',
  'AWSTransfer': 'Storage',
  'AWSElasticBlockStore': 'Storage',

  // === 韌性 (Resilience) ===
  'AmazonCloudWatch': '韌性',
  'AmazonGrafana': '韌性',
  'AmazonPrometheus': '韌性',
  'AmazonRoute53': '韌性',
  'AmazonStates': '韌性',
  'AmazonStepFunctions': '韌性',
  'AmazonVPC': '韌性',
  'AWSBackup': '韌性',
  'AWSElasticDisasterRecovery': '韌性',
  'AWSELB': '韌性',
  'AWSEvents': '韌性',
  'AWSEventBridge': '韌性',
  'AWSFIS': '韌性',
  'AWSXRay': '韌性',
  'AWSRoute53': '韌性'
};

// Normalize key by stripping spaces, dashes, underscores, and lowercasing
const buildNormalizedMap = () => {
  const normMap = new Map<string, ServiceCategory>();
  Object.entries(EXACT_CATEGORY_MAP).forEach(([k, cat]) => {
    const compact = k.toLowerCase().replace(/[\s\-_.:|()]+/g, '');
    normMap.set(compact, cat);
  });
  return normMap;
};

const NORMALIZED_CATEGORY_MAP = buildNormalizedMap();

/**
 * Determine the Service Category for any AWS Product Name or billing item
 */
export const getServiceCategory = (
  productName: string, 
  usageType: string = '', 
  description: string = ''
): ServiceCategory => {
  if (!productName) return 'Other';

  const rawTrimmed = productName.trim();

  // 1. Direct exact lookup
  if (EXACT_CATEGORY_MAP[rawTrimmed]) {
    return EXACT_CATEGORY_MAP[rawTrimmed];
  }

  // 2. Compact normalized lookup
  const compactName = rawTrimmed.toLowerCase().replace(/[\s\-_.:|()]+/g, '');
  if (NORMALIZED_CATEGORY_MAP.has(compactName)) {
    return NORMALIZED_CATEGORY_MAP.get(compactName)!;
  }

  const fullText = `${productName} ${usageType} ${description}`.toLowerCase();
  const compactFull = fullText.replace(/[\s\-_.:|()]+/g, '');

  // 3. AI Patterns
  if (
    compactFull.includes('bedrock') ||
    compactFull.includes('sagemaker') ||
    compactFull.includes('amazonq') ||
    compactFull.includes('claude') ||
    compactFull.includes('cohere') ||
    compactFull.includes('jamba') ||
    compactFull.includes('palmyra') ||
    compactFull.includes('stableimage') ||
    compactFull.includes('rekognition') ||
    compactFull.includes('textract') ||
    compactFull.includes('polly') ||
    compactFull.includes('transcribe') ||
    compactFull.includes('translate') ||
    compactFull.includes('comprehend') ||
    compactFull.includes('devopsguru') ||
    compactFull.includes('quicksight') ||
    compactFull.includes('kiro')
  ) {
    return 'AI';
  }

  // 4. Resilience (韌性) Patterns
  if (
    compactFull.includes('cloudwatch') ||
    compactFull.includes('grafana') ||
    compactFull.includes('prometheus') ||
    compactFull.includes('route53') ||
    compactFull.includes('states') ||
    compactFull.includes('stepfunctions') ||
    compactFull.includes('vpc') ||
    compactFull.includes('backup') ||
    compactFull.includes('elasticdisaster') ||
    compactFull.includes('disasterrecovery') ||
    compactFull.includes('elb') ||
    compactFull.includes('loadbalancing') ||
    compactFull.includes('elasticloadbalancing') ||
    compactFull.includes('eventbridge') ||
    compactFull.includes('awsevents') ||
    compactFull.includes('awsfis') ||
    compactFull.includes('xray')
  ) {
    return '韌性';
  }

  // 5. Security Patterns
  if (
    compactFull.includes('guardduty') ||
    compactFull.includes('inspector') ||
    compactFull.includes('macie') ||
    compactFull.includes('detective') ||
    compactFull.includes('auditmanager') ||
    compactFull.includes('waf') ||
    compactFull.includes('certificatemanager') ||
    compactFull.includes('cloudtrail') ||
    compactFull.includes('awsconfig') ||
    compactFull.includes('directoryservice') ||
    compactFull.includes('accessanalyzer') ||
    compactFull.includes('awskms') ||
    compactFull.includes('keymanagementservice') ||
    compactFull.includes('networkfirewall') ||
    compactFull.includes('secretsmanager') ||
    compactFull.includes('securityhub') ||
    compactFull.includes('cognito') ||
    compactFull.includes('shield')
  ) {
    return 'Security';
  }

  // 6. DB Patterns
  if (
    compactFull.includes('rds') ||
    compactFull.includes('dynamodb') ||
    compactFull.includes('elasticache') ||
    compactFull.includes('amazones') ||
    compactFull.includes('opensearch') ||
    compactFull.includes('redshift') ||
    compactFull.includes('athena') ||
    compactFull.includes('docdb') ||
    compactFull.includes('simpledb') ||
    compactFull.includes('mongodbatlas') ||
    compactFull.includes('databasemigrationsvc') ||
    compactFull.includes('dms') ||
    compactFull.includes('neptune')
  ) {
    return 'DB';
  }

  // 7. Storage Patterns
  if (
    compactFull.includes('amazons3') ||
    compactFull.includes('simple storage service') ||
    compactFull.includes('efs') ||
    compactFull.includes('fsx') ||
    compactFull.includes('glacier') ||
    compactFull.includes('datasync') ||
    compactFull.includes('storagegateway') ||
    compactFull.includes('transfer')
  ) {
    return 'Storage';
  }

  // 8. Network Patterns
  if (
    compactFull.includes('apigateway') ||
    compactFull.includes('cloudfront') ||
    compactFull.includes('locationservice') ||
    compactFull.includes('pinpoint') ||
    compactFull.includes('registrar') ||
    compactFull.includes('cloudmap') ||
    compactFull.includes('datatransfer') ||
    compactFull.includes('directconnect') ||
    compactFull.includes('globalaccelerator')
  ) {
    return 'Network';
  }

  // 9. Compute Patterns
  if (
    compactFull.includes('ec2') ||
    compactFull.includes('elastic compute cloud') ||
    compactFull.includes('ecr') ||
    compactFull.includes('ecs') ||
    compactFull.includes('eks') ||
    compactFull.includes('lambda') ||
    compactFull.includes('glue') ||
    compactFull.includes('cloudformation') ||
    compactFull.includes('apprunner') ||
    compactFull.includes('lightsail') ||
    compactFull.includes('workspaces') ||
    compactFull.includes('outposts') ||
    compactFull.includes('servicecatalog') ||
    compactFull.includes('systemsmanager') ||
    compactFull.includes('codebuild') ||
    compactFull.includes('computesavingsplans') ||
    compactFull.includes('linux') ||
    compactFull.includes('windows server')
  ) {
    return 'Compute';
  }

  // 10. Default fallback
  return 'Other';
};
