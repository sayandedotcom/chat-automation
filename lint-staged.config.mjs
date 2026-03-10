/**
 * @type {import('lint-staged').Configuration}
 */
export default {
  "(apps|packages)/**/*.{js,ts,jsx,tsx}": ["prettier --write", "eslint --fix"],
  "*.{json,md,mjs,cjs}": "prettier --write",
  "apps/agent/**/*.py": () =>
    "cd apps/agent && uv run ruff check --fix && uv run ruff format",
  "packages/database/prisma/schema.prisma": "prisma format",
};
