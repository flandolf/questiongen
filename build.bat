@echo off
REM Windows batch port of build.sh
SETLOCAL ENABLEDELAYEDEXPANSION

REM Default jobs env (no direct equivalent; kept for parity)
IF NOT DEFINED CARGO_BUILD_JOBS (
  FOR /F "tokens=*" %%C IN ('wmic cpu get NumberOfLogicalProcessors ^| findstr /R /C:"[0-9]"') DO SET CARGO_BUILD_JOBS=%%C
)

SET BUMP=0
SET VER_ARG=
SET MODE=

:parse_args
IF "%~1"=="" GOTO after_parse
  IF /I "%~1"=="-B" (SET BUMP=1) ELSE (
  IF /I "%~1"=="-m" (SET VER_ARG=minor) ELSE (
  IF /I "%~1"=="-M" (SET VER_ARG=major) ELSE (
  IF /I "%~1"=="-c" (SET MODE=-c) ELSE (
  IF /I "%~1"=="-a" (SET MODE=-a) ELSE (
  IF /I "%~1"=="-b" (SET MODE=-b)
  ))))))
  SHIFT
GOTO parse_args

:after_parse
IF "%BUMP%"=="1" (
  ECHO 📦 Bumping version code...
  IF NOT "%VER_ARG%"=="" (
    bun run scripts/version.ts %VER_ARG%
  ) ELSE (
    bun run scripts/version.ts
  )
)

REM Handle build/install modes
IF "%MODE%"=="-c" (
  ECHO Copying app to Program Files...
  IF NOT EXIST "%ProgramFiles%\questiongen" MKDIR "%ProgramFiles%\questiongen"
  REM Adjust source path if your Windows bundle path differs
  COPY /Y "src-tauri\target\release\bundle\windows\questiongen.exe" "%ProgramFiles%\questiongen\" >nul 2>&1 || ECHO (copy failed or file missing)
  GOTO end
)

IF "%MODE%"=="-a" (
  ECHO Building Android (Windows host)...
  bun run tauri android build -t aarch64
  adb install -r "src-tauri\gen\android\app\build\outputs\apk\universal\release\app-universal-release.apk"
  GOTO end
)

IF "%MODE%"=="-b" (
  ECHO Full build (desktop + android)...
  bun run tauri build
  IF EXIST "src-tauri\target\release\bundle\windows\questiongen.exe" (
    COPY /Y "src-tauri\target\release\bundle\windows\questiongen.exe" "%ProgramFiles%\questiongen\" >nul 2>&1 || ECHO (copy failed)
  )
  bun run tauri android build -t aarch64
  adb install -r "src-tauri\gen\android\app\build\outputs\apk\universal\release\app-universal-release.apk"
  GOTO end
)

REM Default: desktop build
ECHO Running default desktop build...
bun run tauri build
IF EXIST "src-tauri\target\release\bundle\windows\questiongen.exe" (
  COPY /Y "src-tauri\target\release\bundle\windows\questiongen.exe" "%ProgramFiles%\questiongen\" >nul 2>&1 || ECHO (copy failed)
)

:end
ENDLOCAL
EXIT /B 0
