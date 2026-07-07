// [FORK] Источник обновлений форка: релизы iarrom/tobasco, а не stablyai/orca.
// Подписанные сборки Squirrel сможет обновлять автоматически, когда в релизы
// форка выкладываются dmg/zip + latest-mac.yml (electron-builder генерирует
// манифест благодаря publish-конфигу github в electron-builder.config.cjs).
export const FORK_RELEASES_REPO = 'iarrom/tobasco'
const FORK_RELEASES_BASE = `https://github.com/${FORK_RELEASES_REPO}`
export const FORK_RELEASES_LATEST_DOWNLOAD = `${FORK_RELEASES_BASE}/releases/latest/download`
export const FORK_RELEASES_DOWNLOAD_BASE = `${FORK_RELEASES_BASE}/releases/download`
export const FORK_RELEASES_ATOM_FEED = `${FORK_RELEASES_BASE}/releases.atom`
