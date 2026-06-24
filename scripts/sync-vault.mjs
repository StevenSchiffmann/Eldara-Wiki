#!/usr/bin/env node
/**
 * sync-vault.mjs
 * Kopiert DnD-Obsidian-Vault nach WikiSeite/content/.
 * - Filtert DM-Area-Blöcke raus (alles ab "> [!warning] DM-Area")
 * - Konvertiert leaflet-Code-Blöcke zu interaktivem Leaflet.js HTML
 * - Kopiert Bilder nach content/Pics/
 * - Schließt DM-only-Dateien aus
 *
 * Aufruf: node scripts/sync-vault.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync, statSync } from 'fs'
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
  '.md',  // leere Datei
])

const EXCLUDE_FOLDERS = new Set([
  'Quests',
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

// --- DM-Area Filterung ---

function stripDMArea(content) {
  // Alles ab "> [!warning] DM-Area" (mit oder ohne vorangehendem ---)
  // wird entfernt. Der Block geht bis zum Dateiende.
  const patterns = [
    /\n---\s*\n\s*>\s*\[!warning\]\s*DM-Area[\s\S]*/,
    /\n>\s*\[!warning\]\s*DM-Area[\s\S]*/,
  ]
  for (const pat of patterns) {
    const match = content.match(pat)
    if (match) {
      return content.substring(0, match.index).trimEnd() + '\n'
    }
  }
  return content
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
    // [[AndurinMap.png]] → /Pics/AndurinMap.png
    const imgFile = imgRaw.replace(/^\[\[/, '').replace(/\]\]$/, '').trim()
    const imgPath = `/Pics/${imgFile}`
    const height  = cfg['height'] ?? '600px'
    const minZoom = parseFloat(cfg['minZoom'] ?? '-2')
    const maxZoom = parseFloat(cfg['maxZoom'] ?? '4')
    const defZoom = parseFloat(cfg['defaultZoom'] ?? '-1')

    // Bounds parsen: "[[0,0], [1024,1536]]"
    let boundsStr = (cfg['bounds'] ?? '[[0,0],[1024,1536]]').replace(/\s/g, '')

    const divId = `leaflet-map-${id}`

    return `
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin=""/>
<div class="eldara-map-wrap">
<div id="${divId}" style="height:${height};width:100%;"></div>
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

// --- Wikilinks in Map-Dateien: [[AndurinMap.png]] → angepassten Link ---
// (wird direkt im HTML durch Leaflet ersetzt, kein weiterer Schritt nötig)

// --- Datei verarbeiten ---

function processFile(srcPath, destPath) {
  let content = readFileSync(srcPath, 'utf8')
  content = stripDMArea(content)
  content = convertLeafletBlocks(content)
  mkdirSync(dirname(destPath), { recursive: true })
  writeFileSync(destPath, content, 'utf8')
}

// --- Verzeichnis rekursiv durchgehen ---

function syncDir(srcDir, destDir) {
  const entries = readdirSync(srcDir, { withFileTypes: true })

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue

    const srcPath  = join(srcDir, entry.name)
    const cleanName = cleanFolderName(entry.name)

    if (entry.isDirectory()) {
      if (EXCLUDE_FOLDERS.has(entry.name) || EXCLUDE_FOLDERS.has(cleanName)) {
        console.log(`  SKIP folder: ${entry.name}`)
        continue
      }
      syncDir(srcPath, join(destDir, cleanName))
    } else if (entry.isFile()) {
      if (EXCLUDE_FILES.has(entry.name)) {
        console.log(`  SKIP file:   ${entry.name}`)
        continue
      }
      if (extname(entry.name) === '.md') {
        const dest = join(destDir, entry.name)
        processFile(srcPath, dest)
        console.log(`  OK   ${relative(VAULT_DM, srcPath)}`)
      }
    }
  }
}

// --- Bilder kopieren ---

function syncPics() {
  const destDir = join(CONTENT, 'Pics')
  mkdirSync(destDir, { recursive: true })

  if (!existsSync(VAULT_PICS)) {
    console.log('  Pics-Ordner nicht gefunden:', VAULT_PICS)
    return
  }

  for (const file of readdirSync(VAULT_PICS)) {
    const src  = join(VAULT_PICS, file)
    const dest = join(destDir, file)
    if (statSync(src).isFile()) {
      copyFileSync(src, dest)
      console.log(`  IMG  ${file}`)
    }
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

console.log('\nMarkdown synchronisieren...')
syncDir(VAULT_DM, CONTENT)

console.log('\n✓ Fertig! content/ ist aktuell.')
console.log('  Nächster Schritt: npx quartz build --serve')
