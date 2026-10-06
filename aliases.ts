import { fileURLToPath } from "node:url";

const resolvePath = (relativePath: string) =>
  fileURLToPath(new URL(relativePath, import.meta.url));

export const pathAliases = {
  "@domain": resolvePath("./src/domain"),
  "@application": resolvePath("./src/application"),
  "@infra": resolvePath("./src/infra"),
  "@presentation": resolvePath("./src/presentation"),
  "@config": resolvePath("./src/config"),
};