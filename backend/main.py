from __future__ import annotations

import os
os.environ["FLAGS_enable_pir_api"] = "0"
os.environ.setdefault("PADDLE_PDX_MODEL_SOURCE", "BOS")
os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")

import gc
import json
import tempfile
from pathlib import Path
from typing import List, Optional, TYPE_CHECKING
from threading import Lock

from PIL import Image, ImageFilter, ImageOps

from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool

if TYPE_CHECKING:
    from paddleocr import PaddleOCR

ROOT = Path(__file__).resolve().parent.parent
BACKEND = Path(__file__).resolve().parent
MAX_PRODUCTS = 6
MAX_PHOTOS_PER_PRODUCT = 3
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_REQUEST_BYTES = 40 * 1024 * 1024
MAX_IMAGE_PIXELS = 20_000_000
INFERENCE_LOCK = Lock()

from .analysis import (
    ONTOLOGY, ALLERGENS, MARKERS, compact, scan_profile, label_evidence,
    semantic_result, extract_calories_from_text, extract_best_calories,
)

# Two high-probability passes first. Other scripts are lazy fallbacks.
# The user never selects the package language.
ENGINE_CONFIG = {
    "korean":    {"rec_model": "korean_PP-OCRv5_mobile_rec",    "label": "Korean + English"},
    "latin":     {"rec_model": "latin_PP-OCRv5_mobile_rec",     "label": "Latin multilingual"},
    "arabic":    {"rec_model": "arabic_PP-OCRv5_mobile_rec",    "label": "Arabic / Persian / Urdu family"},
    "cyrillic":  {"rec_model": "cyrillic_PP-OCRv5_mobile_rec",  "label": "Cyrillic family"},
    "devanagari":{"rec_model": "devanagari_PP-OCRv5_mobile_rec","label": "Devanagari family"},
    "japanese":  {"rec_model": "PP-OCRv5_mobile_rec",           "label": "Japanese"},
    "chinese":   {"rec_model": "PP-OCRv5_mobile_rec",           "label": "Chinese + English"},
    "thai":      {"rec_model": "th_PP-OCRv5_mobile_rec",        "label": "Thai + English"},
    "greek":     {"rec_model": "el_PP-OCRv5_mobile_rec",        "label": "Greek + English"},
    "tamil":     {"rec_model": "ta_PP-OCRv5_mobile_rec",        "label": "Tamil + English"},
    "telugu":    {"rec_model": "te_PP-OCRv5_mobile_rec",        "label": "Telugu + English"},
}
PRIMARY_ENGINES = ["korean", "latin"]
FALLBACK_ENGINES = ["arabic", "cyrillic", "devanagari", "japanese", "chinese", "thai", "greek", "tamil", "telugu"]

app = FastAPI(title="ALLER AI Multilingual OCR API", version="1.3.0")
app.mount("/src", StaticFiles(directory=ROOT / "src"), name="frontend-modules")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:8000",
        "http://localhost:8000",
        "https://faranaksadatsolat.github.io",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

_ACTIVE_ENGINE_KEY: str | None = None
_ACTIVE_ENGINE: PaddleOCR | None = None

def make_engine(engine_key: str) -> PaddleOCR:
    from paddleocr import PaddleOCR
    cfg = ENGINE_CONFIG[engine_key]
    return PaddleOCR(
        text_detection_model_name="PP-OCRv5_mobile_det",
        text_recognition_model_name=cfg["rec_model"],
        device="cpu",
        enable_mkldnn=False,
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
        text_recognition_batch_size=1,
    )

def clear_active_engine() -> None:
    global _ACTIVE_ENGINE_KEY, _ACTIVE_ENGINE
    if _ACTIVE_ENGINE is not None:
        _ACTIVE_ENGINE = None
        _ACTIVE_ENGINE_KEY = None
        gc.collect()

