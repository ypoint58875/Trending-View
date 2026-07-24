@echo off
setlocal
set "SITE_URL=https://quantscope-market-lab.work-3582.chatgpt.site"
set "EDGE_EXE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"

if not exist "%EDGE_EXE%" set "EDGE_EXE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE_EXE%" set "EDGE_EXE=%LocalAppData%\Microsoft\Edge\Application\msedge.exe"

if exist "%EDGE_EXE%" (
  start "" "%EDGE_EXE%" --new-window --start-maximized "%SITE_URL%"
) else (
  start "" "%SITE_URL%"
)

endlocal
exit /b 0
