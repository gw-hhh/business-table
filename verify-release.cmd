@echo off
setlocal
where node >nul 2>nul || (echo [BusinessTable] Node.js is required. & pause & exit /b 1)
call npx --yes pnpm@10.17.1 install --frozen-lockfile || goto :fail
call npx --yes pnpm@10.17.1 exec playwright install chromium || goto :fail
call npx --yes pnpm@10.17.1 run verify:release || goto :fail
echo.
echo [BusinessTable] RELEASE VERIFICATION PASSED
exit /b 0
:fail
echo.
echo [BusinessTable] RELEASE VERIFICATION FAILED
pause
exit /b 1
