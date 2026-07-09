export interface Client {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateClientPayload {
  name: string;
}
