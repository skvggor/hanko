import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import sonarjs from "eslint-plugin-sonarjs";
import tseslint from "typescript-eslint";

const sources = ["src/**/*.{ts,tsx}", "aliases.ts", "*.config.{ts,js}"];
const scripts = "scripts/**/*.mjs";
const tests = "src/**/*.{test.ts,test.tsx}";

/**
 * The Sonar rules that restate a decision this repository has already made, or that push
 * against a convention it documents. Each one is off for a reason and not because it was
 * noisy the first time it ran. They are declared once because the sources and the scripts
 * are held to the same set, and a rule that applies to one and not the other is a rule
 * somebody has to remember.
 *
 * `no-unused-vars` is already covered by the typescript-eslint rule below, which passes;
 * the only things it adds here are the underscore prefixed test variables the repository
 * keeps on purpose.
 *
 * `deprecation` names `FormEvent` as deprecated, and @types/react 19.3.0 does not say so.
 * The rule takes no options, so it cannot be scoped away from React, and this repository
 * does not carry inline disables. The genuine half of it was real: the Phosphor icons in
 * this tree were on their deprecated aliases and have been renamed to `Icon` exports.
 *
 * `prefer-specific-assertions`, `parameterized-tests` and `no-alphabetical-sort` each ask
 * for a house style this repository does not use: assertions are spelled out, test names
 * are behavioural sentences rather than generated ones, and the ordering in the
 * translation parity test is deliberate.
 */
const SONAR_DECISIONS = {
  "sonarjs/no-unused-vars": "off",
  "sonarjs/deprecation": "off",
  "sonarjs/prefer-specific-assertions": "off",
  "sonarjs/parameterized-tests": "off",
  "sonarjs/no-alphabetical-sort": "off",
};

/**
 * The rules that ask a value to carry a type. They say something real about TypeScript
 * source and nothing about a test fixture shaped by hand or a script reading JSON off a
 * socket, where every boundary is `any` by construction and the type is not what is being
 * checked. The rest of the type-aware rules still apply to both.
 */
const UNTYPED_BOUNDARIES = {
  "@typescript-eslint/no-non-null-assertion": "off",
  "@typescript-eslint/require-await": "off",
  "@typescript-eslint/no-unsafe-assignment": "off",
  "@typescript-eslint/no-unsafe-member-access": "off",
  "@typescript-eslint/no-unsafe-argument": "off",
  "@typescript-eslint/no-unsafe-call": "off",
  "@typescript-eslint/no-unsafe-return": "off",
  "@typescript-eslint/only-throw-error": "off",
};

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "coverage/**",
      ".wrangler/**",
      "node_modules/**",
      "eslint.config.js",
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
    plugins: { "react-hooks": reactHooks, sonarjs },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...sonarjs.configs.recommended.rules,
      ...SONAR_DECISIONS,
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
    /**
     * The scripts are Node rather than the browser, and one of them is what makes the
     * quality gate mean anything, so leaving them outside both gates is how a broken gate
     * goes unnoticed. They need their own block because the typed rules have to be told
     * which project holds them.
     */
    files: [scripts],
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        project: ["./tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { sonarjs },
    rules: {
      ...sonarjs.configs.recommended.rules,
      ...SONAR_DECISIONS,
      ...UNTYPED_BOUNDARIES,
      "no-console": "off",
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
    rules: UNTYPED_BOUNDARIES,
  },
);