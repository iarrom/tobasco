// [FORK] Пересобрать форк и переустановить его в /Applications как отдельное
// приложение (по умолчанию «Orca Fork»), не трогая официальный Orca.app.
//
// Зачем: наша сборка подписана ad-hoc, поэтому встроенный авто-апдейтер Squirrel.Mac
// её не обновляет (macOS блокирует авто-апдейт неподписанных приложений). Это —
// самый быстрый цикл без Apple Developer ID: одна команда «пересобрать + переставить».
// Нативный computer-use хелпер пропускается (не собирается без полного Xcode).
//
// Флаги:
//   --relaunch   закрыть текущий инстанс форка и открыть свежесобранный
//   --name=X     имя приложения в /Applications (по умолчанию — productName сборки)

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '../..')

if (process.platform !== 'darwin') {
  console.error('Этот скрипт только для macOS.')
  process.exit(1)
}

const args = process.argv.slice(2)
const relaunch = args.includes('--relaunch')
const nameArg = args.find((a) => a.startsWith('--name='))

// Собираем под архитектуру текущей машины (arm64 на Apple Silicon, иначе x64).
const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
const builderArchFlag = arch === 'arm64' ? '--arm64' : '--x64'
// electron-builder кладёт unpacked .app в mac-<arch> (arm64) либо mac (x64).
const builtAppDir = arch === 'arm64' ? 'mac-arm64' : 'mac'
const builtDir = path.join(repoRoot, 'dist', builtAppDir)

// Имя .app берём из результата сборки, а не хардкодим: productName форка
// уже менялся (Orca → Tobasco), и жёсткий путь ломал установку.
function findBuiltApp() {
  if (!existsSync(builtDir)) {
    return null
  }
  const bundle = readdirSync(builtDir).find((entry) => entry.endsWith('.app'))
  return bundle ? path.join(builtDir, bundle) : null
}

function run(cmd, cmdArgs) {
  console.log(`\n▶ ${cmd} ${cmdArgs.join(' ')}`)
  execFileSync(cmd, cmdArgs, { cwd: repoRoot, stdio: 'inherit' })
}

// 1. Сборка renderer/main/preload/cli/relay (typecheck входит внутрь). Swift
//    computer-use намеренно пропущен — он не собирается без полного Xcode.
run('pnpm', ['run', 'build:desktop'])
run('pnpm', ['run', 'ensure:electron-runtime'])

// 2. Только unpacked .app (--dir) под нужную арку — без dmg/zip, так быстрее.
run('pnpm', [
  'exec',
  'electron-builder',
  '--config',
  'config/electron-builder.config.cjs',
  '--mac',
  builderArchFlag,
  '--dir'
])

const builtApp = findBuiltApp()
if (!builtApp) {
  console.error(`\n✖ Не нашёл собранный .app в ${builtDir}`)
  process.exit(1)
}
const appName = nameArg ? nameArg.slice('--name='.length) : path.basename(builtApp, '.app')
const installedApp = path.join('/Applications', `${appName}.app`)

// 3. Если просили перезапуск — закрыть текущий инстанс форка перед заменой,
//    чтобы не остался работать старый бинарник.
if (relaunch) {
  try {
    execFileSync('osascript', ['-e', `quit app "${appName}"`], { stdio: 'ignore' })
  } catch {
    // приложение не было запущено — не ошибка
  }
}

// 4. Ставим рядом с официальным Orca, под своим именем (официальный не трогаем).
console.log(`\n▶ Устанавливаю → ${installedApp}`)
rmSync(installedApp, { recursive: true, force: true })
// ditto, а не Node cpSync: cpSync ломает относительные симлинки внутри .framework
// (превращает в абсолютные пути обратно в dist/), после чего codesign отвергает бандл.
execFileSync('ditto', [builtApp, installedApp], { stdio: 'inherit' })

// 5. Снять карантин/provenance и переподписать ad-hoc, чтобы копия осталась
//    валидной и запускалась двойным кликом без Gatekeeper-трения.
try {
  execFileSync('xattr', ['-cr', installedApp], { stdio: 'ignore' })
} catch {
  // xattr может отсутствовать/ничего не найти — не критично
}
execFileSync('codesign', ['--force', '--deep', '--sign', '-', installedApp], { stdio: 'inherit' })

console.log(`\n✅ Готово: ${installedApp}`)

if (relaunch) {
  run('open', [installedApp])
} else {
  console.log(
    `Открой «${appName}» из /Applications или Spotlight. (--relaunch — перезапустить автоматически.)`
  )
}
