import {writeFile} from 'node:fs/promises';
import {validGTIN,normalizeOFFResponse} from '../src/barcode-core.js';
// Actual packaged-product GTINs corroborated independently (not synthetic).
const samples=[
 ['8801043014830','Nongshim Shin Ramyun 5-pack; Korean RetailDB and distributor'],
 ['8801043150620','Nongshim Shin Ramyun 120 g; product barcode directory'],
 ['3017620422003','Nutella; documented Open Food Facts international control']
];
const results=[];
for(const [code,independentSource] of samples){
 if(!validGTIN(code))throw Error('Invalid GTIN '+code);
 const url='https://world.openfoodfacts.org/api/v2/product/'+code+'.json?fields='+encodeURIComponent('code,product_name,product_name_ko,product_name_en,brands,ingredients_text,ingredients_text_ko,allergens,traces,countries_tags,last_modified_t');
 const entry={barcode:code,independentSource,apiStatus:'UNTESTED'};
 try{
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),18000);
  let response;
  try{response=await fetch(url,{headers:{'User-Agent':'ADPAI-ReadOnlyBarcodeAudit/0.1 (https://github.com/faranaksolat/ADPAI)','Accept':'application/json'},signal:ctl.signal})}
  finally{clearTimeout(timer)}
  entry.httpStatus=response.status;
  if(!response.ok){entry.apiStatus='HTTP_ERROR';entry.error='HTTP '+response.status}
  else {
   const value=normalizeOFFResponse(code,await response.json());
   entry.apiStatus=value?'FOUND':'NOT_FOUND';
   entry.name=value?.name||null;
   entry.ingredientsPresent=Boolean(value?.ingredients);
   entry.ingredientsPreview=value?.ingredients?.slice(0,250)||null;
   entry.allergenTextPresent=Boolean(value?.allergens);
   entry.manufactureVerified=value?.manufactureVerified??false;
   entry.completeness=value?.completeness||'NO_CATALOG_RECORD';
   entry.sourceUrl=value?.sourceUrl||null;
  }
 }catch(err){entry.apiStatus='NETWORK_ERROR';entry.error=String(err.message||err)}
 results.push(entry);console.log(JSON.stringify(entry));
 await new Promise(resolve=>setTimeout(resolve,1500));
}
await writeFile('barcode-live-audit.json',JSON.stringify({timestamp:new Date().toISOString(),results,notice:'Real catalog queries. Labels and allergy risk not verified.'},null,2));
if(process.env.GITHUB_STEP_SUMMARY){
 const lines=['## Barcode lookup against live Open Food Facts','|GTIN|Independent product identification|Result|Ingredients|','|---|---|---|---|'];
 for(const x of results)lines.push('|'+x.barcode+'|'+x.independentSource+'|'+x.apiStatus+'|'+(x.ingredientsPresent?'Present (unverified)':'Not verified')+'|');
 lines.push('','Barcode validity is not evidence of allergen absence. Physical labels remain the authority.');
 await writeFile(process.env.GITHUB_STEP_SUMMARY,lines.join('\n')+'\n',{flag:'a'});
}
if(results.every(x=>x.apiStatus==='NETWORK_ERROR'))process.exitCode=2;
