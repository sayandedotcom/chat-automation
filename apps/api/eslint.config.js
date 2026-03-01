import { nodeConfig } from "@workspace/eslint-config/node";

/** @type {import("eslint").Linter.Config} */
export default [
  ...nodeConfig,
  {
    ignores: [".sst/**", "dist/**"],
  },
  {
    files: ["**/__tests__/**/*.ts", "**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
];