def get_primary_engine(engine_key: str) -> PaddleOCR:
    """
    Keep only ONE PaddleOCR pipeline resident at a time.

    Render Free has tight memory. Korean and Latin are still both checked,
    but sequentially instead of keeping duplicate detector/recognizer
    pipelines resident simultaneously.
    """
    global _ACTIVE_ENGINE_KEY, _ACTIVE_ENGINE
    if _ACTIVE_ENGINE is None or _ACTIVE_ENGINE_KEY != engine_key:
        clear_active_engine()
        _ACTIVE_ENGINE = make_engine(engine_key)
        _ACTIVE_ENGINE_KEY = engine_key
    return _ACTIVE_ENGINE

def ocr_paths_dual(engine: PaddleOCR, paths: list[str]) -> tuple[list[dict], list[dict]]:
    """
    One OCR inference, two views:
    - safe_lines: all recognized text with confidence and photo identity.
    - calorie_lines: lower-threshold text used only for nutrition numbers.
    """
    safe_lines: list[dict] = []
    calorie_lines: list[dict] = []

    for photo_index, path in enumerate(paths):
        try:
            results = list(engine.predict(input=path))
        except Exception:
            safe_lines.append({"text": "", "score": 0, "photoIndex": photo_index, "error": "Photo OCR failed."})
            continue
        for result in results:
            try:
                texts = list(result["rec_texts"])
            except Exception:
                texts = []
            try:
                scores = list(result["rec_scores"])
            except Exception:
                scores = []

            for i, txt in enumerate(texts):
                txt = str(txt).strip()
                if not txt:
                    continue

                score = 0.0
                if i < len(scores):
                    try:
                        score = float(scores[i])
                    except Exception:
                        pass

                if score >= 0.18:
                    calorie_lines.append({"text": txt, "photoIndex": photo_index})
                # Retain weak terms as unresolved evidence instead of deleting
                # a potentially critical allergen below a confidence threshold.
                safe_lines.append({"text": txt, "score": score, "photoIndex": photo_index})

    return safe_lines, calorie_lines

def make_nutrition_variants(paths: list[str]) -> list[str]:
    """
    Retry difficult nutrition panels on an enlarged, autocontrasted,
    lightly sharpened copy. These variants are used ONLY for calorie OCR.
    """
    variants: list[str] = []

    for path in paths:
        try:
            with Image.open(path) as im:
                im = im.convert("RGB")
                w, h = im.size
                longest = max(w, h)
                scale = 1.0 if longest >= 2200 else min(2.2, 2200.0 / max(1, longest))

                if scale > 1.02:
                    im = im.resize(
                        (max(1, int(round(w * scale))), max(1, int(round(h * scale)))),
                        Image.Resampling.LANCZOS,
                    )

                gray = ImageOps.grayscale(im)
                gray = ImageOps.autocontrast(gray, cutoff=0.5)
                gray = gray.filter(
                    ImageFilter.UnsharpMask(radius=1.2, percent=145, threshold=2)
                )

                with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as tmp:
                    gray.save(tmp.name, format="PNG", optimize=False)
                    variants.append(tmp.name)
        except Exception:
            continue

    return variants


def normalize_image(path):
    try:
        with Image.open(path) as image:
            if image.width * image.height > MAX_IMAGE_PIXELS:
                raise HTTPException(status_code=413, detail="Image pixel limit exceeded.")
            # Decode and normalize the actual content. Paddle validates filename
            # extensions, and phone images may require EXIF orientation handling.
            normalized = ImageOps.exif_transpose(image).convert("RGB")
        normalized.save(path, format="PNG")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=422, detail="Unreadable image file.") from exc

@app.get("/")
def home():
    return FileResponse(ROOT / "index.html")

@app.get("/api/health")
def health():
    return {
        "ok": True,
        "engine": "PaddleOCR PP-OCRv5 explicit-mobile multilingual router",
        "mode": "local-or-cloud",
        "version": "1.3.0",
        "language_selection_required": False,
        "primary_ocr_families": PRIMARY_ENGINES,
        "fallback_ocr_families": FALLBACK_ENGINES,
        "ontology_languages": sorted({
            lang
            for item in ALLERGENS.values()
            for lang in item["aliases"].keys()
        }),
        "multi_product": True,
        "calorie_estimation": True,
        "calorie_parser": "v4-scoped-quantities",
        "automatic_negative_results": False,
    }

