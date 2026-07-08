export interface Vendor {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVendorPayload {
  name: string;
}
