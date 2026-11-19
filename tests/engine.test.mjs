
import assert from "node:assert/strict";
import {
  evaluateProduct,
  REQUIRED_BASE_FAMILIES,
} from "../src/engine.js";

const profileMilk = { allergens: ["milk"], custom_avoid: [] };

function source(familyId, lines, score=0.9) {
  return {
    familyId,
    items: lines.map(text => ({ text, score })),
  };
}

function fullStatus() {
  return Object.fromEntries(REQUIRED_BASE_FAMILIES.map(id => [id, {ok:true}]));
}

// 1) Korean cross-contact must be caution, not conflict.
{
  const x = evaluateProduct({
    sources: [
      source("korean", [
        "원재료명 밀가루, 설탕",
        "우유, 돼지고기, 계란, 새우, 게 혼입가능",
      ]),
    ],
    profile: profileMilk,
    familyStatus: fullStatus(),
    requiredFamilies: REQUIRED_BASE_FAMILIES,
  });
  assert.equal(x.status, "caution");
  assert.equal(x.caution_matches[0].allergen_id, "milk");
}

// 2) French ingredient milk must be direct conflict.
{
  const x = evaluateProduct({
    sources: [
      source("latin", [
        "INGRÉDIENTS: sucre, poudre de lait entier, beurre de cacao, lait, soja",
      ]),
    ],
    profile: profileMilk,
    familyStatus: fullStatus(),
    requiredFamilies: REQUIRED_BASE_FAMILIES,
  });
  assert.equal(x.status, "conflict");
}

// 3) Persian milk in ingredients must be direct conflict.
{
  const x = evaluateProduct({
    sources: [
      source("arabic", [
        "ترکیبات: شکر، پودر شیر، کره کاکائو، وانیل",
      ]),
    ],
    profile: profileMilk,
    familyStatus: fullStatus(),
    requiredFamilies: REQUIRED_BASE_FAMILIES,
  });
  assert.equal(x.status, "conflict");
  assert.equal(x.direct_matches[0].allergen_id, "milk");
}

// 4) A negative is blocked if even one required OCR family failed.
{
  const st = fullStatus();
  st.arabic = {ok:false, error:"model failed"};
  const x = evaluateProduct({
    sources: [
      source("en", ["INGREDIENTS: cocoa mass, sugar, cocoa butter, lecithin"]),
    ],
    profile: profileMilk,
    familyStatus: st,
    requiredFamilies: REQUIRED_BASE_FAMILIES,
  });
  assert.equal(x.status, "unverified");
}

// 5) A multilingual hinted Persian panel cannot be ignored.
{
  const x = evaluateProduct({
    sources: [
      source("en", [
        "DARK CHOCOLATE INGREDIENTS: cocoa mass, sugar, cocoa butter",
        "PER",
      ]),
      source("arabic", ["متن فارسی نامشخص"], 0.75),
    ],
    profile: profileMilk,
    familyStatus: fullStatus(),
    requiredFamilies: REQUIRED_BASE_FAMILIES,
  });
  assert.equal(x.status, "unverified");
}

// 6) Learned correction is positive-only and can escalate to conflict.
{
  const x = evaluateProduct({
    sources: [
      source("en", ["INGREDIENTS: cocoa mass, sugar, cocoa butter"]),
    ],
    profile: profileMilk,
    familyStatus: fullStatus(),
    requiredFamilies: REQUIRED_BASE_FAMILIES,
    learnedTexts: ["ترکیبات: پودر شیر، شکر"],
  });
  assert.equal(x.status, "conflict");
}

// 7) Cocoa butter is NOT dairy milk.
{
  const x = evaluateProduct({
    sources: [
      source("en", ["INGREDIENTS: cocoa mass, sugar, cocoa butter, lecithin"]),
    ],
    profile: profileMilk,
    familyStatus: fullStatus(),
    requiredFamilies: REQUIRED_BASE_FAMILIES,
  });
  assert.equal(x.status, "unverified"); // OCR cannot certify complete panel coverage.
}

// 8) Persian cocoa butter is NOT dairy milk.
{
  const x = evaluateProduct({
    sources: [
      source("arabic", ["ترکیبات: شکر، کره کاکائو، پودر کاکائو"]),
    ],
    profile: profileMilk,
    familyStatus: fullStatus(),
    requiredFamilies: REQUIRED_BASE_FAMILIES,
  });
  assert.equal(x.status, "unverified");
}

// 9) Persian milk powder remains a direct dairy conflict even if cocoa butter is present.
{
  const x = evaluateProduct({
    sources: [
      source("arabic", ["ترکیبات: شکر، کره کاکائو، شیر خشک"]),
    ],
    profile: profileMilk,
    familyStatus: fullStatus(),
    requiredFamilies: REQUIRED_BASE_FAMILIES,
  });
  assert.equal(x.status, "conflict");
}

// 10) Plant milk phrase alone does not create a dairy conflict.
{
  const x = evaluateProduct({
    sources: [
      source("en", ["INGREDIENTS: oats, water, almond milk, cocoa"]),
    ],
    profile: profileMilk,
    familyStatus: fullStatus(),
    requiredFamilies: REQUIRED_BASE_FAMILIES,
  });
  assert.equal(x.status, "unverified");
}

// 11) Split "COCOA" + "BUTTER" must not become a Milk mention/conflict.
{
  const x = evaluateProduct({
    sources: [
      source("latin", ["DARK CHOCOLATE INGREDIENTS: COCOA MASS, SUGAR, COCOA", "BUTTER, LECITHIN (E322) & VANILLIN"]),
    ],
    profile: profileMilk,
    familyStatus: fullStatus(),
    requiredFamilies: REQUIRED_BASE_FAMILIES,
  });
  assert.equal(x.status, "unverified");
}

// 12) Real Persian milk remains conflict even when cocoa butter is split nearby.
{
  const x = evaluateProduct({
    sources: [
      source("arabic", ["ترکیبات: شکر، کره", "کاکائو، شیر خشک، وانیل"]),
    ],
    profile: profileMilk,
    familyStatus: fullStatus(),
    requiredFamilies: REQUIRED_BASE_FAMILIES,
  });
  assert.equal(x.status, "conflict");
}

console.log("ADPAI deterministic safety regressions: PASS");

// Crown strawberry Victory Pie, photographed Korean package (2026-11-19).
// These are human-transcribed label strings, NOT a successful OCR benchmark.
{
 const declared=source('korean',['원재료명 밀가루, 설탕, 코코아분말','밀, 우유, 대두 함유']);
 for(const [id,term] of [['milk','우유'],['wheat','밀'],['soy','대두']]){
  const result=evaluateProduct({sources:[declared],profile:{allergens:[id]},familyStatus:fullStatus()});
  assert.equal(result.status,'conflict',id);
  assert.ok(result.direct_matches.some(h=>h.allergen_id===id&&h.term===term),id);
 }
 const warning=source('korean',['땅콩, 계란, 돼지고기, 쇠고기 혼입 가능']);
 for(const id of ['peanut','egg']){
  const result=evaluateProduct({sources:[warning],profile:{allergens:[id]},familyStatus:fullStatus()});
  assert.equal(result.status,'caution',id);
  assert.ok(result.caution_matches.some(h=>h.allergen_id===id),id);
 }
}