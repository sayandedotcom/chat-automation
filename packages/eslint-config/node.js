import { config as baseConfig } from "./base.js";

export const nodeConfig = [
  ...baseConfig,
  {
    rules: {
      "no-console": "off",
      eqeqeq: ["error", "always"],
    },
  },
];
