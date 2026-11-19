@echo off
setlocal
cd /d "%~dp0"
title YouTube Peach Clone
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js chua duoc cai dat.
  echo Hay cai Node.js LTS tu https://nodejs.org/ roi chay lai file nay.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Dang cai cac thu vien can thiet, chi can lam o lan dau...
  call npm install
  if errorlevel 1 (
    echo Cai dat that bai. Hay kiem tra ket noi Internet va thu lai.
    pause
    exit /b 1
  )
)
start "" http://localhost:5173
call npm run dev
pause
