from pathlib import Path
from PIL import Image, ImageOps
import json

root = Path(__file__).resolve().parents[1]
extensions = {".png", ".jpg", ".jpeg"}
excluded = {".git", "node_modules", ".github", "dist", "build"}
results = []
for source in root.rglob("*"):
    if not source.is_file() or source.suffix.lower() not in extensions:
        continue
    if any(part in excluded for part in source.relative_to(root).parts):
        continue
    target = source.with_suffix(".webp")
    if target.exists():
        results.append({"source": str(source.relative_to(root)), "status": "skipped: WebP already exists"})
        continue
    try:
        with Image.open(source) as img:
            img = ImageOps.exif_transpose(img)
            if img.mode not in ("RGB", "RGBA"):
                img = img.convert("RGBA" if "A" in img.getbands() or "transparency" in img.info else "RGB")
            img.save(target, "WEBP", quality=85, method=6)
        results.append({"source": str(source.relative_to(root)), "webp": str(target.relative_to(root)), "old_bytes": source.stat().st_size, "new_bytes": target.stat().st_size, "status": "converted"})
    except Exception as exc:
        results.append({"source": str(source.relative_to(root)), "status": "error", "message": str(exc)})
report = root / "webp-conversion-report.json"
report.write_text(json.dumps(results, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"Converted {sum(x['status']=='converted' for x in results)} images; errors {sum(x['status']=='error' for x in results)}")
