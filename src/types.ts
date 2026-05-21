export interface Admin {
  email: string;
  grantedBy: string;
  createdAt: any; // Timestamp
}

export interface Ticket {
  id?: string;
  firstName: string;
  lastName: string;
  studentClass: string;
  amount: number;
  createdBy: string;
  createdAt: any; // Timestamp
  scanned: boolean;
  scannedAt: any | null; // Timestamp
}

export interface GlobalSettings {
  scanActive: boolean;
  updatedBy: string;
  updatedAt: any;
}
