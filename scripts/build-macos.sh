#!/usr/bin/env bash
set -e

PROJECT="apps/macos/GotIt.xcodeproj"
SCHEME="GotIt"
CONFIG="Debug"

echo "Building $SCHEME..."
xcodebuild -scheme "$SCHEME" -project "$PROJECT" -configuration "$CONFIG" build

BUILT_DIR=$(xcodebuild -scheme "$SCHEME" -project "$PROJECT" -configuration "$CONFIG" \
  -showBuildSettings 2>/dev/null | grep -w "BUILT_PRODUCTS_DIR" | head -1 | sed 's/.*= //')

if [ -z "$BUILT_DIR" ]; then
  echo "ERROR: could not determine BUILT_PRODUCTS_DIR" >&2
  exit 1
fi

APP_PATH="$BUILT_DIR/GotIt.app"

echo "Stopping running instance..."
pkill -x GotIt 2>/dev/null || true

echo "Installing $APP_PATH -> /Applications/GotIt.app..."
rm -rf /Applications/GotIt.app
cp -R "$APP_PATH" /Applications/GotIt.app

echo "Resetting Screen Recording permission for fresh grant..."
tccutil reset ScreenCapture dev.gotit.GotIt 2>/dev/null || true

echo "Launching..."
open /Applications/GotIt.app
echo "Done. Grant Screen Recording permission when the dialog appears."
