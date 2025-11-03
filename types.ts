export interface ServiceDetail {
  productName: string;
  usageType: string;
  itemDescription: string;
  unitPrice: number;
  usages: number;
  totalCost: number;
  accountId: string;
  accountName: string;
  month: string;
}

export interface Service {
  productName: string;
  totalCost: number;
  details: ServiceDetail[];
}

export interface AccountData {
  accountId: string;
  accountName: string;
  totalAmount: number;
  currency: string;
  services: Service[];
}

export interface MonthlyBillingData {
  month: string;
  accounts: AccountData[];
  totalAmount: number;
}

export type BillingData = MonthlyBillingData[];

export interface PerAccountChange {
  accountId: string;
  accountName: string;
  monthlyTotals: { [month: string]: number | undefined };
}