import {readFile} from 'node:fs/promises';
import {auditKoreanCatalog} from '../src/catalog-core.js';
const file=process.argv[2]||'data/catalog-korea-verified.json';
const data=JSON.parse(await readFile(file,'utf8'));
const result=auditKoreanCatalog(data);
console.log(JSON.stringify(result,null,2));
if(!result.valid)process.exitCode=1;
