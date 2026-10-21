"""Local Korean/Latin Paddle OCR. Line scores never become word confidence."""
import math
import gc
from pathlib import Path

from PIL import Image, ImageOps
from backend.main import INFERENCE_LOCK, ENGINE_CONFIG


def make_pc_engine(script):
    from paddleocr import PaddleOCR
    return PaddleOCR(text_detection_model_name='PP-OCRv5_mobile_det',
        text_recognition_model_name=ENGINE_CONFIG[script]['rec_model'],
        device='cpu', cpu_threads=2, enable_mkldnn=False,
        use_doc_orientation_classify=False, use_doc_unwarping=False,
        use_textline_orientation=False, text_recognition_batch_size=1)


def prepare_image(data, target):
    import io
    with Image.open(io.BytesIO(data)) as image:
        if image.width * image.height > 20_000_000:
            raise ValueError("Image exceeds 20 million pixels")
        image = ImageOps.exif_transpose(image).convert("RGB")
        image.thumbnail((2400, 2400))
        image.save(target, format="PNG")
        return image.size


def local_ocr(paths, sizes):
    sources, errors, completed = [], [], 0
    engine = None
    with INFERENCE_LOCK:
        try:
            for script in ("korean", "latin"):
                try:
                    engine = make_pc_engine(script)
                except Exception:
                    errors.append({"script": script, "message": "Local model initialization failed"})
                    continue
                for photo_index, path in enumerate(paths):
                    try:
                        results = list(engine.predict(input=str(path)))
                        completed += 1
                        items = []
                        for result in results:
                            texts = result.get("rec_texts", [])
                            scores = result.get("rec_scores", [])
                            boxes = result.get("rec_polys", result.get("dt_polys", []))
                            for i, text in enumerate(texts):
                                text = str(text).strip()
                                if not text:
                                    continue
                                try:
                                    score = float(scores[i]) if i < len(scores) else None
                                except (ValueError, TypeError):
                                    score = None
                                if score is not None and (not math.isfinite(score) or not 0 <= score <= 1):
                                    score = None
                                # One line may contain a clear heading and a damaged
                                # ingredient. Do not lend its score to each word.
                                item = {"text": text, "score": 0, "raw_line_score": score,
                                        "lineId": len(items), "confidence_scope": "line_uncalibrated"}
                                if i < len(boxes):
                                    try:
                                        points = boxes[i]
                                        xs, ys = [float(p[0]) for p in points], [float(p[1]) for p in points]
                                        if xs and all(math.isfinite(v) for v in xs + ys):
                                            item["box"] = {"x0": min(xs), "y0": min(ys), "x1": max(xs), "y1": max(ys)}
                                    except (TypeError, ValueError, IndexError):
                                        pass
                                items.append(item)
                        sources.append({"familyId": "pc-paddle", "photoIndex": photo_index, "rotation": 0,
                                        "variant": "pc-normalized", "model_languages": [script],
                                        "confidence_scope": "line_uncalibrated", "items": items,
                                        "image_size": list(sizes[photo_index])})
                    except Exception:
                        errors.append({"script": script, "photoIndex": photo_index, "message": "Local photo reading failed"})
                engine = None
                gc.collect()
        finally:
            engine = None
            gc.collect()
    if not completed:
        raise RuntimeError("No local OCR task completed")
    return {"status": "unverified", "sources": sources, "errors": errors,
            "automatic_negative_results": False,
            "warning": "OCR is incomplete evidence, never proof of allergen absence. No recipes are inferred."}