@app.post("/api/analyze")
async def analyze(
    profile: str = Form(...),
    images: List[UploadFile] = File(...),
    product_ids: Optional[List[int]] = Form(None),
):
    try:
        p = json.loads(profile)
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=422, detail="Invalid profile JSON.") from exc
    if not isinstance(p, dict):
        raise HTTPException(status_code=422, detail="Profile must be an object.")
    allergens, custom = p.get("allergens", []), p.get("custom_avoid", [])
    if (not isinstance(allergens, list) or not isinstance(custom, list)
            or len(allergens) > len(ALLERGENS) or len(custom) > 30
            or any(not isinstance(x, str) or x not in ALLERGENS for x in allergens)
            or any(not isinstance(x, str) or not x.strip() or len(x) > 100 for x in custom)
            or not (allergens or custom)):
        raise HTTPException(status_code=422, detail="Select valid allergens or custom terms.")

    temp_paths: list[str] = []
    try:
        if not 1 <= len(images) <= MAX_PRODUCTS * MAX_PHOTOS_PER_PRODUCT:
            raise HTTPException(status_code=422, detail="Supply 1 to 18 images.")
        ids = product_ids or [1] * len(images)
        if len(ids) != len(images):
            raise HTTPException(status_code=422, detail="Image/product grouping data is inconsistent.")

        total_bytes = 0
        grouped: dict[int, list[str]] = {}
        for pid, upload in zip(ids, images):
            pid = int(pid)
            if pid < 1 or pid > MAX_PRODUCTS:
                raise HTTPException(status_code=422, detail="Invalid product ID.")
            grouped.setdefault(pid, [])
            if len(grouped[pid]) >= MAX_PHOTOS_PER_PRODUCT:
                raise HTTPException(status_code=422, detail="At most three photos per product.")

            data = await upload.read(MAX_UPLOAD_BYTES + 1)
            total_bytes += len(data)
            if len(data) > MAX_UPLOAD_BYTES or total_bytes > MAX_REQUEST_BYTES:
                raise HTTPException(status_code=413, detail="Image upload limit exceeded.")
            with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as tmp:
                tmp.write(data)
                path = tmp.name
            temp_paths.append(path)
            await run_in_threadpool(normalize_image, path)
            grouped[pid].append(path)

        if not grouped:
            raise HTTPException(status_code=422, detail="No valid product images were supplied.")

        return await run_in_threadpool(process_groups, grouped, p)

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail="OCR processing failed; no result was verified.") from exc
    finally:
        for path in temp_paths:
            try:
                os.remove(path)
            except OSError:
                pass


def process_groups(grouped, profile):
    # Paddle predictors are mutable process-local objects. Run CPU work outside
    # the async event loop and serialize access to the shared model cache.
    with INFERENCE_LOCK:
        try:
            return _run_ocr(grouped, profile)
        finally:
            clear_active_engine()


