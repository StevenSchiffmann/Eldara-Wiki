#!/usr/bin/env node
/**
 * sync-vault.mjs
 * Kopiert DnD-Obsidian-Vault nach WikiSeite/content/.
 * - Filtert DM-Area-Blöcke und geheime Dateien heraus
 * - Entfernt DM-interne Properties aus Frontmatter
 * - Konvertiert leaflet-Code-Blöcke zu interaktivem Leaflet.js HTML
 * - Kopiert Bilder nach content/Pics/
 * - Entfernt Links zu nicht-existierenden Seiten (→ Plaintext)
 * - Schließt Spieler-Ordner aus (Charaktere sind privat)
 *
 * Aufruf: node scripts/sync-vault.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync, statSync, rmSync } from 'fs'
import { join, dirname, basename, extname, relative } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const VAULT_DM   = join(ROOT, '..', 'DnD-Obsidian', 'DnD', 'DM')
const VAULT_PICS = join(ROOT, '..', 'DnD-Obsidian', 'DnD', 'Pics')
const CONTENT    = join(ROOT, 'content')

// --- Ausschlusslisten ---

const EXCLUDE_FILES = new Set([
  'Notes for DM.md',
  '📋 Projekt-TODOs.md',
  'Main Story.md',
  '.md',
])

const EXCLUDE_FOLDERS = new Set([
  'Quests',
  'Spieler',  // Spieler-Charaktere sind nicht öffentlich
  'Story',    // DM-Story-Planung
])

// DM-interne Frontmatter-Properties die NICHT veröffentlicht werden
const PRIVATE_PROPERTIES = new Set([
  'typ',
  'kampagne',
  'rolle',
  'status',
  'ort',
  'fraktion',
  'rasse',
])

// Ordner ohne Emoji-Prefix für saubere URLs
const FOLDER_RENAME = {
  '⚔️ Kampagnen': 'Kampagnen',
  '🏙️ Orte':      'Orte',
  '🏛️ Fraktionen': 'Fraktionen',
  '👑 Personen':   'Personen',
  '📖 Lore':       'Lore',
  '📅 Zeitlinie':  'Zeitlinie',
  '🧿 Artefakte':  'Artefakte',
}

function cleanFolderName(name) {
  return FOLDER_RENAME[name] ?? name
}

// --- Pass 1: Vault-Dateien vorscanen (für Broken-Link-Erkennung) ---

function buildValidFileSet(srcDir, excludeFolders = EXCLUDE_FOLDERS) {
  const fileNames = new Set()  // basename ohne Extension, normalisiert

  function walk(dir) {
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const cleanName = cleanFolderName(entry.name)

      if (entry.isDirectory()) {
        if (excludeFolders.has(entry.name) || excludeFolders.has(cleanName)) continue
        walk(join(dir, entry.name))
      } else if (entry.isFile() && extname(entry.name) === '.md') {
        if (EXCLUDE_FILES.has(entry.name)) continue
        const name = basename(entry.name, '.md')
        fileNames.add(name)
        fileNames.add(name.toLowerCase())
        // Auch alias-freundliche Variante (Bindestriche statt Leerzeichen)
        fileNames.add(name.toLowerCase().replace(/\s+/g, '-'))
      }
    }
  }

  walk(srcDir)
  return fileNames
}

// --- DM-Area Filterung ---

function isDMOnlyFile(content) {
  const fm = content.match(/^---\n([\s\S]*?)\n---/)
  if (!fm) return false
  return fm[1].includes('geheim')
}

function stripDMArea(content) {
  const DM_PATTERNS = [
    /^(?:---\s*\n+\s*)?>\s*\[!warning\]\s*DM-Area/m,
    /^#{1,6}\s+DM-Notizen\b/m,
    /^#{1,6}\s+DM-Wissen\b/m,
    /^#{1,6}\s+Geheimnisse\b/m,
  ]

  let cutPos = content.length
  for (const pat of DM_PATTERNS) {
    const m = content.match(pat)
    if (m && m.index < cutPos) cutPos = m.index
  }

  if (cutPos >= content.length) return content

  let result = content.slice(0, cutPos)
  const trimmed = result.trimEnd()
  if (trimmed.endsWith('\n---') || trimmed === '---') {
    result = trimmed.slice(0, -4)
  }

  return result.trimEnd() + '\n'
}

// --- Frontmatter: Private Properties entfernen ---

function stripPrivateProperties(content) {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/)
  if (!fmMatch) return content

  const fmLines = fmMatch[1].split('\n')
  const filtered = []
  let skipMultiline = false

  for (const line of fmLines) {
    // Erkennt "key: value" oder "key:" (Beginn eines Multiline-Werts)
    const keyMatch = line.match(/^(\w[\w-]*)\s*:/)
    if (keyMatch) {
      const key = keyMatch[1]
      skipMultiline = PRIVATE_PROPERTIES.has(key)
      if (!skipMultiline) filtered.push(line)
    } else if (skipMultiline && (line.startsWith('  ') || line.startsWith('\t') || line === '')) {
      // Fortsetzung eines übersprungenen Multiline-Werts → weglassen
      continue
    } else {
      skipMultiline = false
      filtered.push(line)
    }
  }

  // Leere Zeilen am Ende des Frontmatters kürzen
  while (filtered.length > 0 && filtered[filtered.length - 1].trim() === '') {
    filtered.pop()
  }

  const newFm = `---\n${filtered.join('\n')}\n---\n`
  return newFm + content.slice(fmMatch.index + fmMatch[0].length)
}

// --- Broken Wikilinks → Plaintext ---
// [[Target]] oder [[Target|Display]] oder [[Target#Section|Display]]
// Wenn Target nicht in validFiles → gibt nur den Display-Text aus

function stripBrokenWikilinks(content, validFiles) {
  return content.replace(/\[\[([^\]]+)\]\]/g, (match, inner) => {
    const pipeIdx = inner.indexOf('|')
    const ref = pipeIdx === -1 ? inner : inner.slice(0, pipeIdx)
    const display = pipeIdx === -1 ? ref : inner.slice(pipeIdx + 1)

    // Dateiname ohne #section-Anker
    const fileName = ref.split('#')[0].trim()

    // Leer oder nur Section-Anker → behalten
    if (!fileName) return match

    // Existiert die Datei?
    if (validFiles.has(fileName) || validFiles.has(fileName.toLowerCase())) {
      return match
    }

    // Nicht gefunden → Plaintext (kursiv, damit Leser sehen dass es noch kein Artikel ist)
    return `*${display.trim()}*`
  })
}

// --- Leaflet-Block → Leaflet.js HTML ---

function parseLeafletConfig(raw) {
  const cfg = {}
  for (const line of raw.split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.substring(0, colonIdx).trim()
    const val = line.substring(colonIdx + 1).trim()
    if (key) cfg[key] = val
  }
  return cfg
}

function convertLeafletBlocks(content) {
  return content.replace(/```leaflet\n([\s\S]*?)```/g, (_, raw) => {
    const cfg = parseLeafletConfig(raw)

    const id      = cfg['id'] ?? 'map'
    const imgRaw  = cfg['image'] ?? ''
    const imgFile = imgRaw.replace(/^\[\[/, '').replace(/\]\]$/, '').trim()
    // Quartz lowercases asset filenames and replaces spaces with dashes
    const imgPath = `/Pics/${imgFile.toLowerCase().replace(/\s+/g, '-')}`
    const height  = cfg['height'] ?? '600px'
    const minZoom = parseFloat(cfg['minZoom'] ?? '-2')
    const maxZoom = parseFloat(cfg['maxZoom'] ?? '4')
    const defZoom = parseFloat(cfg['defaultZoom'] ?? '-1')

    let boundsStr = (cfg['bounds'] ?? '[[0,0],[1024,1536]]').replace(/\s/g, '')

    const divId = `leaflet-map-${id}`

    return `
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin=""/>
<div class="eldara-map-wrap">
<div id="${divId}" style="height:${height};width:100%;border:1px solid var(--gray);border-radius:4px;"></div>
</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
<script>
(function(){
  function initMap(){
    var el=document.getElementById('${divId}');
    if(!el||el._lInit)return;
    el._lInit=true;
    var bounds=${boundsStr};
    var m=L.map('${divId}',{crs:L.CRS.Simple,minZoom:${minZoom},maxZoom:${maxZoom}});
    L.imageOverlay('${imgPath}',bounds).addTo(m);
    m.fitBounds(bounds);
    m.setZoom(${defZoom});
  }
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',initMap);
  } else { initMap(); }
  document.addEventListener('nav',function(){
    var el=document.getElementById('${divId}');
    if(el)el._lInit=false;
    initMap();
  });
})();
</script>
`
  })
}

// --- Folder-Index-Alias ---

function addFolderIndexAlias(content, filePath) {
  const fileName  = basename(filePath, '.md')
  const parentDir = basename(dirname(filePath))
  if (fileName.toLowerCase() !== parentDir.toLowerCase()) return content

  const alias = fileName.toLowerCase().replace(/\s+/g, '-')

  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/)
  if (fmMatch) {
    if (fmMatch[1].includes('aliases:')) return content
    const end = fmMatch.index + fmMatch[0].length
    const newFm = `---\n${fmMatch[1]}\naliases:\n  - ${alias}\n---\n`
    return newFm + content.slice(end)
  }
  return `---\naliases:\n  - ${alias}\n---\n\n${content}`
}

// --- Datei verarbeiten ---

function processFile(srcPath, destPath, validFiles) {
  let content = readFileSync(srcPath, 'utf8')
  // Normalize Windows line endings so all regex patterns work uniformly
  content = content.replace(/\r\n/g, '\n')

  if (isDMOnlyFile(content)) {
    console.log(`  EXCL ${relative(VAULT_DM, srcPath)} (tag: geheim)`)
    return false
  }

  content = stripDMArea(content)
  content = stripPrivateProperties(content)
  content = addFolderIndexAlias(content, srcPath)
  content = convertLeafletBlocks(content)
  content = stripBrokenWikilinks(content, validFiles)

  mkdirSync(dirname(destPath), { recursive: true })
  writeFileSync(destPath, content, 'utf8')
  return true
}

// --- Verzeichnis rekursiv durchgehen ---

function syncDir(srcDir, destDir, validFiles) {
  let entries
  try { entries = readdirSync(srcDir, { withFileTypes: true }) } catch { return }

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue

    const srcPath  = join(srcDir, entry.name)
    const cleanName = cleanFolderName(entry.name)

    if (entry.isDirectory()) {
      if (EXCLUDE_FOLDERS.has(entry.name) || EXCLUDE_FOLDERS.has(cleanName)) {
        console.log(`  SKIP folder: ${entry.name}`)
        continue
      }
      syncDir(srcPath, join(destDir, cleanName), validFiles)
    } else if (entry.isFile()) {
      if (EXCLUDE_FILES.has(entry.name)) {
        console.log(`  SKIP file:   ${entry.name}`)
        continue
      }
      if (extname(entry.name) === '.md') {
        const dest = join(destDir, entry.name)
        const ok = processFile(srcPath, dest, validFiles)
        if (ok) console.log(`  OK   ${relative(VAULT_DM, srcPath)}`)
      }
    }
  }
}

// --- Bilder kopieren (inkl. Pasted Images) ---

function syncPics() {
  const destDir = join(CONTENT, 'Pics')
  mkdirSync(destDir, { recursive: true })

  // Haupt-Pics-Ordner
  if (existsSync(VAULT_PICS)) {
    for (const file of readdirSync(VAULT_PICS)) {
      const src  = join(VAULT_PICS, file)
      const dest = join(destDir, file)
      if (statSync(src).isFile()) {
        copyFileSync(src, dest)
        console.log(`  IMG  ${file}`)
      }
    }
  } else {
    console.log('  Pics-Ordner nicht gefunden:', VAULT_PICS)
  }
}

// --- Hauptlauf ---

console.log('=== Eldara Vault Sync ===')
console.log('Quelle:', VAULT_DM)
console.log('Ziel:  ', CONTENT)
console.log()

mkdirSync(CONTENT, { recursive: true })

console.log('Bilder kopieren...')
syncPics()

console.log('\nDatei-Index aufbauen (für Broken-Link-Erkennung)...')
const validFiles = buildValidFileSet(VAULT_DM)
console.log(`  ${validFiles.size / 3 | 0} Dateien im Index`)  // /3 wegen 3 Varianten pro Datei

console.log('\nMarkdown synchronisieren...')
syncDir(VAULT_DM, CONTENT, validFiles)

// --- Leak-Guard ---

console.log('\nLeak-Check...')
const LEAK_TERMS = ['DM-Area', 'DM-Notizen', 'DM-Wissen', '\\[!warning\\]']
let leakFound = false

function checkDirForLeaks(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) { checkDirForLeaks(p); continue }
    if (!entry.name.endsWith('.md')) continue
    const text = readFileSync(p, 'utf8')
    for (const term of LEAK_TERMS) {
      if (new RegExp(term, 'i').test(text)) {
        console.error(`  LEAK in ${relative(CONTENT, p)}: enthält "${term}"`)
        leakFound = true
        break
      }
    }
  }
}

checkDirForLeaks(CONTENT)

if (leakFound) {
  console.error('\n✗ LEAK DETECTED — content/ enthält DM-Marker. Deploy NICHT starten!')
  process.exit(1)
}

console.log('\n✓ Fertig! content/ ist sauber.')
console.log('  Nächster Schritt: npx quartz build --serve')
