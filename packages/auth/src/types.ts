export type Role = "admin" | "user";

export interface AuthUser {
  id: string;
  role: Role;
}

export type Actions = "manage" | "create" | "read" | "update" | "delete";
export type Subjects = "Post" | "User" | "all";