def _run_ocr(grouped, p):
    temp_paths = []
    try:
        sources = {pid: {} for pid in grouped}
        calorie_sources = {pid: {} for pid in grouped}
        failures = {pid: [] for pid in grouped}
        successful_inference = {pid: False for pid in grouped}

        # Stage 1: Korean + Latin multilingual. These cover the common Korea/international case.
        for engine_key in PRIMARY_ENGINES:
            try:
                engine = get_primary_engine(engine_key)
            except Exception:
                for pid in grouped:
                    failures[pid].append({"family": engine_key, "message": "Model initialization failed."})
                continue
            for pid, paths in grouped.items():
                safe_lines, calorie_lines = ocr_paths_dual(engine, paths)
                failures[pid].extend({"family": engine_key, "photoIndex": line["photoIndex"], "message": line["error"]} for line in safe_lines if line.get("error"))
                if not any(line.get("error") for line in safe_lines) or any(line.get("text") for line in safe_lines):
                    successful_inference[pid] = True
                sources[pid][engine_key] = safe_lines
                calorie_sources[pid][engine_key] = calorie_lines

        # Products with a positive or precautionary result can stop early.
        unresolved = set()
        for pid in grouped:
            direct, caution = scan_profile(sources[pid], p)
            evidence = label_evidence(sources[pid])
            # Additional models are recovery attempts; a heading never certifies a negative.
            if not direct and not caution and not evidence["ingredient"]:
                unresolved.add(pid)

        # Stage 2: automatic script-family fallbacks. No language choice is shown to the user.
        # Model attempts alone never certify a negative result.
        if unresolved:
            clear_active_engine()

        for engine_key in FALLBACK_ENGINES:
            if not unresolved:
                break
            try:
                engine = make_engine(engine_key)
            except Exception:
                for pid in unresolved:
                    failures[pid].append({"family": engine_key, "message": "Model initialization failed."})
                continue

            resolved_now = []
            for pid in list(unresolved):
                try:
                    safe_lines, calorie_lines = ocr_paths_dual(engine, grouped[pid])
                    failures[pid].extend({"family": engine_key, "photoIndex": line["photoIndex"], "message": line["error"]} for line in safe_lines if line.get("error"))
                    if not any(line.get("error") for line in safe_lines) or any(line.get("text") for line in safe_lines):
                        successful_inference[pid] = True
                    sources[pid][engine_key] = safe_lines
                    calorie_sources[pid][engine_key] = calorie_lines
                except Exception:
                    sources[pid][engine_key] = []
                    calorie_sources[pid][engine_key] = []

                direct, caution = scan_profile(sources[pid], p)
                if direct or caution:
                    resolved_now.append(pid)

            for pid in resolved_now:
                unresolved.discard(pid)

            del engine
            gc.collect()

        # Nutrition-only recovery: retry difficult labels at larger scale,
        # but only when a nutrition panel was actually detected.
        for pid in sorted(grouped):
            if extract_best_calories(calorie_sources[pid]).get("package_kcal") is not None:
                continue
            if not label_evidence(sources[pid])["nutrition"]:
                continue

            enhanced_paths = make_nutrition_variants(grouped[pid])
            temp_paths.extend(enhanced_paths)

            for engine_key in PRIMARY_ENGINES:
                if not enhanced_paths:
                    break
                try:
                    engine = get_primary_engine(engine_key)
                    _, recovered = ocr_paths_dual(engine, enhanced_paths)
                    existing = calorie_sources[pid].get(engine_key, [])
                    calorie_sources[pid][engine_key] = existing + recovered
                except Exception:
                    pass

        if not any(successful_inference.values()):
            raise RuntimeError("No OCR inference could complete.")
        products = []
        for pid in sorted(grouped):
            result = semantic_result(pid, sources[pid], p, calorie_source_texts=calorie_sources[pid])
            result["errors"] = failures[pid]
            products.append(result)

        known = [
            x["calories"]["package_kcal"]
            for x in products
            if x.get("calories", {}).get("package_kcal") is not None
        ]
        total_kcal = sum(known) if known else None
        complete = bool(products) and len(known) == len(products)

        priority = {
            "backend_error": 6, "conflict": 5, "caution": 4,
            "unverified": 3, "ingredient_not_confirmed": 3, "unreadable": 3,
            "nutrition_panel": 2, "no_listed_conflict": 1,
        }
        overall = max(products, key=lambda x: priority.get(x["status"], 0))["status"]

        return {
            "status": overall,
            "products": products,
            "summary": {
                "product_count": len(products),
                "total_package_kcal": total_kcal,
                "calories_complete": complete,
                "calorie_products_count": len(known),
                "automatic_multilingual": True,
            },
        }
    finally:
        for path in temp_paths:
            try:
                os.remove(path)
            except OSError:
                pass
