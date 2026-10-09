@echo off
chcp 65001 > nul
title HMOS 로컬 서버

echo.
echo  HMOS 시작 중...
echo.

cd /d "%~dp0"

:: node_modules 확인
if not exist "node_modules" (
  echo  패키지 설치 중 (처음 한 번만)...
  npm install
  echo.
)

:: express 설치 확인
node -e "require('express')" 2>nul
if errorlevel 1 (
  echo  express 설치 중...
  npm install express @types/express
  echo.
)

:: 3초 후 브라우저 열기 (백그라운드)
start /b cmd /c "timeout /t 3 /nobreak > nul && start http://localhost:3000/hmos_screen_a.html"

:: 서버 실행
echo  브라우저가 자동으로 열립니다.
echo  종료하려면 이 창을 닫으세요.
echo.
npx tsx server.ts

pause
