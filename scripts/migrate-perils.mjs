/**
 * migrate-perils.mjs
 * Migrates perils_data.json from old structure to new structure:
 *   old: { description (ambiance), mobile, senseurs, sciencesStellaires, definition (GM notes), protocole (string), resultat (string) }
 *   new: { texteAmbiance, mobile, senseurs, sciencesStellaires, description (GM notes), protocole [{role, action}], resultat [{seuil, effet}] }
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const inFile = path.join(__dirname, '..', 'perils_data.json');
const outFile = inFile; // Overwrite in place (backup manually first)
const backupFile = inFile + '.bak';

const raw = readFileSync(inFile, 'utf-8');
const data = JSON.parse(raw);

// Backup
writeFileSync(backupFile, raw, 'utf-8');
console.log('Backup created:', backupFile);

/**
 * Parse protocole string like:
 *   "1: Pilote: do something\n2: Ingénieur: do another"
 * into [{role, action}]
 * 
 * Also handles format "1 : Role : action" or just plain text (no numbered roles)
 */
function parseProtocole(str) {
  if (!str || !str.trim()) return [];
  const lines = str.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const result = [];
  
  // Try to detect numbered lines like "1:", "1 :", "2 :"
  const numberedPattern = /^\d+\s*:(.+)$/;
  
  for (const line of lines) {
    const m = line.match(numberedPattern);
    if (m) {
      // Content after the number: "Role : action" or "Role: action"
      const content = m[1].trim();
      const colonIdx = content.indexOf(':');
      if (colonIdx > -1) {
        const role = content.substring(0, colonIdx).trim();
        const action = content.substring(colonIdx + 1).trim();
        result.push({ role, action });
      } else {
        // No role separator, use content as action with empty role
        result.push({ role: '', action: content });
      }
    } else {
      // Non-numbered continuation line — append to last entry or create new
      if (result.length > 0) {
        result[result.length - 1].action += '\n' + line;
      } else {
        result.push({ role: '', action: line });
      }
    }
  }
  return result;
}

/**
 * Parse resultat string like:
 *   "0: collision\n1-3: rate\n4+: succès"
 * into [{seuil, effet}]
 * 
 * Handles: "0:", "1-3:", "4+:", "0 :", etc.
 */
function parseResultat(str) {
  if (!str || !str.trim()) return [];
  const lines = str.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const result = [];
  
  // Detect threshold lines: "0:", "1-3:", "4+:", "6 :", etc.
  const thresholdPattern = /^(\d+(?:[+-]\d*)?|\d+\s*-\s*\d+)\s*:(.+)$/;
  
  for (const line of lines) {
    const m = line.match(thresholdPattern);
    if (m) {
      result.push({ seuil: m[1].trim(), effet: m[2].trim() });
    } else if (line.match(/^(\d+(?:[+\-]?\d*)?)\s*:/)) {
      // Fallback: any "number:" pattern
      const colonIdx = line.indexOf(':');
      result.push({ seuil: line.substring(0, colonIdx).trim(), effet: line.substring(colonIdx + 1).trim() });
    } else {
      // Continuation of previous entry
      if (result.length > 0) {
        result[result.length - 1].effet += '\n' + line;
      } else {
        result.push({ seuil: '', effet: line });
      }
    }
  }
  return result;
}

let totalPerils = 0;
let alreadyMigrated = 0;

function migratePeril(p) {
  const d = p.data || {};
  
  // Check if already migrated (has texteAmbiance)
  if ('texteAmbiance' in d) {
    alreadyMigrated++;
    return p;
  }
  
  totalPerils++;
  
  const newData = {
    texteAmbiance: d.description || '',
    mobile: d.mobile || false,
    senseurs: d.senseurs || 0,
    sciencesStellaires: d.sciencesStellaires || 0,
    description: d.definition || '',
    protocole: Array.isArray(d.protocole) ? d.protocole : parseProtocole(d.protocole || ''),
    resultat: Array.isArray(d.resultat) ? d.resultat : parseResultat(d.resultat || ''),
  };
  
  return { ...p, data: newData };
}

// Process all categories
for (const type of ['interplanetaire', 'hyperspatial']) {
  for (const cat of data[type]?.categories || []) {
    cat.perils = (cat.perils || []).map(migratePeril);
  }
}

writeFileSync(outFile, JSON.stringify(data, null, 2), 'utf-8');
console.log(`Migration done: ${totalPerils} perils migrated, ${alreadyMigrated} already in new format`);
console.log('Output written to:', outFile);

// Quick preview of first peril
const first = data.interplanetaire?.categories?.[0]?.perils?.[0];
if (first) {
  console.log('\n=== First peril preview ===');
  console.log('nom:', first.nom);
  console.log('texteAmbiance:', first.data.texteAmbiance?.substring(0, 80) + '...');
  console.log('description:', first.data.description?.substring(0, 80) + '...');
  console.log('protocole:', JSON.stringify(first.data.protocole, null, 2));
  console.log('resultat:', JSON.stringify(first.data.resultat?.slice(0, 2), null, 2));
}
