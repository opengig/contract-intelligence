export interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
}

export interface CreateUserPayload {
  email: string;
  name?: string;
  role?: string;
}

export interface UpdateUserPayload {
  name?: string;
  role?: string;
}
