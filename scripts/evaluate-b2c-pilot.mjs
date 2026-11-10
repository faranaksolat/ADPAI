import {readFile,writeFile} from 'node:fs/promises';
import {evaluateB2CPilot} from '../src/pilot-metrics.js';
if(process.argv.length<3){
 console.error('Usage: node scripts/evaluate-b2c-pilot.mjs path/to/independently-reviewed-pilot.json [output.json]');
 process.exit(2);
}
const input=JSON.parse(await readFile(process.argv[2],'utf8'));
const report=evaluateB2CPilot(input);
console.log(JSON.stringify(report,null,2));
if(process.argv[3])await writeFile(process.argv[3],JSON.stringify(report,null,2)+'\n');
if(report.eligible===0)console.error('No eligible double-reviewed real cases: no accuracy rate can be claimed.');
