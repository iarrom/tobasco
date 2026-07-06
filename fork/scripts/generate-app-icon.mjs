// [FORK] Сгенерировать все иконки приложения из растрового исходника
// fork/app-icon/tobasco-bottle.png (полноформатный квадрат, без прозрачности).
//
// Зачем: апстримный resources/icon-source/generate.sh собирает иконку из
// Icon Composer-проекта (SVG-глиф + генерируемый фон) через Xcode actool —
// он не подходит для полноцветного растрового арта форка. Этот скрипт
// повторяет выходной контракт generate.sh поверх PNG:
//   resources/build/icon.icns  — macOS (Dock) и Linux (hicolor-размеры)
//   resources/build/icon.png   — 1024px с системным safe-area отступом
//   resources/build/icon.ico   — Windows (обрезка safe-area, мультиразмер)
//   resources/icon.png         — 256px (окна/трей на Win/Linux)
//   resources/icon-dev.png     — 256px + оранжевый бейдж «D» для dev-сборок
//
// После апстрим-мержа, перезатёршего иконки, просто перезапустить:
//   node fork/scripts/generate-app-icon.mjs

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  buildWindowsIcoFromPng,
  decodePng,
  encodePng,
  resizeImage
} from '../../config/scripts/trim-windows-icon-source.mjs'

const repoRoot = path.resolve(import.meta.dirname, '../..')
const sourcePath = process.argv[2] ?? path.join(repoRoot, 'fork', 'app-icon', 'tobasco-bottle.png')
const buildDir = path.join(repoRoot, 'resources', 'build')
const resourcesDir = path.join(repoRoot, 'resources')

// Геометрия современного шаблона иконок macOS: скруглённый квадрат 824px
// на канве 1024px, радиус угла ≈22.37% стороны.
const CANVAS = 1024
const GLYPH = 824
const CORNER_RADIUS_RATIO = 0.2237
// Параметры бейджа dev-иконки — сняты с апстримного resources/icon-dev.png.
const DEV_BADGE = { cx: 224, cy: 224, r: 25.5, color: [255, 107, 43] }

function makeImage(width, height) {
  return { width, height, data: Buffer.alloc(width * height * 4) }
}

// Кадрируем по центру до квадрата — на случай не строго квадратного исходника.
function centerCropSquare(image) {
  const side = Math.min(image.width, image.height)
  if (image.width === image.height) {
    return image
  }
  const offsetX = Math.floor((image.width - side) / 2)
  const offsetY = Math.floor((image.height - side) / 2)
  const out = makeImage(side, side)
  for (let y = 0; y < side; y++) {
    const src = ((offsetY + y) * image.width + offsetX) * 4
    out.data.set(image.data.subarray(src, src + side * 4), y * side * 4)
  }
  return out
}

// Альфа-маска скруглённого квадрата с сглаживанием (4×4 суперсэмплинг).
function roundedSquareMask(size, radius) {
  const mask = new Float32Array(size * size)
  const sub = 4
  const step = 1 / sub
  const inner = size - radius
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let coverage = 0
      for (let sy = 0; sy < sub; sy++) {
        for (let sx = 0; sx < sub; sx++) {
          const px = x + (sx + 0.5) * step
          const py = y + (sy + 0.5) * step
          const dx = px < radius ? radius - px : px > inner ? px - inner : 0
          const dy = py < radius ? radius - py : py > inner ? py - inner : 0
          if (dx * dx + dy * dy <= radius * radius) {
            coverage += 1
          }
        }
      }
      mask[y * size + x] = coverage / (sub * sub)
    }
  }
  return mask
}

function applyMask(image, mask) {
  const out = makeImage(image.width, image.height)
  out.data.set(image.data)
  for (let i = 0; i < mask.length; i++) {
    out.data[i * 4 + 3] = Math.round(out.data[i * 4 + 3] * mask[i])
  }
  return out
}

