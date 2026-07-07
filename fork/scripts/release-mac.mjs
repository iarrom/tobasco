// [FORK] Подписанный и нотаризованный DMG форка одной командой.
//
// Разовый сетап (нужен Apple Developer аккаунт и полный Xcode):
//   1. sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
//      sudo xcodebuild -license accept
//   2. Сертификат «Developer ID Application»: Xcode → Settings → Accounts →
//      Manage Certificates → «+» → Developer ID Application. (Если кнопка
//      недоступна — создать на developer.apple.com/account/resources/certificates
//      через CSR из Keychain Access.)
//   3. Экспортировать сертификат c приватным ключом из Keychain Access в .p12
//      (правый клик → Export…, задать пароль).
//   4. App-specific password: appleid.apple.com → Sign-In & Security →
//      App-Specific Passwords. Team ID: developer.apple.com/account → Membership.
//   5. Заполнить ~/.config/tobasco/release-signing.env (chmod 600):
//        APPLE_ID=you@example.com
//        APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
//        APPLE_TEAM_ID=XXXXXXXXXX
//        CSC_LINK=/absolute/path/to/developer-id.p12
//        CSC_KEY_PASSWORD=пароль-от-p12
//
// Дальше: node fork/scripts/release-mac.mjs  → dist/*.dmg (подписан,
// нотаризован, с Computer Use хелпером; карантин снимать не нужно).

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '../..')
const envFile = path.join(os.homedir(), '.config', 'tobasco', 'release-signing.env')

if (process.platform !== 'darwin') {
  console.error('Этот скрипт только для macOS.')
  process.exit(1)
}

// 1. Полный Xcode обязателен: Swift-хелпер Computer Use не собирается на CLT.
const developerDir = execFileSync('xcode-select', ['-p'], { encoding: 'utf8' }).trim()
if (!developerDir.includes('Xcode.app')) {
  console.error(
    `xcode-select указывает на ${developerDir}.\n` +
      'Переключи на полный Xcode:\n  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer'
  )
  process.exit(1)
}

// 2. Креды подписи/нотаризации — из локального файла (не попадает в git).
if (!existsSync(envFile)) {
  console.error(`Нет файла кредов: ${envFile}\nШаблон — в шапке этого скрипта.`)
  process.exit(1)
}
for (const line of readFileSync(envFile, 'utf8').split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) {
    continue
  }
  const eq = trimmed.indexOf('=')
  if (eq > 0) {
    process.env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
}

// 3. Identity подписи: .p12 через CSC_LINK либо «Developer ID Application»
// прямо из Keychain (пароль от .p12 тогда не нужен).
const identities = spawnSync('security', ['find-identity', '-v', '-p', 'codesigning'], {
  encoding: 'utf8'
}).stdout
const keychainIdentity = identities
  .split('\n')
  .find((line) => line.includes('Developer ID Application'))
  ?.match(/"(.+)"/)?.[1]
if (!process.env.CSC_LINK && !keychainIdentity) {
  console.error(
    'В Keychain нет «Developer ID Application» и CSC_LINK не задан.\n' +
      'Создай сертификат (шаг 2 в шапке скрипта) или укажи CSC_LINK на .p12.'
  )
  process.exit(1)
}
if (!process.env.CSC_LINK && keychainIdentity) {
  // electron-builder и build-computer-macos возьмут identity из связки.
  process.env.CSC_NAME = keychainIdentity
  console.log(`▶ Подпись из Keychain: ${keychainIdentity}`)
}
for (const key of ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID']) {
  if (!process.env[key]) {
    console.error(`В ${envFile} не хватает ${key} — нотаризация не пройдёт.`)
    process.exit(1)
  }
}

// 4. Релизные шаги апстрима: hardened runtime + notarize + Swift-хелпер.
// В Keychain-режиме зовём их напрямую (upstream-верификатор требует CSC_LINK,
// который в этом режиме не нужен); с CSC_LINK — штатный build:mac:release.
const releaseEnv = { ...process.env, ORCA_MAC_RELEASE: '1' }
const releaseSteps = process.env.CSC_LINK
  ? [['pnpm', ['run', 'build:mac:release']]]
  : [
      ['pnpm', ['run', 'build:desktop']],
      ['pnpm', ['run', 'build:computer-macos']],
      ['pnpm', ['run', 'ensure:electron-runtime']],
      [
        'pnpm',
        ['exec', 'electron-builder', '--config', 'config/electron-builder.config.cjs', '--mac']
      ]
    ]
for (const [cmd, cmdArgs] of releaseSteps) {
  console.log(`▶ ${cmd} ${cmdArgs.join(' ')}`)
  execFileSync(cmd, cmdArgs, { cwd: repoRoot, stdio: 'inherit', env: releaseEnv })
}

const dist = path.join(repoRoot, 'dist')
const dmgs = readdirSync(dist).filter((f) => f.endsWith('.dmg'))
console.log('\n✅ Готово:')
for (const dmg of dmgs) {
  console.log(`  ${path.join(dist, dmg)}`)
}
console.log('\nПроверка: spctl -a -t open --context context:primary-signature -v <dmg>')
