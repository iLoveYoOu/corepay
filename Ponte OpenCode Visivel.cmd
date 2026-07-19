@echo off
title Ponte OpenCode - CorePay
color 0F
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Iniciar-Ponte-Visivel.ps1"
echo.
echo A ponte foi encerrada. Pressione qualquer tecla para fechar.
pause >nul
