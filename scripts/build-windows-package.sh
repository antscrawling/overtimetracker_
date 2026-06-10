#!/usr/bin/env bash

set -euo pipefail

APP_NAME="raymond-overtime"
VERSION="$(node -p "require('./package.json').version")"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
STAGE_DIR="$DIST_DIR/windows-stage"
ZIP_FILE="$DIST_DIR/${APP_NAME}-${VERSION}-windows.zip"

mkdir -p "$STAGE_DIR" "$DIST_DIR"
rm -rf "$STAGE_DIR"/*

cp "$ROOT_DIR/server.js" "$STAGE_DIR/"
cp "$ROOT_DIR/package.json" "$STAGE_DIR/"
cp "$ROOT_DIR/package-lock.json" "$STAGE_DIR/"
cp -R "$ROOT_DIR/frontend" "$STAGE_DIR/"
cp -R "$ROOT_DIR/src" "$STAGE_DIR/"

find "$STAGE_DIR/src" -type d -name "__pycache__" -prune -exec rm -rf {} +
find "$STAGE_DIR/src" -type f -name "*.pyc" -delete

cat > "$STAGE_DIR/start.bat" <<'EOF'
@echo off
setlocal
cd /d %~dp0

if not exist node_modules (
  echo Dependencies not installed. Running npm install...
  call npm install
  if errorlevel 1 (
    echo Failed to install dependencies.
    pause
    exit /b 1
  )
)

echo Starting raymond-overtime on http://127.0.0.1:3000/
call npm start
endlocal
EOF

cat > "$STAGE_DIR/install_dependencies.bat" <<'EOF'
@echo off
setlocal
cd /d %~dp0
echo Installing Node.js dependencies...
call npm install
if errorlevel 1 (
  echo Dependency installation failed.
  pause
  exit /b 1
)
echo Installation complete.
pause
endlocal
EOF

cat > "$STAGE_DIR/README-WINDOWS.txt" <<'EOF'
Raymond Overtime - Windows Package

Requirements:
1. Node.js LTS installed (includes npm)

Install Node.js on Windows:
1. Download Node.js LTS: https://nodejs.org/en/download
2. Run the installer and keep npm selected
3. Open Command Prompt and verify:
  - node -v
  - npm -v

Usage:
1. Double-click install_dependencies.bat (first time only)
2. Double-click start.bat
3. Open http://127.0.0.1:3000/

Files:
- server.js                Node.js backend
- frontend/                Web frontend assets
- src/overtime.db          SQLite database
EOF

rm -f "$ZIP_FILE"
(
  cd "$STAGE_DIR"
  zip -r "$ZIP_FILE" .
)

echo "Windows package created: $ZIP_FILE"
