import {
  AbilityBuilder,
  createMongoAbility,
  MongoAbility,
} from "@casl/ability";
import type { Actions, Subjects, AuthUser } from "./types";

export type AppAbility = MongoAbility<[Actions, Subjects]>;

export function defineAbilityFor(user: AuthUser): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

  if (user.role === "admin") {
    can("manage", "all");
  } else {
    can("read", "all");
    can("update", "User");
  }

  return build();
}
