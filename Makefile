.PHONY: install build dev lint format test typecheck clean

# Default target
help:
	@echo "Available commands:"
	@echo "  make install     - Install dependencies"
	@echo "  make build       - Build all packages"
	@echo "  make dev         - Start development servers"
	@echo "  make lint        - Lint all packages"
	@echo "  make format      - Format all files"
	@echo "  make test        - Run all tests"
	@echo "  make typecheck   - Type check all packages"
	@echo "  make clean       - Clean build artifacts"
	@echo "  make knip        - Find unused code"
	@echo "  make type-coverage - Check TypeScript coverage"

# Install dependencies
install:
	pnpm install

# Build all packages
build:
	pnpm build

# Start development servers
dev:
	pnpm dev

# Lint all packages
lint:
	pnpm lint

# Format all files
format:
	pnpm format

# Run all tests
test:
	pnpm test

# Type check all packages
typecheck:
	pnpm typecheck

# Clean build artifacts
clean:
	rm -rf node_modules
	rm -rf **/node_modules
	rm -rf **/dist
	rm -rf **/.next
	rm -rf **/.turbo
	rm -rf .turbo
	pnpm install

# Find unused code
knip:
	pnpm knip

# Check TypeScript coverage
type-coverage:
	pnpm type-coverage

# Database commands
db-generate:
	pnpm --filter @workspace/database db:generate

db-push:
	pnpm --filter @workspace/database db:push

db-migrate:
	pnpm --filter @workspace/database db:migrate

db-studio:
	pnpm --filter @workspace/database db:studio

# Fresh start
fresh:
	rm -rf node_modules pnpm-lock.yaml **/node_modules
	pnpm install