// Три прохода box-блюра (≈гауссово размытие) по альфа-каналу, O(n) на проход.
function blurAlpha(alpha, width, height, radius, passes = 3) {
  let src = Float32Array.from(alpha)
  let dst = new Float32Array(alpha.length)
  const window = 2 * radius + 1
  for (let pass = 0; pass < passes; pass++) {
    for (let y = 0; y < height; y++) {
      let sum = 0
      const row = y * width
      for (let x = -radius; x <= radius; x++) {
        sum += src[row + Math.min(width - 1, Math.max(0, x))]
      }
      for (let x = 0; x < width; x++) {
        dst[row + x] = sum / window
        sum += src[row + Math.min(width - 1, x + radius + 1)]
        sum -= src[row + Math.max(0, x - radius)]
      }
    }
    ;[src, dst] = [dst, src]
    for (let x = 0; x < width; x++) {
      let sum = 0
      for (let y = -radius; y <= radius; y++) {
        sum += src[Math.min(height - 1, Math.max(0, y)) * width + x]
      }
      for (let y = 0; y < height; y++) {
        dst[y * width + x] = sum / window
        sum += src[Math.min(height - 1, y + radius + 1) * width + x]
        sum -= src[Math.max(0, y - radius) * width + x]
      }
    }
    ;[src, dst] = [dst, src]
  }
  return src
}

// src-over поверх dst, обе картинки одного размера.
function compositeOver(dst, src) {
  for (let i = 0; i < dst.width * dst.height; i++) {
    const p = i * 4
    const sa = src.data[p + 3] / 255
    if (sa === 0) {
      continue
    }
    const da = dst.data[p + 3] / 255
    const outA = sa + da * (1 - sa)
    for (let k = 0; k < 3; k++) {
      dst.data[p + k] = Math.round((src.data[p + k] * sa + dst.data[p + k] * da * (1 - sa)) / outA)
    }
    dst.data[p + 3] = Math.round(outA * 255)
  }
}

function placeCentered(canvasSize, image, offsetY = 0) {
  const out = makeImage(canvasSize, canvasSize)
  const offset = Math.round((canvasSize - image.width) / 2)
  for (let y = 0; y < image.height; y++) {
    const ty = y + offset + offsetY
    if (ty < 0 || ty >= canvasSize) {
      continue
    }
    const src = y * image.width * 4
    out.data.set(image.data.subarray(src, src + image.width * 4), (ty * canvasSize + offset) * 4)
  }
  return out
}

// Композит с safe-area: глиф 824px по центру канвы 1024px + мягкая тень,
// как у иконок из Icon Composer (иначе иконка выглядит "плоской" в Dock).
function buildSafeAreaComposite(fullBleed1024) {
  const glyph = applyMask(
    resizeImage(fullBleed1024, GLYPH, GLYPH),
    roundedSquareMask(GLYPH, GLYPH * CORNER_RADIUS_RATIO)
  )
  const placed = placeCentered(CANVAS, glyph)
  const shadowAlpha = new Float32Array(CANVAS * CANVAS)
  for (let i = 0; i < shadowAlpha.length; i++) {
    shadowAlpha[i] = placed.data[i * 4 + 3]
  }
  const blurred = blurAlpha(shadowAlpha, CANVAS, CANVAS, 10)
  const shadow = makeImage(CANVAS, CANVAS)
  const shadowOffsetY = 8
  const shadowOpacity = 0.35
  for (let y = 0; y < CANVAS; y++) {
    const srcY = y - shadowOffsetY
    if (srcY < 0 || srcY >= CANVAS) {
      continue
    }
    for (let x = 0; x < CANVAS; x++) {
      shadow.data[(y * CANVAS + x) * 4 + 3] = Math.round(blurred[srcY * CANVAS + x] * shadowOpacity)
    }
  }
  compositeOver(shadow, placed)
  return shadow
}

