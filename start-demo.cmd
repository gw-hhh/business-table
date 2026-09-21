@echo off
setlocal
where node >nul 2>nul || (echo [BusinessTable] Node.js is required. & pause & exit /b 1)
call npx --yes pnpm@10.17.1 install --frozen-lockfile || exit /b 1
if exist node_modules\.vite rmdir /s /q node_modules\.vite
call npm run type-check || exit /b 1
call npm run test -- --run tests/mount.spec.ts || exit /b 1
call npm run dev -- --host 127.0.0.1 --force
