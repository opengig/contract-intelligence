import { defineAbilityFor, type AuthUser } from "@repo/auth";

const mockUser: AuthUser = { id: "1", role: "admin" };

export const ability = defineAbilityFor(mockUser);