// Аналитическая буква «D» (штамб + дуга), чтобы не тянуть шрифтовый рендерер.
function drawDevBadge(image) {
  const { cx, cy, r, color } = DEV_BADGE
  const capHeight = 26
  const stroke = 7
  const stemLeft = cx - 10
  const bowlStart = cx - 3
  const outerR = capHeight / 2
  const inRegion = (x, y, inset) => {
    const rr = outerR - inset
    if (x >= stemLeft + inset && x <= bowlStart && Math.abs(y - cy) <= rr) {
      return true
    }
    const dx = x - bowlStart
    const dy = y - cy
    return dx > 0 && dx * dx + dy * dy <= rr * rr
  }
  const sub = 4
  const step = 1 / sub
  const size = image.width
  const minX = Math.floor(cx - r - 2)
  const maxX = Math.ceil(cx + r + 2)
  for (let y = minX; y <= maxX; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (x < 0 || y < 0 || x >= size || y >= size) {
        continue
      }
      let disc = 0
      let letter = 0
      for (let sy = 0; sy < sub; sy++) {
        for (let sx = 0; sx < sub; sx++) {
          const px = x + (sx + 0.5) * step
          const py = y + (sy + 0.5) * step
          const dx = px - cx
          const dy = py - cy
          if (dx * dx + dy * dy <= r * r) {
            disc += 1
          }
          if (inRegion(px, py, 0) && !inRegion(px, py, stroke)) {
            letter += 1
          }
        }
      }
      disc /= sub * sub
      letter /= sub * sub
      if (disc === 0) {
        continue
      }
      const p = (y * size + x) * 4
      const da = image.data[p + 3] / 255
      const outA = disc + da * (1 - disc)
      for (let k = 0; k < 3; k++) {
        const badge = color[k] * (1 - letter) + 255 * letter
        image.data[p + k] = Math.round((badge * disc + image.data[p + k] * da * (1 - disc)) / outA)
      }
      image.data[p + 3] = Math.round(outA * 255)
    }
  }
}

function main() {
  const source = centerCropSquare(decodePng(readFileSync(sourcePath)))
  const fullBleed = resizeImage(source, CANVAS, CANVAS)
  const fullBleedRounded = applyMask(
    fullBleed,
    roundedSquareMask(CANVAS, CANVAS * CORNER_RADIUS_RATIO)
  )
  const safeArea = buildSafeAreaComposite(fullBleed)

  mkdirSync(buildDir, { recursive: true })

  // macOS .icns: крупные слоты — с safe-area, мелкие (16/32/64) — полноформатные,
  // как делает трим в апстримном generate.sh для списочных представлений Finder.
  const iconsetDir = mkdtempSync(path.join(tmpdir(), 'fork-icon-'))
  const iconset = path.join(iconsetDir, 'icon.iconset')
  mkdirSync(iconset)
  const slots = [
    ['icon_16x16.png', 16, fullBleedRounded],
    ['icon_16x16@2x.png', 32, fullBleedRounded],
    ['icon_32x32.png', 32, fullBleedRounded],
    ['icon_32x32@2x.png', 64, fullBleedRounded],
    ['icon_128x128.png', 128, safeArea],
    ['icon_128x128@2x.png', 256, safeArea],
    ['icon_256x256.png', 256, safeArea],
    ['icon_256x256@2x.png', 512, safeArea],
    ['icon_512x512.png', 512, safeArea],
    ['icon_512x512@2x.png', 1024, safeArea]
  ]
  try {
    for (const [name, size, master] of slots) {
      const frame = master.width === size ? master : resizeImage(master, size, size)
      writeFileSync(path.join(iconset, name), encodePng(frame))
    }
    if (process.platform === 'darwin') {
      execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(buildDir, 'icon.icns')])
      console.log('  -> resources/build/icon.icns')
    } else {
      console.warn('  !! iconutil доступен только на macOS — icon.icns пропущен')
    }
  } finally {
    rmSync(iconsetDir, { recursive: true, force: true })
  }

  const png1024 = encodePng(safeArea)
  writeFileSync(path.join(buildDir, 'icon.png'), png1024)
  console.log('  -> resources/build/icon.png (1024x1024)')

  const png256 = resizeImage(safeArea, 256, 256)
  writeFileSync(path.join(resourcesDir, 'icon.png'), encodePng(png256))
  console.log('  -> resources/icon.png (256x256)')

  const devIcon = makeImage(256, 256)
  devIcon.data.set(png256.data)
  drawDevBadge(devIcon)
  writeFileSync(path.join(resourcesDir, 'icon-dev.png'), encodePng(devIcon))
  console.log('  -> resources/icon-dev.png (256x256, бейдж D)')

  writeFileSync(path.join(buildDir, 'icon.ico'), buildWindowsIcoFromPng(png1024))
  console.log('  -> resources/build/icon.ico (мультиразмер, safe-area обрезан)')
}

main()
