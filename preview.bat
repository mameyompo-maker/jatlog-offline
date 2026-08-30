@echo off
rem ---------------------------------------------------------------------------
rem JatLog PREVIEW - abre o app ligado a um servidor FALSO (tests/servidor.py).
rem Nada do que se registar aqui chega as folhas de calculo reais.
rem
rem   - Faz uma copia de docs/ para %TEMP% (a original fica intocada;
rem     o servidor de teste reescreve o config.js da copia para os
rem     endpoints falsos).
rem   - Abre o navegador em http://127.0.0.1:8811/
rem   - Codigo de activacao: jatropha   /   senha de admin: JatRD2026
rem   - Para PARAR: feche esta janela (ou Ctrl+C).
rem
rem Precisa apenas de Python (sem pacotes extra).
rem ---------------------------------------------------------------------------
setlocal
set "SRC=%~dp0docs"
set "DST=%TEMP%\jatlog_preview_docs"

if exist "%DST%" rmdir /s /q "%DST%"
xcopy /e /i /q "%SRC%" "%DST%" >nul

echo.
echo  JatLog preview em  http://127.0.0.1:8811/   (codigo: jatropha)
echo  Nada e escrito nas folhas reais. Feche esta janela para parar.
echo.

start "" cmd /c "timeout /t 2 /nobreak >nul & start http://127.0.0.1:8811/"
python "%~dp0tests\servidor.py" "%DST%" 8811
endlocal
