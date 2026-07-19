@echo off
title Ponte OpenCode V3 - CorePay
color 0F
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0ChatGPT-OpenCode-Bridge-V3.ps1"
if errorlevel 1 pause
