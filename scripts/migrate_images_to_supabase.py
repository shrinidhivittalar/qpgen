"""
One-time migration: upload all question paper images to Supabase Storage.
Run: python scripts/migrate_images_to_supabase.py

Requires: pip install supabase
"""
import os, sys
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / "qp-builder" / ".env")

SUPABASE_URL     = os.getenv("SUPABASE_URL")
SUPABASE_KEY     = os.getenv("SUPABASE_SERVICE_KEY")
BUCKET           = "QPGen-images"

if not SUPABASE_URL or not SUPABASE_KEY:
    sys.exit("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in qp-builder/.env")

from supabase import create_client

client = create_client(SUPABASE_URL, SUPABASE_KEY)

BASE = Path(__file__).parent.parent

# Maps to (subject, source) paths in the bucket
IMAGE_SOURCES = [
    (BASE / "parsed_output"       / "images", "science", "qp"),
    (BASE / "parsed_output_maths" / "images", "maths",   "qp"),
]

total = 0
for img_dir, subject, source in IMAGE_SOURCES:
    if not img_dir.exists():
        print(f"  SKIP  {subject}/{source} — directory not found: {img_dir}")
        continue

    images = list(img_dir.glob("*.png")) + list(img_dir.glob("*.jpg"))
    if not images:
        print(f"  SKIP  {subject}/{source} — no images found")
        continue

    print(f"\n  Uploading {len(images)} images for {subject}/{source}...")
    for img_path in images:
        dest = f"{subject}/{source}/{img_path.name}"
        with open(img_path, "rb") as f:
            content = f.read()
        try:
            client.storage.from_(BUCKET).upload(
                path=dest,
                file=content,
                file_options={"content-type": "image/png", "upsert": "true"},
            )
            print(f"    OK  {dest}")
            total += 1
        except Exception as e:
            print(f"    ERR {dest}: {e}")

print(f"\nDone. {total} images uploaded to {BUCKET}.")
print(f"Base URL: {os.getenv('VITE_SUPABASE_IMAGES_URL')}")
