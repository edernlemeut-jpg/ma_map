import { readFileSync, writeFileSync } from 'fs';
const raw = readFileSync('./src/seeds/_raw.js', 'utf8');
// Remove the trailing semicolon from "};", fix encoding issues, then eval
const cleaned = raw.replace(/\};\s*$/, '}');
const start = cleaned.indexOf('{');
// eslint-disable-next-line no-eval
const obj = eval('(' + cleaned.slice(start) + ')');
delete obj.metadata;
writeFileSync('./src/seeds/rules-data.json', JSON.stringify(obj, null, 2), 'utf8');
console.log('OK');
for (const k of Object.keys(obj)) console.log(k, obj[k].length);
