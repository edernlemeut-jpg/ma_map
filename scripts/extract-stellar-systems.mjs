/**
 * extract-stellar-systems.mjs
 * Extrait tous les systèmes stellaires des livres Metal Adventures
 * Usage: node scripts/extract-stellar-systems.mjs
 */

import fs from 'fs';
import path from 'path';
import { PDFParse } from 'pdf-parse';

const BOOKS_DIR = 'donnee_base/Livres';
const OUT_DIR = 'tmp_pdf_texts';
const OUT_JSON = 'donnee_base/systemes_stellaires.json';

const PDF_FILES = [
  { key: 'gdm', file: 'V1.5/MA - Guide du Meneur 1.5.pdf', label: 'Guide du Meneur 1.5' },
  { key: 'ma05', file: 'MA05 - La prise et le profit.pdf', label: 'MA05 - La prise et le profit' },
  { key: 'ma06', file: 'MA06 - La guerre et la désolation.pdf', label: 'MA06 - La guerre et la désolation' },
  { key: 'ma07', file: 'MA07 - Le Roi et le Peuple.pdf', label: 'MA07 - Le Roi et le Peuple' },
  { key: 'ma08', file: "MA08 - Les sciences et l'infini.pdf", label: "MA08 - Les sciences et l'infini" },
  { key: 'ma09', file: 'MA09 - Le Fer & Le Sang.pdf', label: 'MA09 - Le Fer & Le Sang' },
  { key: 'ma10', file: 'MA10 - La Belle & La Bête.pdf', label: 'MA10 - La Belle & La Bête' },
  { key: 'ma11', file: 'MA11 - Les pirates de l\'espace.pdf', label: "MA11 - Les pirates de l'espace" },
  { key: 'ma12', file: 'MA12 - Les trésors du dernier millénaire.pdf', label: 'MA12 - Les trésors du dernier millénaire' },
];

// ─── Extraction PDF → texte par page ─────────────────────────────────────────

async function extractPdfPages(filepath) {
  const buf = fs.readFileSync(filepath);
  const parser = new PDFParse({ data: buf });
  const result = await parser.getText();
  // Retourne un tableau de { num, text }
  return result.pages;
}

// ─── Nettoyage du texte ───────────────────────────────────────────────────────

