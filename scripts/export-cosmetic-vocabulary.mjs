import fs from 'node:fs/promises';
import {COSMETIC_GLOSSARY} from '../src/cosmetic-glossary.js';
const target=process.argv[2];if(!target)throw Error('Usage: node scripts/export-cosmetic-vocabulary.mjs OUTPUT.csv');
const fields=['id','inci','ko','aliases','english_explanation','korean_explanation','named_sources','source_questions','review_status'];
const quote=value=>'"'+String(value).replaceAll('"','""')+'"';
const rows=COSMETIC_GLOSSARY.map(e=>[e.id,e.inci,e.ko,e.aliases.join(' | '),e.explanation.en,e.explanation.ko,e.named_sources.join('|'),e.source_questions.join('|'),e.review_status]);
await fs.writeFile(target,'\uFEFF'+[fields,...rows].map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n');
console.log(`${COSMETIC_GLOSSARY.length} authored draft identities exported; not an official or complete INCI inventory.`);
