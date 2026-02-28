import { config as baseConfig } from "./base.js";

export const nodeConfig = [
  ...baseConfig,
  {
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        Buffer: "readonly",
        global: "readonly",
        module: "readonly",
        require: "readonly",
      },
    },
    rules: {
      "no-console": "off",
    },
  },
];
