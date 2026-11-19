import {dietaryEvidence,normalizeDietary} from './dietary.js?v=1.11.1';
// Reuse shared lexical evidence for pork, beef and vegetarian preferences.
// No result establishes absence of animal-derived ingredients.
export function barcodeDietaryEvidence(product,preferences=[]){
 const prefs=normalizeDietary(preferences);
 if(!prefs.length||!product)return [];
 const lines=[product.ingredients,product.allergens,product.traces].filter(x=>typeof x==='string'&&x.trim());
 return dietaryEvidence(lines.map(text=>({words:[{text,score:1}]})),prefs);
}
