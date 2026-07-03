#!/usr/bin/env bash
# Показывает площадь расхождения форка с upstream/main:
#   1) upstream-файлы, которые мы тронули (будущие конфликты при мердже);
#   2) все вставки [FORK] в upstream-файлах.
# Кроссплатформенно: bash (macOS / Linux / Git Bash на Windows).
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

if ! git remote | grep -qx upstream; then
  echo "Нет remote 'upstream'. Добавьте: git remote add upstream https://github.com/stablyai/orca.git" >&2
  exit 1
fi

echo "== Загружаю upstream =="
git fetch --quiet upstream

BASE="upstream/main"
AHEAD=$(git rev-list --count "$BASE..HEAD")
BEHIND=$(git rev-list --count "HEAD..$BASE")
echo "Впереди upstream/main: $AHEAD коммит(ов)  |  Позади: $BEHIND"
echo

echo "== Изменённые upstream-файлы (площадь конфликта) =="
# Только файлы вне fork/ — внутри fork/ конфликтов не бывает by design.
git diff --stat "$BASE...HEAD" -- . ':(exclude)fork/' || true
echo

echo "== Вставки [FORK] в upstream-файлах =="
# Каждая строка — точка, которую нужно проверить после конфликтного мерджа.
git grep -n '\[FORK\]' -- ':(exclude)fork/' || echo "  (нет — вся кастомизация изолирована в fork/)"
