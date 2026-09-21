@echo off
setlocal
where node >nul 2>nul || (echo [BusinessTable] Node.js is required. & pause & exit /b 1)
call npm install || goto :fail
call npx playwright install chromium || goto :fail
call npm run verify:release || goto :fail
echo.
echo [BusinessTable] RELEASE VERIFICATION PASSED
exit /b 0
:fail
echo.
echo [BusinessTable] RELEASE VERIFICATION FAILED
pause
exit /b 1
