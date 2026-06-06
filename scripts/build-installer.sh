#!/usr/bin/env bash

set -euo pipefail

APP_NAME="raymond-overtime"
APP_ID="com.joseibay.raymond-overtime"
VERSION="$(node -p "require('./package.json').version")"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
BUILD_DIR="$DIST_DIR/build"
PKGROOT="$BUILD_DIR/pkgroot"
SCRIPTS_DIR="$BUILD_DIR/scripts"

APP_INSTALL_DIR="$PKGROOT/usr/local/$APP_NAME"
BIN_INSTALL_DIR="$PKGROOT/usr/local/bin"

mkdir -p "$APP_INSTALL_DIR" "$BIN_INSTALL_DIR" "$SCRIPTS_DIR" "$DIST_DIR"

rm -rf "$APP_INSTALL_DIR"/* "$BIN_INSTALL_DIR"/*

cp "$ROOT_DIR/server.js" "$APP_INSTALL_DIR/"
cp "$ROOT_DIR/package.json" "$APP_INSTALL_DIR/"
cp "$ROOT_DIR/package-lock.json" "$APP_INSTALL_DIR/"
cp -R "$ROOT_DIR/frontend" "$APP_INSTALL_DIR/"
cp -R "$ROOT_DIR/src" "$APP_INSTALL_DIR/"

cat > "$BIN_INSTALL_DIR/$APP_NAME" <<'EOF'
#!/usr/bin/env bash
exec node /usr/local/raymond-overtime/server.js "$@"
EOF
chmod +x "$BIN_INSTALL_DIR/$APP_NAME"

cat > "$SCRIPTS_DIR/postinstall" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
chmod +x /usr/local/bin/raymond-overtime || true
cd /usr/local/raymond-overtime
npm install --omit=dev
EOF
chmod +x "$SCRIPTS_DIR/postinstall"

PKG_FILE="$DIST_DIR/${APP_NAME}-${VERSION}.pkg"
rm -f "$PKG_FILE"

pkgbuild \
  --root "$PKGROOT" \
  --scripts "$SCRIPTS_DIR" \
  --identifier "$APP_ID" \
  --version "$VERSION" \
  --install-location / \
  "$PKG_FILE"

echo "Installer created: $PKG_FILE"
