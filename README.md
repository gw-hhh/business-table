# BusinessTable

Configuration-driven enterprise Vue 3 business table component.

## Status

The repository is being migrated from the validated prototype into a reusable component package. The release gate is mandatory before a version is promoted to stable.

## Stack

- Vue 3.5
- TypeScript
- Vite
- VXE Table
- Zod
- Vitest
- Playwright

## Quick start

```bash
npm install
npm run verify:release
npm run dev -- --host 127.0.0.1
```

Open http://127.0.0.1:5173/.

## Package goals

BusinessTable is not quotation-specific. Business applications provide rows, column definitions, pagination/query state, persisted user configuration, views, and business actions. Pagination, column settings, view management, formatting, toolbar/action layout and persistence are first-party component capabilities.

## Release rule

A release is not considered runnable until install, type-check, Vitest, library build, demo build and Playwright browser verification pass.

See `docs/` for usage, API, configuration schema, architecture, integration contract, migration and verification guidance.
