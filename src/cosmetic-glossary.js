// Authored starter vocabulary, not a downloaded INCI inventory or a clinical
// allergy database. Korean aliases and descriptions require independent review.
export const COSMETIC_CATALOG_META=Object.freeze({version:'0.1.0',review_status:'authored_draft_not_independently_reviewed',complete:false,
 reference_targets:['https://ec.europa.eu/growth/tools-databases/cosing/','https://kcia.or.kr/cid/'],
 reference_access:'CosIng returned HTTP 403 in this environment on 2026-10-29; no official inventory was imported.'});
export const COSMETIC_ROLES={
 solvent:{en:'Helps dissolve or carry other ingredients.',ko:'다른 성분을 녹이거나 담는 데 쓰입니다.'},
 humectant:{en:'Helps hold moisture in the skin or product.',ko:'피부나 제품에 수분을 유지하도록 돕습니다.'},
 emollient:{en:'Helps soften skin or reduce moisture loss.',ko:'피부를 부드럽게 하거나 수분 손실을 줄이는 데 쓰입니다.'},
 cleanser:{en:'Helps remove oil and dirt or form cleansing foam.',ko:'유분과 오염을 씻거나 세정 거품을 만드는 데 쓰입니다.'},
 emulsifier:{en:'Helps oil and water mix or keeps a formula blended.',ko:'물과 기름을 섞거나 제형이 분리되지 않도록 돕습니다.'},
 thickener:{en:'Adjusts thickness or texture.',ko:'제품의 점도나 질감을 조절합니다.'},
 preservative:{en:'Helps limit microbial growth in the product.',ko:'제품에서 미생물이 자라는 것을 억제하는 데 쓰입니다.'},
 fragrance:{en:'A fragrance ingredient. The name does not establish suitability for sensitive skin.',ko:'향을 내는 성분입니다. 이름만으로 민감한 피부에 적합한지 판단할 수 없습니다.'},
 antioxidant:{en:'Helps limit oxidation. Effects depend on the complete formula.',ko:'산화를 줄이는 데 쓰입니다. 효과는 전체 처방에 따라 달라집니다.'},
 uv_filter:{en:'A UV-filter ingredient. This name alone does not establish SPF or protection.',ko:'자외선 차단 성분입니다. 이름만으로 자외선 차단 지수나 효과를 알 수 없습니다.'},
 colorant:{en:'Adds colour or opacity. Use and limits depend on the product and region.',ko:'색이나 불투명함을 더합니다. 사용 조건은 제품과 지역에 따라 다릅니다.'},
 buffer:{en:'Adjusts or buffers the product acidity (pH).',ko:'제품의 산도(pH)를 조절하거나 유지하는 데 쓰입니다.'},
 chelator:{en:'Binds trace metal ions to help keep a formula stable.',ko:'미량의 금속 이온을 묶어 제형이 안정적으로 유지되도록 돕습니다.'},
 conditioning:{en:'Helps condition skin or hair. Its name does not establish allergy safety.',ko:'피부나 모발을 정돈하는 데 쓰입니다. 이름만으로 알레르기 안전을 확인할 수 없습니다.'},
 botanical:{en:'A named plant ingredient. Plant origin does not establish allergy safety.',ko:'식물 유래 성분입니다. 식물성이라는 이유로 알레르기에 안전한 것은 아닙니다.'},
 active:{en:'Used for a product function. Purpose, effects and tolerance depend on concentration and the complete formula.',ko:'제품의 기능을 위해 쓰이는 성분입니다. 용도와 효과·자극 가능성은 농도와 전체 처방에 따라 달라집니다.'},
};
// INCI | Korean label alias | common role. Exact identities only; do not
// generate botanical families, source certifications or clinical risk classes.
const rows=`
Water|정제수|solvent
Alcohol|에탄올|solvent
Alcohol Denat.|변성알코올|solvent
Isopropyl Alcohol|아이소프로필알코올|solvent
Glycerin|글리세린|humectant
Butylene Glycol|부틸렌글라이콜|humectant
Propylene Glycol|프로필렌글라이콜|humectant
Pentylene Glycol|펜틸렌글라이콜|humectant
Hexylene Glycol|헥실렌글라이콜|humectant
Dipropylene Glycol|다이프로필렌글라이콜|humectant
Propanediol|프로판다이올|humectant
1,2-Hexanediol|1,2-헥산다이올|humectant
Caprylyl Glycol|카프릴릴글라이콜|humectant
Ethylhexylglycerin|에틸헥실글리세린|conditioning
Sodium Hyaluronate|소듐하이알루로네이트|humectant
Hyaluronic Acid|하이알루로닉애씨드|humectant
Hydrolyzed Hyaluronic Acid|하이드롤라이즈드하이알루로닉애씨드|humectant
Sodium Acetylated Hyaluronate|소듐아세틸레이티드하이알루로네이트|humectant
Sodium Hyaluronate Crosspolymer|소듐하이알루로네이트크로스폴리머|humectant
Hydrolyzed Sodium Hyaluronate|하이드롤라이즈드소듐하이알루로네이트|humectant
Betaine|베타인|humectant
Sodium PCA|소듐피씨에이|humectant
PCA|피씨에이|humectant
Urea|우레아|humectant
Hydroxyethyl Urea|하이드록시에틸우레아|humectant
Sorbitol|솔비톨|humectant
Trehalose|트레할로오스|humectant
Sodium Lactate|소듐락테이트|humectant
Panthenol|판테놀|conditioning
Allantoin|알란토인|conditioning
Ectoin|엑토인|conditioning
Beta-Glucan|베타-글루칸|conditioning
Niacinamide|나이아신아마이드|active
Adenosine|아데노신|active
Alpha-Arbutin|알파-알부틴|active
Arbutin|알부틴|active
Tranexamic Acid|트라넥사믹애씨드|active
Ascorbic Acid|아스코빅애씨드|antioxidant
Ascorbyl Glucoside|아스코빌글루코사이드|antioxidant
Sodium Ascorbyl Phosphate|소듐아스코빌포스페이트|antioxidant
Magnesium Ascorbyl Phosphate|마그네슘아스코빌포스페이트|antioxidant
3-O-Ethyl Ascorbic Acid|3-O-에틸아스코빅애씨드|antioxidant
Tetrahexyldecyl Ascorbate|테트라헥실데실아스코베이트|antioxidant
Tocopherol|토코페롤|antioxidant
Tocopheryl Acetate|토코페릴아세테이트|antioxidant
Retinol|레티놀|active
Retinal|레티날|active
Retinyl Palmitate|레티닐팔미테이트|active
Bakuchiol|바쿠치올|active
Salicylic Acid|살리실릭애씨드|active
Glycolic Acid|글라이콜릭애씨드|active
Lactic Acid|락틱애씨드|active
Mandelic Acid|만델릭애씨드|active
Gluconolactone|글루코노락톤|active
Lactobionic Acid|락토바이오닉애씨드|active
Azelaic Acid|아젤라익애씨드|active
Sulfur|설퍼|active
Zinc PCA|징크피씨에이|conditioning
Caffeine|카페인|conditioning
Ceramide NP|세라마이드엔피|conditioning
Ceramide AP|세라마이드에이피|conditioning
Ceramide EOP|세라마이드이오피|conditioning
Ceramide NS|세라마이드엔에스|conditioning
Cholesterol|콜레스테롤|conditioning
Phytosphingosine|피토스핑고신|conditioning
Squalane|스쿠알란|emollient
Squalene|스쿠알렌|emollient
Dimethicone|다이메티콘|emollient
Cyclopentasiloxane|사이클로펜타실록세인|emollient
Cyclohexasiloxane|사이클로헥사실록세인|emollient
Phenyl Trimethicone|페닐트라이메티콘|emollient
Dimethiconol|다이메티콘올|conditioning
Amodimethicone|아모다이메티콘|conditioning
Dimethicone Crosspolymer|다이메티콘크로스폴리머|thickener
Polymethylsilsesquioxane|폴리메틸실세스퀴옥세인|thickener
Petrolatum|페트롤라툼|emollient
Mineral Oil|미네랄오일|emollient
Paraffin|파라핀|emollient
Microcrystalline Wax|마이크로크리스탈린왁스|thickener
Hydrogenated Polyisobutene|하이드로제네이티드폴리아이소부텐|emollient
Polyisobutene|폴리아이소부텐|emollient
Polybutene|폴리부텐|emollient
Hydrogenated Polydecene|하이드로제네이티드폴리데센|emollient
Caprylic/Capric Triglyceride|카프릴릭/카프릭트라이글리세라이드|emollient
Cetyl Alcohol|세틸알코올|emollient
Stearyl Alcohol|스테아릴알코올|emollient
Cetearyl Alcohol|세테아릴알코올|emollient
Behenyl Alcohol|베헤닐알코올|emollient
Myristyl Alcohol|미리스틸알코올|emollient
Isopropyl Myristate|아이소프로필미리스테이트|emollient
Isopropyl Palmitate|아이소프로필팔미테이트|emollient
Ethylhexyl Palmitate|에틸헥실팔미테이트|emollient
C12-15 Alkyl Benzoate|C12-15알킬벤조에이트|emollient
Dicaprylyl Carbonate|다이카프릴릴카보네이트|emollient
Coco-Caprylate/Caprate|코코-카프릴레이트/카프레이트|emollient
Diisostearyl Malate|다이아이소스테아릴말레이트|emollient
Octyldodecanol|옥틸도데칸올|emollient
Triethylhexanoin|트라이에틸헥사노인|emollient
Stearic Acid|스테아릭애씨드|emollient
Palmitic Acid|팔미틱애씨드|emollient
Myristic Acid|미리스틱애씨드|cleanser
Lauric Acid|라우릭애씨드|cleanser
Oleic Acid|올레익애씨드|emollient
Linoleic Acid|리놀레익애씨드|conditioning
Linolenic Acid|리놀레닉애씨드|conditioning
Glyceryl Stearate|글리세릴스테아레이트|emulsifier
Glyceryl Stearate SE|글리세릴스테아레이트에스이|emulsifier
PEG-100 Stearate|피이지-100스테아레이트|emulsifier
PEG-40 Hydrogenated Castor Oil|피이지-40하이드로제네이티드캐스터오일|emulsifier
Polysorbate 20|폴리솔베이트20|emulsifier
Polysorbate 60|폴리솔베이트60|emulsifier
Polysorbate 80|폴리솔베이트80|emulsifier
Sorbitan Stearate|솔비탄스테아레이트|emulsifier
Sorbitan Oleate|솔비탄올리에이트|emulsifier
Sorbitan Sesquioleate|솔비탄세스퀴올리에이트|emulsifier
Polyglyceryl-3 Methylglucose Distearate|폴리글리세릴-3메틸글루코오스다이스테아레이트|emulsifier
Polyglyceryl-10 Stearate|폴리글리세릴-10스테아레이트|emulsifier
Cetearyl Glucoside|세테아릴글루코사이드|emulsifier
Ceteareth-20|세테아레스-20|emulsifier
Sodium Stearoyl Glutamate|소듐스테아로일글루타메이트|emulsifier
Potassium Cetyl Phosphate|포타슘세틸포스페이트|emulsifier
Lecithin|레시틴|emulsifier
Hydrogenated Lecithin|하이드로제네이티드레시틴|emulsifier
Sodium Lauryl Sulfate|소듐라우릴설페이트|cleanser
Sodium Laureth Sulfate|소듐라우레스설페이트|cleanser
Ammonium Lauryl Sulfate|암모늄라우릴설페이트|cleanser
Ammonium Laureth Sulfate|암모늄라우레스설페이트|cleanser
Sodium Coco-Sulfate|소듐코코설페이트|cleanser
Cocamidopropyl Betaine|코카미도프로필베타인|cleanser
Coco-Betaine|코코-베타인|cleanser
Lauryl Betaine|라우릴베타인|cleanser
Sodium Cocoyl Isethionate|소듐코코일이세티오네이트|cleanser
Sodium Lauroyl Methyl Isethionate|소듐라우로일메틸이세티오네이트|cleanser
Sodium Cocoyl Glutamate|소듐코코일글루타메이트|cleanser
Disodium Cocoyl Glutamate|다이소듐코코일글루타메이트|cleanser
Sodium Cocoyl Glycinate|소듐코코일글리시네이트|cleanser
Potassium Cocoyl Glycinate|포타슘코코일글리시네이트|cleanser
Sodium Methyl Cocoyl Taurate|소듐메틸코코일타우레이트|cleanser
Disodium Laureth Sulfosuccinate|다이소듐라우레스설포석시네이트|cleanser
Sodium Lauroyl Sarcosinate|소듐라우로일사코시네이트|cleanser
Coco-Glucoside|코코-글루코사이드|cleanser
Decyl Glucoside|데실글루코사이드|cleanser
Lauryl Glucoside|라우릴글루코사이드|cleanser
Caprylyl/Capryl Glucoside|카프릴릴/카프릴글루코사이드|cleanser
Cocamide MEA|코카마이드엠이에이|cleanser
Cocamide DEA|코카마이드디이에이|cleanser
Lauramine Oxide|라우라민옥사이드|cleanser
Sodium Chloride|소듐클로라이드|thickener
Carbomer|카보머|thickener
Xanthan Gum|잔탄검|thickener
Cellulose Gum|셀룰로오스검|thickener
Hydroxyethylcellulose|하이드록시에틸셀룰로오스|thickener
Hydroxypropyl Methylcellulose|하이드록시프로필메틸셀룰로오스|thickener
Acrylates/C10-30 Alkyl Acrylate Crosspolymer|아크릴레이트/C10-30알킬아크릴레이트크로스폴리머|thickener
Acrylates Copolymer|아크릴레이트코폴리머|thickener
Sodium Polyacrylate|소듐폴리아크릴레이트|thickener
PVP|피브이피|thickener
Polyquaternium-7|폴리쿼터늄-7|conditioning
Polyquaternium-10|폴리쿼터늄-10|conditioning
Guar Hydroxypropyltrimonium Chloride|구아하이드록시프로필트라이모늄클로라이드|conditioning
Behentrimonium Chloride|베헨트라이모늄클로라이드|conditioning
Behentrimonium Methosulfate|베헨트라이모늄메토설페이트|conditioning
Cetrimonium Chloride|세트리모늄클로라이드|conditioning
Stearamidopropyl Dimethylamine|스테아라미도프로필다이메틸아민|conditioning
Citric Acid|시트릭애씨드|buffer
Sodium Citrate|소듐시트레이트|buffer
Sodium Hydroxide|소듐하이드록사이드|buffer
Potassium Hydroxide|포타슘하이드록사이드|buffer
Triethanolamine|트라이에탄올아민|buffer
Tromethamine|트로메타민|buffer
Arginine|알지닌|conditioning
Disodium EDTA|다이소듐이디티에이|chelator
Tetrasodium EDTA|테트라소듐이디티에이|chelator
Sodium Phytate|소듐파이테이트|chelator
Phenoxyethanol|페녹시에탄올|preservative
Sodium Benzoate|소듐벤조에이트|preservative
Potassium Sorbate|포타슘솔베이트|preservative
Benzoic Acid|벤조익애씨드|preservative
Sorbic Acid|솔빅애씨드|preservative
Chlorphenesin|클로페네신|preservative
Methylparaben|메틸파라벤|preservative
Ethylparaben|에틸파라벤|preservative
Propylparaben|프로필파라벤|preservative
Butylparaben|부틸파라벤|preservative
Methylisothiazolinone|메틸아이소티아졸리논|preservative
Methylchloroisothiazolinone|메틸클로로아이소티아졸리논|preservative
Benzisothiazolinone|벤즈아이소티아졸리논|preservative
DMDM Hydantoin|디엠디엠하이단토인|preservative
Imidazolidinyl Urea|이미다졸리디닐우레아|preservative
Diazolidinyl Urea|다이아졸리디닐우레아|preservative
Quaternium-15|쿼터늄-15|preservative
Sodium Hydroxymethylglycinate|소듐하이드록시메틸글리시네이트|preservative
Bronopol|브로노폴|preservative
Iodopropynyl Butylcarbamate|아이오도프로피닐부틸카바메이트|preservative
Benzyl Alcohol|벤질알코올|preservative
Dehydroacetic Acid|데하이드로아세틱애씨드|preservative
Fragrance|향료|fragrance
Limonene|리모넨|fragrance
Linalool|리날룰|fragrance
Citral|시트랄|fragrance
Geraniol|제라니올|fragrance
Citronellol|시트로넬올|fragrance
Eugenol|유제놀|fragrance
Isoeugenol|아이소유제놀|fragrance
Coumarin|쿠마린|fragrance
Cinnamal|신남알|fragrance
Cinnamyl Alcohol|신나밀알코올|fragrance
Benzyl Salicylate|벤질살리실레이트|fragrance
Benzyl Benzoate|벤질벤조에이트|fragrance
Benzyl Cinnamate|벤질신나메이트|fragrance
Alpha-Isomethyl Ionone|알파-아이소메틸아이오논|fragrance
Hydroxycitronellal|하이드록시시트로넬알|fragrance
Hexyl Cinnamal|헥실신남알|fragrance
Farnesol|파네솔|fragrance
Anise Alcohol|아니스알코올|fragrance
Amyl Cinnamal|아밀신남알|fragrance
Zinc Oxide|징크옥사이드|uv_filter
Titanium Dioxide|티타늄디옥사이드|uv_filter
Ethylhexyl Methoxycinnamate|에틸헥실메톡시신나메이트|uv_filter
Ethylhexyl Salicylate|에틸헥실살리실레이트|uv_filter
Homosalate|호모살레이트|uv_filter
Octocrylene|옥토크릴렌|uv_filter
Butyl Methoxydibenzoylmethane|부틸메톡시디벤조일메탄|uv_filter
Benzophenone-3|벤조페논-3|uv_filter
Bis-Ethylhexyloxyphenol Methoxyphenyl Triazine|비스-에틸헥실옥시페놀메톡시페닐트리아진|uv_filter
Methylene Bis-Benzotriazolyl Tetramethylbutylphenol|메틸렌비스-벤조트리아졸릴테트라메틸부틸페놀|uv_filter
Diethylamino Hydroxybenzoyl Hexyl Benzoate|다이에틸아미노하이드록시벤조일헥실벤조에이트|uv_filter
Ethylhexyl Triazone|에틸헥실트리아존|uv_filter
Diethylhexyl Butamido Triazone|다이에틸헥실부타미도트리아존|uv_filter
Polysilicone-15|폴리실리콘-15|uv_filter
Drometrizole Trisiloxane|드로메트리졸트리실록세인|uv_filter
Terephthalylidene Dicamphor Sulfonic Acid|테레프탈릴리덴디캠퍼설포닉애씨드|uv_filter
Silica|실리카|thickener
Talc|탤크|thickener
Mica|마이카|colorant
Synthetic Fluorphlogopite|합성플루오르플로고파이트|colorant
Tin Oxide|틴옥사이드|colorant
Bismuth Oxychloride|비스머스옥시클로라이드|colorant
Iron Oxides|아이언옥사이드|colorant
CI 77491|적색산화철|colorant
CI 77492|황색산화철|colorant
CI 77499|흑색산화철|colorant
CI 77007|울트라마린|colorant
CI 77266|카본블랙|colorant
CI 75470|카민|colorant
Cocos Nucifera Oil|코코넛야자오일|emollient
Cocos Nucifera Fruit Extract|코코넛야자열매추출물|botanical
Cocos Nucifera Fruit Juice|코코넛야자열매즙|botanical
Cocos Nucifera Water|코코넛야자수|botanical
Olea Europaea Fruit Oil|올리브오일|emollient
Prunus Amygdalus Dulcis Oil|스위트아몬드오일|emollient
Argania Spinosa Kernel Oil|아르간커넬오일|emollient
Simmondsia Chinensis Seed Oil|호호바씨오일|emollient
Helianthus Annuus Seed Oil|해바라기씨오일|emollient
Ricinus Communis Seed Oil|피마자씨오일|emollient
Butyrospermum Parkii Butter|시어버터|emollient
Theobroma Cacao Seed Butter|카카오씨버터|emollient
Vitis Vinifera Seed Oil|포도씨오일|emollient
Persea Gratissima Oil|아보카도오일|emollient
Camellia Sinensis Leaf Extract|녹차추출물|botanical
Centella Asiatica Extract|병풀추출물|botanical
Madecassoside|마데카소사이드|conditioning
Asiaticoside|아시아티코사이드|conditioning
Asiatic Acid|아시아틱애씨드|conditioning
Madecassic Acid|마데카식애씨드|conditioning
Aloe Barbadensis Leaf Juice|알로에베라잎즙|botanical
Aloe Barbadensis Leaf Extract|알로에베라잎추출물|botanical
Glycyrrhiza Glabra Root Extract|스페인감초뿌리추출물|botanical
Dipotassium Glycyrrhizate|다이포타슘글리시리제이트|conditioning
Chamomilla Recutita Flower Extract|마트리카리아꽃추출물|botanical
Calendula Officinalis Flower Extract|포트마리골드꽃추출물|botanical
Rosmarinus Officinalis Leaf Extract|로즈마리잎추출물|botanical
Lavandula Angustifolia Oil|라벤더오일|fragrance
Melaleuca Alternifolia Leaf Oil|티트리잎오일|fragrance
Citrus Limon Peel Oil|레몬껍질오일|fragrance
Citrus Aurantium Dulcis Peel Oil|오렌지껍질오일|fragrance
Mentha Piperita Oil|페퍼민트오일|fragrance
Menthol|멘톨|fragrance
Eucalyptus Globulus Leaf Oil|유칼립투스잎오일|fragrance
Propolis Extract|프로폴리스추출물|conditioning
Honey|꿀|humectant
Beeswax|비즈왁스|thickener
Lanolin|라놀린|emollient
Lanolin Alcohol|라놀린알코올|emollient
Snail Secretion Filtrate|달팽이점액여과물|conditioning
Hydrolyzed Collagen|하이드롤라이즈드콜라겐|conditioning
Soluble Collagen|수용성콜라겐|conditioning
Hydrolyzed Keratin|하이드롤라이즈드케라틴|conditioning
Hydrolyzed Silk|하이드롤라이즈드실크|conditioning
Hydrolyzed Wheat Protein|하이드롤라이즈드밀단백질|conditioning
Hydrolyzed Soy Protein|하이드롤라이즈드콩단백질|conditioning
Hydrolyzed Milk Protein|하이드롤라이즈드우유단백질|conditioning
Saccharomyces Ferment Filtrate|효모발효여과물|conditioning
Galactomyces Ferment Filtrate|갈락토미세스발효여과물|conditioning
Bifida Ferment Lysate|비피다발효용해물|conditioning
Lactobacillus Ferment|락토바실러스발효물|conditioning
Ferulic Acid|페룰릭애씨드|antioxidant
Resveratrol|레스베라트롤|antioxidant
Ubiquinone|유비퀴논|antioxidant
Palmitoyl Pentapeptide-4|팔미토일펜타펩타이드-4|conditioning
Acetyl Hexapeptide-8|아세틸헥사펩타이드-8|conditioning
Copper Tripeptide-1|카퍼트라이펩타이드-1|conditioning
Sodium Fluoride|플루오르화나트륨|active
Sodium Monofluorophosphate|일불소인산나트륨|active
Stannous Fluoride|불화주석|active
Hydrated Silica|하이드레이티드실리카|thickener
Sodium Saccharin|소듐사카린|conditioning
Sodium Bicarbonate|소듐바이카보네이트|buffer
Zinc Citrate|징크시트레이트|conditioning
Cetylpyridinium Chloride|세틸피리디늄클로라이드|active
Chlorhexidine Digluconate|클로헥시딘다이글루코네이트|active
Benzalkonium Chloride|벤잘코늄클로라이드|preservative
Sodium Palmate|소듐팔메이트|cleanser
Sodium Palm Kernelate|소듐팜커넬레이트|cleanser
Sodium Cocoate|소듐코코에이트|cleanser
Potassium Cocoate|포타슘코코에이트|cleanser
Aluminum Chlorohydrate|알루미늄클로로하이드레이트|active
Aluminum Zirconium Tetrachlorohydrex GLY|알루미늄지르코늄테트라클로로하이드렉스글라이|active
Triethyl Citrate|트라이에틸시트레이트|conditioning
p-Phenylenediamine|피-페닐렌다이아민|colorant
Toluene-2,5-Diamine Sulfate|톨루엔-2,5-다이아민설페이트|colorant
Resorcinol|레조시놀|colorant
Hydrogen Peroxide|하이드로젠퍼옥사이드|active
Ammonium Persulfate|암모늄퍼설페이트|active
Potassium Persulfate|포타슘퍼설페이트|active
Sodium Persulfate|소듐퍼설페이트|active
Ethyl Acetate|에틸아세테이트|solvent
Butyl Acetate|부틸아세테이트|solvent
Acetone|아세톤|solvent
Nitrocellulose|나이트로셀룰로오스|thickener
Tosylamide/Formaldehyde Resin|토실아마이드/포름알데하이드수지|thickener
Formaldehyde|포름알데하이드|preservative
`;
const extra={
 Water:['Aqua','Water (Aqua)','Aqua (Water)','Water/Aqua/Eau'],Fragrance:['Parfum','Perfume','Fragrance (Parfum)','Parfum (Fragrance)'],
 'Cocos Nucifera Oil':['Cocos Nucifera (Coconut) Oil','Coconut Oil','코코넛오일'],
 'Cocos Nucifera Fruit Extract':['Cocos Nucifera (Coconut) Fruit Extract'],
 'Cocos Nucifera Water':['Coconut Water','Cocos Nucifera (Coconut) Water'],
 'Prunus Amygdalus Dulcis Oil':['Prunus Amygdalus Dulcis (Sweet Almond) Oil','Sweet Almond Oil'],
 'Simmondsia Chinensis Seed Oil':['Simmondsia Chinensis (Jojoba) Seed Oil','Jojoba Oil'],
 'Olea Europaea Fruit Oil':['Olea Europaea (Olive) Fruit Oil','Olive Oil'],
 'Butyrospermum Parkii Butter':['Butyrospermum Parkii (Shea) Butter','Shea Butter'],
 'Theobroma Cacao Seed Butter':['Theobroma Cacao (Cocoa) Seed Butter','Cocoa Butter'],
 'Helianthus Annuus Seed Oil':['Helianthus Annuus (Sunflower) Seed Oil'],
 'Ricinus Communis Seed Oil':['Ricinus Communis (Castor) Seed Oil'],
 'Aloe Barbadensis Leaf Juice':['Aloe Barbadensis (Aloe Vera) Leaf Juice'],
 'Melaleuca Alternifolia Leaf Oil':['Melaleuca Alternifolia (Tea Tree) Leaf Oil','Tea Tree Oil'],
 'Hydrolyzed Hyaluronic Acid':['Hydrolysed Hyaluronic Acid'],
 'Hydrolyzed Collagen':['Hydrolysed Collagen'],'Hydrolyzed Wheat Protein':['Hydrolysed Wheat Protein'],
 'Hydrolyzed Soy Protein':['Hydrolysed Soy Protein'],
 'Hydrolyzed Milk Protein':['Hydrolysed Milk Protein','하이드롤라이즈드밀크프로테인'],
 'Methylisothiazolinone':['MI','MIT','메칠이소치아졸리논'],
 'Methylchloroisothiazolinone':['MCI','CMIT','메칠클로로이소치아졸리논'],
 'Sodium Lauryl Sulfate':['Sodium Lauryl Sulphate','SLS'],
 'Sodium Laureth Sulfate':['Sodium Laureth Sulphate','SLES'],
 'Cocamidopropyl Betaine':['CAPB','코카미도프로필베타인'],
 'Niacinamide':['Nicotinamide'],'Alcohol Denat.':['Alcohol Denat','Denatured Alcohol'],
 'Beeswax':['Cera Alba'],'Honey':['Mel'],'Mineral Oil':['Paraffinum Liquidum'],
 'Ethylhexyl Methoxycinnamate':['Octinoxate'],'Butyl Methoxydibenzoylmethane':['Avobenzone'],
 'Benzophenone-3':['Oxybenzone'],'Ethylhexyl Salicylate':['Octisalate'],
 'Titanium Dioxide':['CI 77891','씨아이77891'],
 'Sodium Fluoride':['소듐플루오라이드'],'Sodium Monofluorophosphate':['소듐모노플루오로포스페이트'],
 'Stannous Fluoride':['스타너스플루오라이드'],
 'Disodium EDTA':['디소듐이디티에이'],'Tetrasodium EDTA':['테트라소듐이디티에이'],
};
const coconutNamed=new Set(['Cocos Nucifera Oil','Cocos Nucifera Fruit Extract','Cocos Nucifera Fruit Juice','Cocos Nucifera Water']);
// A source question, NOT a claim of coconut protein or clinical cross-reactivity.
const coconutQuestion=new Set(['Cocamidopropyl Betaine','Coco-Betaine','Coco-Glucoside','Sodium Coco-Sulfate','Sodium Cocoyl Isethionate','Sodium Cocoyl Glutamate','Disodium Cocoyl Glutamate','Sodium Cocoyl Glycinate','Potassium Cocoyl Glycinate','Sodium Methyl Cocoyl Taurate','Cocamide MEA','Cocamide DEA','Coco-Caprylate/Caprate','Caprylic/Capric Triglyceride','Lauric Acid','Sodium Cocoate','Potassium Cocoate']);
const descriptions={
 'Ascorbic Acid':{en:'Vitamin C, used as an antioxidant in some skin-care formulas.',ko:'일부 피부 관리 제품에서 항산화 성분으로 쓰이는 비타민 C입니다.'},
 'Tocopherol':{en:'A form of vitamin E, often used to help limit oxidation.',ko:'산화를 줄이는 데 자주 쓰이는 비타민 E의 한 형태입니다.'},
 'Citric Acid':{en:'An acid commonly used to adjust product acidity (pH). The name does not establish a citrus-allergy risk.',ko:'제품의 산도(pH)를 조절하는 데 흔히 쓰이는 산 성분입니다. 이름만으로 감귤류 알레르기 위험을 판단할 수 없습니다.'},
 'Sodium Fluoride':{en:'A fluoride ingredient used in some oral-care products. This name does not state the amount or suitability.',ko:'일부 구강 관리 제품에 쓰이는 불소 성분입니다. 이름만으로 함량이나 개인에게 적합한지 알 수 없습니다.'},
 'Hydrogen Peroxide':{en:'An oxidizing ingredient used in some hair-colour or bleaching products. This name does not establish a safe concentration.',ko:'일부 염색·탈색 제품에 쓰이는 산화 성분입니다. 이름만으로 안전한 농도인지 알 수 없습니다.'},
 'Acetone':{en:'A solvent used to dissolve nail polish and other materials.',ko:'매니큐어 등의 물질을 녹이는 데 쓰이는 용매입니다.'},
 'Niacinamide':{en:'A form of vitamin B3 used in skin-care formulas.',ko:'피부 관리 제품에 쓰이는 비타민 B3의 한 형태입니다.'},
 'Cocos Nucifera Oil':{en:'Coconut oil. The label names a coconut ingredient; the name does not measure residual protein or predict your reaction.',ko:'코코넛 오일입니다. 코코넛 성분으로 표시되어 있지만 잔류 단백질의 양이나 개인의 반응은 이름만으로 알 수 없습니다.'},
 'Cocamidopropyl Betaine':{en:'A cleansing ingredient. Feedstock and impurities need manufacturer confirmation; this name does not establish coconut protein or coconut-allergy risk.',ko:'세정 성분입니다. 원료의 출처와 불순물은 제조사에 확인해야 합니다. 이름만으로 코코넛 단백질 함유나 코코넛 알레르기 위험을 판단할 수 없습니다.'},
 'Glycerin':{en:'Helps retain moisture. Plant, animal or synthetic origin is not established by this name.',ko:'수분을 유지하도록 돕습니다. 이름만으로 식물성·동물성·합성 유래를 알 수 없습니다.'},
 'Cetyl Alcohol':{en:'A fatty alcohol that softens skin and adjusts texture; it is different from ethanol.',ko:'피부를 부드럽게 하고 질감을 조절하는 지방알코올로 에탄올과 다릅니다.'},
 'Cetearyl Alcohol':{en:'A mixture of fatty alcohols used for texture and softness; it is different from ethanol.',ko:'질감 조절과 부드러움을 위해 쓰는 지방알코올 혼합물로 에탄올과 다릅니다.'},
 'Lactic Acid':{en:'An acid used in skin-care formulas. Its name does not establish milk origin or milk protein.',ko:'피부 관리 제품에 쓰이는 산 성분입니다. 이름만으로 우유 유래나 우유 단백질 함유를 알 수 없습니다.'},
 'Fragrance':{en:'A fragrance mixture. Its individual ingredients may not all be named here.',ko:'여러 향 성분의 혼합물입니다. 개별 성분이 모두 여기에 표시되어 있는 것은 아닙니다.'},
};
export const COSMETIC_GLOSSARY=rows.trim().split('\n').map(row=>{
 const [inci,ko,role]=row.split('|');return Object.freeze({id:inci.toLowerCase().replace(/[^a-z0-9]+/gu,'-').replace(/^-|-$/gu,''),inci,ko,role,
  aliases:Object.freeze([...new Set([inci,ko,...extra[inci]||[]])]),
  explanation:Object.freeze(descriptions[inci]||COSMETIC_ROLES[role]),
  named_sources:Object.freeze(coconutNamed.has(inci)?['coconut']:[]),
  source_questions:Object.freeze(coconutQuestion.has(inci)?['coconut']:[]),review_status:COSMETIC_CATALOG_META.review_status});
});
