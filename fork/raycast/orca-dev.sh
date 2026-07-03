#!/bin/bash

# Raycast Script Command — запускает активную разработку Orca (pnpm dev)
# в новом окне Terminal. Документация формата: https://github.com/raycast/script-commands
#
# @raycast.schemaVersion 1
# @raycast.title Орка
# @raycast.mode silent
# @raycast.packageName Orca
#
# Optional:
# @raycast.icon 🐋
# @raycast.description Запустить активную разработку Orca (pnpm dev) в новом окне Terminal
# @raycast.author iar

REPO="/Users/iarromanov/Documents/code/orca"

# Terminal открывает login+interactive shell → .zshrc загружает nvm, поэтому pnpm
# оказывается в PATH. Отдельное окно оставляет dev-сервер видимым и живым.
osascript <<APPLESCRIPT
tell application "Terminal"
  activate
  do script "cd '$REPO' && pnpm dev"
end tell
APPLESCRIPT