function cleanText(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ─── Extraction des systèmes stellaires ──────────────────────────────────────

/**
 * Détecte les blocs de présentation d'un système planétaire.
 * Le GdM présente chaque système avec un nom suivi de:
 *   Coordonnées, Nationalité, Route, Gouvernement, Patrouillé
 * Les modules ont souvent un format légèrement différent.
 */
function extractSystems(pages, sourceLabel) {
  const fullText = pages.map(p => p.text).join('\n\n<<<PAGE>>>\n\n');
  const systems = [];

  // ── Pattern 1 : blocs GdM style "Nom du système ... Coordonnées : ..." ──
  // Le GdM présente les systèmes avec des >>  ou des sections nommées
  // Exemple : ">> Présentation générale" suivi du nom du système
  
  // Cherchons les blocs qui contiennent des coordonnées de quadrant
  // Format: "Q" + lettre + chiffre (ex: QB3, QA7, QD12...)
  const quadrantPattern = /Q[A-Za-z]\d+/g;
  
  // Pattern pour détecter un système :
  // Bloc de texte contenant Coordonnées + Nationalité + Route + Gouvernement
  const systemBlockPattern = /([^\n]{3,60})\n[\s\S]{0,500}?Coordonn[eé]es?\s*:?\s*([^\n]+)\n[\s\S]{0,200}?Nationalit[eé]\s*:?\s*([^\n]+)\n[\s\S]{0,200}?Route\s*:?\s*([^\n]+)\n[\s\S]{0,200}?Gouvernement\s*:?\s*([^\n]+)/gi;

  let match;
  while ((match = systemBlockPattern.exec(fullText)) !== null) {
    const rawName = match[1].trim();
    // Filtrer les faux positifs (titres de section, etc.)
    if (rawName.length < 3 || rawName.length > 80) continue;
    if (/^(>>|page|chapitre|section|présentation)/i.test(rawName)) continue;

    // Récupérer le contexte autour pour plus d'infos
    const start = Math.max(0, match.index - 200);
    const end = Math.min(fullText.length, match.index + 1500);
    const context = fullText.substring(start, end);

    // Chercher patrouillé et autres champs
    const patrouille = extractField(context, /[Pp]atrouill[eé][^:]*:?\s*([^\n]+)/);
    const ceinture  = extractField(context, /[Cc]einture.{0,30}:?\s*([^\n]+)/);

    systems.push({
      nom: cleanSystemName(rawName),
      coordonnees: match[2].trim(),
      nationalite: match[3].trim(),
      route: match[4].trim(),
      gouvernement: match[5].trim(),
      patrouille: patrouille || '',
      ceinture_asteroides: ceinture || '',
      source: sourceLabel,
      contexte_brut: context.trim().substring(0, 800),
    });
  }

  return systems;
}

function extractField(text, pattern) {
  const m = text.match(pattern);
  return m ? m[1].trim() : '';
}

function cleanSystemName(name) {
  return name
    .replace(/^[\s>>*#•\-–]+/, '')
    .replace(/[\s>>*#•\-–]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Extraction Système Havana (section dédiée GdM) ──────────────────────────

function extractHavanaSystem(pages) {
  const fullText = pages.map(p => p.text).join('\n');
  
  // La section Havana commence vers la page 180 du GdM
  const havanaStart = fullText.indexOf('système havana');
  const havanaStartAlt = fullText.toLowerCase().indexOf('le système havana');
  const startIdx = Math.max(havanaStart, havanaStartAlt);
  
  if (startIdx === -1) return null;
  
  const section = fullText.substring(startIdx, startIdx + 15000);
  
  // Extraire les corps célestes principaux du système Havana
  const havanaData = {
    nom: 'Havana',
    section_dedieee: true,
    source: 'Guide du Meneur 1.5',
    description: '',
    planetes: [],
    lieux: [],
  };

  // Présentation générale
  const presMatch = section.match(/[Pp]r[eé]sentation\s+g[eé]n[eé]rale[\s\S]{0,50}\n([\s\S]{0,1000})/);
  if (presMatch) havanaData.description = presMatch[1].trim().substring(0, 500);
  
  // Carte du système
  const carteMatch = section.match(/[Cc]arte\s+du\s+syst[eè]me[\s\S]{0,1500}/);
  
  // Lieux nommés dans Havana
  const lieuxPatterns = [
    /Havana\s+City/gi,
    /Bateau\s+de\s+p[eê]che/gi,
    /Annabella/gi,
    /Diseuse\s+de\s+bonne\s+aventure/gi,
    /Domingo/gi,
    /Rosa\s+Maria/gi,
    /Stella\s+Bell/gi,
  ];
  
  for (const pat of lieuxPatterns) {
    const m = section.match(pat);
    if (m) havanaData.lieux.push(m[0].trim());
  }

  return havanaData;
}

// ─── Extraction systèmes dans les modules (format différent) ─────────────────

function extractModuleSystems(pages, sourceLabel) {
  const fullText = pages.map(p => p.text).join('\n\n<<<PAGE>>>\n\n');
  const systems = [];

  // Dans les modules, les systèmes apparaissent souvent comme contexte de l'aventure
  // Cherchons les patterns : "le système de X", "système X", "planète X", "station X"
  
  // Pattern 1: "Présentation du système" ou "Le système de ..."
  const sysIntroPattern = /(?:syst[eè]me\s+(?:de\s+|d[eu']\s*)?([A-ZÀÂÄÉÈÊËÏÎÔÙÛÜ][^\n,;.]{2,40})|([A-ZÀÂÄÉÈÊËÏÎÔÙÛÜ][A-Za-zÀÂÄÉÈÊËÏÎÔÙÛÜàâäéèêëïîôùûü\s']{3,40})\s*\n[\s\S]{0,300}?(?:Coordonn[eé]es|quadrant|Q[A-Z]\d))/gm;
  
  let match;
  while ((match = sysIntroPattern.exec(fullText)) !== null) {
    const name = (match[1] || match[2] || '').trim();
    if (!name || name.length < 3) continue;
    
    const start = match.index;
    const end = Math.min(fullText.length, start + 2000);
    const context = fullText.substring(start, end);
    
    const coordMatch = context.match(/Q[A-Z]\d{1,2}/i);
    const natMatch = context.match(/[Nn]ationalit[eé]\s*:?\s*([^\n]+)/);
    const routeMatch = context.match(/[Rr]oute\s*:?\s*([^\n]+)/);
    const gouvMatch = context.match(/[Gg]ouvernement\s*:?\s*([^\n]+)/);

    if (coordMatch || natMatch) {
      systems.push({
        nom: cleanSystemName(name),
        coordonnees: coordMatch ? coordMatch[0] : '',
        nationalite: natMatch ? natMatch[1].trim() : '',
        route: routeMatch ? routeMatch[1].trim() : '',
        gouvernement: gouvMatch ? gouvMatch[1].trim() : '',
        patrouille: '',
        ceinture_asteroides: '',
        source: sourceLabel,
        contexte_brut: context.trim().substring(0, 600),
      });
    }
  }

  return systems;
}

// ─── Dédoublonnage ────────────────────────────────────────────────────────────

function deduplicateSystems(systems) {
  const seen = new Map();
  for (const sys of systems) {
    const key = normalize(sys.nom);
    if (!seen.has(key)) {
      seen.set(key, { ...sys, sources: [sys.source] });
    } else {
      const existing = seen.get(key);
      if (!existing.sources.includes(sys.source)) {
        existing.sources.push(sys.source);
      }
      // Enrichir les champs vides
      for (const field of ['coordonnees', 'nationalite', 'route', 'gouvernement', 'patrouille', 'ceinture_asteroides']) {
        if (!existing[field] && sys[field]) existing[field] = sys[field];
      }
    }
  }
  return [...seen.values()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

function normalize(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

// ─── Programme principal ──────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const allSystems = [];
  let havanaSystem = null;

  for (const book of PDF_FILES) {
    const filepath = path.join(BOOKS_DIR, book.file);
    if (!fs.existsSync(filepath)) {
      console.warn(`  [SKIP] Fichier introuvable: ${filepath}`);
      continue;
    }

    console.log(`\n[${book.key.toUpperCase()}] Extraction de : ${book.label}`);
    
    // Cache texte
    const txtPath = path.join(OUT_DIR, `${book.key}.txt`);
    let pages;
    
    if (fs.existsSync(txtPath)) {
      console.log(`  → Texte en cache: ${txtPath}`);
      const raw = fs.readFileSync(txtPath, 'utf8');
      // Reconstruire un tableau pages minimal depuis le cache
      pages = raw.split('\n\n<<<PAGE>>>\n\n').map((text, i) => ({ num: i + 1, text }));
    } else {
      console.log(`  → Extraction PDF...`);
      pages = await extractPdfPages(filepath);
      const cacheText = pages.map(p => p.text).join('\n\n<<<PAGE>>>\n\n');
      fs.writeFileSync(txtPath, cacheText, 'utf8');
      console.log(`  → Texte sauvegardé: ${txtPath} (${cacheText.length} chars, ${pages.length} pages)`);
    }

    // Extraction systèmes
    let systems;
    if (book.key === 'gdm') {
      systems = extractSystems(pages, book.label);
      havanaSystem = extractHavanaSystem(pages);
      console.log(`  → ${systems.length} systèmes trouvés (pattern GdM)`);
    } else {
      systems = extractModuleSystems(pages, book.label);
      console.log(`  → ${systems.length} systèmes/lieux trouvés (pattern module)`);
    }

    allSystems.push(...systems);
  }

  // Dédoublonnage
  const merged = deduplicateSystems(allSystems);
  console.log(`\n✓ Total unique: ${merged.length} systèmes`);

  // JSON final
  const output = {
    meta: {
      genere_le: new Date().toISOString(),
      sources: PDF_FILES.map(b => b.label),
      total_systemes: merged.length,
    },
    systeme_havana: havanaSystem,
    systemes: merged,
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(output, null, 2), 'utf8');
  console.log(`\n✓ Document JSON créé : ${OUT_JSON}`);

  // Résumé texte
  const summaryLines = [`# Systèmes Stellaires - Metal Adventures\n`,
    `Généré le ${new Date().toLocaleDateString('fr-FR')}\n`,
    `Sources : ${PDF_FILES.map(b => b.label).join(', ')}\n`,
    `---\n`,
  ];
  for (const sys of merged) {
    summaryLines.push(`## ${sys.nom}`);
    if (sys.coordonnees)       summaryLines.push(`- **Coordonnées** : ${sys.coordonnees}`);
    if (sys.nationalite)       summaryLines.push(`- **Nationalité** : ${sys.nationalite}`);
    if (sys.route)             summaryLines.push(`- **Route** : ${sys.route}`);
    if (sys.gouvernement)      summaryLines.push(`- **Gouvernement** : ${sys.gouvernement}`);
    if (sys.patrouille)        summaryLines.push(`- **Patrouille** : ${sys.patrouille}`);
    if (sys.ceinture_asteroides) summaryLines.push(`- **Ceinture d'astéroïdes** : ${sys.ceinture_asteroides}`);
    summaryLines.push(`- **Sources** : ${(sys.sources || [sys.source]).join(', ')}`);
    summaryLines.push('');
  }

  const summaryPath = 'donnee_base/systemes_stellaires.md';
  fs.writeFileSync(summaryPath, summaryLines.join('\n'), 'utf8');
  console.log(`✓ Document Markdown créé : ${summaryPath}`);
}

main().catch(err => {
  console.error('Erreur fatale:', err);
  process.exit(1);
});
