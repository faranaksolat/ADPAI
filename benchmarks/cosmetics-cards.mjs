// Authored development fixtures, frozen before the 1.11.1 model comparison.
// Synthetic only. Not independently annotated products or clinical validation.
const six=['Water','Glycerin','Niacinamide','Phenoxyethanol','Cocamidopropyl Betaine','Cocos Nucifera Oil'];
export const COSMETIC_CARDS=[
 {id:'en-authored-clear',language:'en',lines:['INGREDIENTS: Water, Glycerin, Niacinamide,','Phenoxyethanol, Cocamidopropyl Betaine,','Cocos Nucifera (Coconut) Oil.'],expected:six},
 {id:'ko-authored-clear',language:'ko',lines:['전성분: 정제수, 글리세린, 나이아신아마이드,','페녹시에탄올, 코카미도프로필베타인,','코코넛야자오일.'],expected:six},
 {id:'en-moisturizer',language:'en',lines:['INGREDIENTS: Water, Butylene Glycol, Panthenol,','Allantoin, Sodium Hyaluronate, Carbomer,','Disodium EDTA, Ethylhexylglycerin.'],expected:['Water','Butylene Glycol','Panthenol','Allantoin','Sodium Hyaluronate','Carbomer','Disodium EDTA','Ethylhexylglycerin']},
 {id:'ko-moisturizer',language:'ko',lines:['전성분: 정제수, 부틸렌글라이콜, 판테놀,','알란토인, 소듐하이알루로네이트, 카보머,','다이소듐이디티에이, 에틸헥실글리세린.'],expected:['Water','Butylene Glycol','Panthenol','Allantoin','Sodium Hyaluronate','Carbomer','Disodium EDTA','Ethylhexylglycerin']},
 {id:'en-cleanser',language:'en',lines:['INGREDIENTS: Water, Sodium Laureth Sulfate,','Decyl Glucoside, Sodium Cocoyl Isethionate,','Citric Acid, Sodium Benzoate.'],expected:['Water','Sodium Laureth Sulfate','Decyl Glucoside','Sodium Cocoyl Isethionate','Citric Acid','Sodium Benzoate']},
 {id:'ko-cleanser',language:'ko',lines:['전성분: 정제수, 소듐라우레스설페이트,','데실글루코사이드, 소듐코코일이세티오네이트,','시트릭애씨드, 소듐벤조에이트.'],expected:['Water','Sodium Laureth Sulfate','Decyl Glucoside','Sodium Cocoyl Isethionate','Citric Acid','Sodium Benzoate']},
 {id:'en-fragrance',language:'en',lines:['INGREDIENTS: Water, Parfum, Limonene,','Linalool, Citral, Benzyl Alcohol.'],expected:['Water','Fragrance','Limonene','Linalool','Citral','Benzyl Alcohol']},
 {id:'ko-fragrance',language:'ko',lines:['전성분: 정제수, 향료, 리모넨,','리날룰, 시트랄, 벤질알코올.'],expected:['Water','Fragrance','Limonene','Linalool','Citral','Benzyl Alcohol']},
 {id:'en-unknown-controls',language:'en',lines:['INGREDIENTS: Water, Glycerin,','Niacinamidx, Cocos Nucifera Xylo Oil.'],expected:['Water','Glycerin'],unknown_controls:['Niacinamidx','Cocos Nucifera Xylo Oil']},
 {id:'ko-unknown-controls',language:'ko',lines:['전성분: 정제수, 글리세린,','나이아신아마이두, 코코넛야자엑스오일.'],expected:['Water','Glycerin'],unknown_controls:['나이아신아마이두','코코넛야자엑스오일']},
];
