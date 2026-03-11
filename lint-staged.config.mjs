/**
 * @type {import('lint-staged').Configuration}
 */
export default {
  "(apps|packages)/**/*.{js,ts,jsx,tsx}": ["prettier --write", "eslint --fix"],
  "*.{json,md,mjs,cjs}": "prettier --write",
  "apps/agent/**/*.py": (files) => {
    const relativeFiles = files
      .map((f) => f.replace(/^apps\/agent\//, ""))
      .join(" ");
    return `sh -c 'cd apps/agent && /home/sayan/.local/bin/uv run ruff check --fix ${relativeFiles} && /home/sayan/.local/bin/uv run ruff format ${relativeFiles}'`;
  },
  "packages/database/prisma/schema.prisma": "prisma format",
};
