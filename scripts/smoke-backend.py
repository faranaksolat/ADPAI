"""Optional real-model smoke test. Downloads official models; no package accuracy claim."""
import io
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from PIL import Image, ImageDraw, ImageFont
from fastapi.testclient import TestClient
from backend.main import app

image = Image.new("RGB", (1400, 400), "white")
draw = ImageDraw.Draw(image)
font = ImageFont.truetype("DejaVuSans.ttf", 48)
for index, line in enumerate(["INGREDIENTS: MILK, SUGAR, WHEAT", "CONTAINS: MILK", "Please check the original ingredient label."]):
    draw.text((30, 30+index*100), line, font=font, fill="black")
data = io.BytesIO()
image.save(data, format="PNG")
started = time.monotonic()
response = TestClient(app).post("/api/analyze", data={"profile": '{"allergens":["milk"]}'}, files={"images": ("label.png", data.getvalue(), "image/png")})
assert response.status_code == 200, response.text
product = response.json()["products"][0]
assert product["status"] == "conflict", product
assert any(hit["allergen_id"] == "milk" for hit in product["direct_matches"]), product
print(f"PASS real PaddleOCR inference on generated milk label ({time.monotonic()-started:.2f}s); not a real-package benchmark")
