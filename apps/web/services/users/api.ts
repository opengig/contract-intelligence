import { apiClient } from "@/lib/api-client";
import type { User, CreateUserPayload, UpdateUserPayload } from "./types";

export const getUsers = () => apiClient<User[]>("/users");

export const getUser = (id: string) => apiClient<User>(`/users/${id}`);

export const createUser = (data: CreateUserPayload) =>
  apiClient<User>("/users", { method: "POST", body: JSON.stringify(data) });

export const updateUser = (id: string, data: UpdateUserPayload) =>
  apiClient<User>(`/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
