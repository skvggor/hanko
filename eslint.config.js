import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

const sources = ["src/**/*.{ts,tsx}", "aliases.ts", "*.config.{ts,js}"];
const tests = "src/**/*.{test.ts,test.tsx}";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "coverage/**",
      ".wrangler/**",
      "node_modules/**",
      "eslint.config.js",
      "scripts/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: sources,
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        project: ["./tsconfig.json", "./tsconfig.worker.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always", { null: "ignore" }],
    },
  },
  {
    files: ["src/infra/**"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.worker },
    },
    rules: { "no-console": "off" },
  },
  {
    files: [tests, "src/test/**"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
    },
  },
);