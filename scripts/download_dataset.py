#!/usr/bin/env python3
"""
FinLake P0 — Download and verify the PaySim dataset.

Usage:
    # Download from Kaggle (requires KAGGLE_USERNAME + KAGGLE_KEY):
    python scripts/download_dataset.py

    # Use an already-downloaded file:
    python scripts/download_dataset.py --local-path /path/to/PS_20174392719_1491204439457_log.csv

    # Just verify checksum of an existing file:
    python scripts/download_dataset.py --verify-only
"""
import argparse
import hashlib
import os
import shutil
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = PROJECT_ROOT / "data" / "raw"
EXPECTED_FILENAME = "PS_20174392719_1491204439457_log.csv"
CHECKSUM_FILE = RAW_DIR / "checksums.sha256"
KAGGLE_DATASET = "ealaxi/paysim1"

# Expected properties (approximate — the first run records the actual values)
EXPECTED_COLUMNS = 11
EXPECTED_ROW_ESTIMATE = 6_362_620  # approximate


def sha256_file(path: Path, chunk_size: int = 8 * 1024 * 1024) -> str:
    """Compute SHA-256 of a file in bounded-memory chunks."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def save_checksum(filepath: Path, digest: str) -> None:
    """Write or update the checksum file."""
    CHECKSUM_FILE.parent.mkdir(parents=True, exist_ok=True)
    lines: list[str] = []
    fname = filepath.name
    if CHECKSUM_FILE.exists():
        with open(CHECKSUM_FILE, "r", encoding="utf-8") as f:
            lines = [
                line
                for line in f.read().splitlines()
                if line.strip() and not line.strip().endswith(fname)
            ]
    lines.append(f"{digest}  {fname}")
    with open(CHECKSUM_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(sorted(lines)) + "\n")
    print(f"[OK] Checksum recorded in {CHECKSUM_FILE}")


def read_saved_checksum(filename: str) -> str | None:
    """Read a previously saved checksum for a filename."""
    if not CHECKSUM_FILE.exists():
        return None
    with open(CHECKSUM_FILE, "r", encoding="utf-8") as f:
        for line in f:
            parts = line.strip().split("  ", 1)
            if len(parts) == 2 and parts[1] == filename:
                return parts[0]
    return None


def quick_csv_check(path: Path) -> dict:
    """Fast line/column count without loading into memory."""
    with open(path, "r", encoding="utf-8") as f:
        header = f.readline().strip()
        columns = header.split(",")
        line_count = sum(1 for _ in f)  # data lines only
    return {
        "columns": columns,
        "num_columns": len(columns),
        "num_rows": line_count,
        "file_size_bytes": path.stat().st_size,
    }


def download_kaggle(dest_dir: Path) -> Path:
    """Download PaySim from Kaggle using kagglehub."""
    try:
        import kagglehub  # type: ignore
    except ImportError:
        print("[WARNING] kagglehub is not installed — trying Hugging Face mirror.")
        return download_huggingface(dest_dir)

    print(f"[INFO] Downloading '{KAGGLE_DATASET}' from Kaggle...")
    try:
        cache_path = kagglehub.dataset_download(KAGGLE_DATASET)
    except Exception as e:
        print(f"[WARNING] Kaggle download failed ({e}) — trying Hugging Face mirror.")
        return download_huggingface(dest_dir)

    cache_path = Path(cache_path)
    print(f"[INFO] Kaggle cache path: {cache_path}")

    # Find the CSV file in the cache
    candidates = list(cache_path.rglob("*.csv"))
    if not candidates:
        print("[ERROR] No CSV file found in Kaggle download.")
        sys.exit(1)

    src = candidates[0]
    dst = dest_dir / EXPECTED_FILENAME
    dest_dir.mkdir(parents=True, exist_ok=True)

    if dst.exists():
        print(f"[INFO] File already exists at {dst}, skipping copy.")
    else:
        print(f"[INFO] Copying {src.name} -> {dst}")
        shutil.copy2(src, dst)

    return dst


def download_huggingface(dest_dir: Path) -> Path:
    """Download PaySim from the Hugging Face mirror."""
    dst = dest_dir / EXPECTED_FILENAME
    dest_dir.mkdir(parents=True, exist_ok=True)

    if dst.exists():
        print(f"[INFO] File already exists at {dst}, skipping download.")
        return dst

    try:
        from huggingface_hub import hf_hub_download  # type: ignore

        print("[INFO] Downloading from Hugging Face mirror (LordNR/AMLGraphX-Paysim)...")
        downloaded = hf_hub_download(
            repo_id="LordNR/AMLGraphX-Paysim",
            filename="PS_20174392719_1491204439457_log.csv",
            repo_type="dataset",
            local_dir=str(dest_dir),
        )
        downloaded = Path(downloaded)
        if downloaded.name != EXPECTED_FILENAME:
            downloaded.rename(dst)
        print(f"[OK]   Downloaded to {dst}")
        return dst
    except ImportError:
        print("[INFO] huggingface_hub not installed — trying direct URL download...")
        return download_direct(dest_dir)
    except Exception as e:
        print(f"[WARNING] Hugging Face download failed ({e}) — trying direct URL...")
        return download_direct(dest_dir)


def download_direct(dest_dir: Path) -> Path:
    """Download PaySim via direct HTTPS URL (urllib, no extra deps)."""
    import urllib.request

    dst = dest_dir / EXPECTED_FILENAME
    dest_dir.mkdir(parents=True, exist_ok=True)

    if dst.exists():
        print(f"[INFO] File already exists at {dst}, skipping download.")
        return dst

    url = (
        "https://huggingface.co/datasets/LordNR/AMLGraphX-Paysim/"
        "resolve/main/PS_20174392719_1491204439457_log.csv"
    )
    print(f"[INFO] Downloading from {url} ...")
    print("       This may take several minutes (~470 MB).")

    try:
        urllib.request.urlretrieve(url, str(dst))
        print(f"[OK]   Downloaded to {dst}")
    except Exception as e:
        print(f"[ERROR] Direct download failed: {e}")
        print("        Please download the file manually and use --local-path.")
        sys.exit(1)

    return dst


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Download and verify the PaySim dataset for FinLake."
    )
    parser.add_argument(
        "--local-path",
        type=str,
        default=None,
        help="Path to an already-downloaded CSV file (skips Kaggle download).",
    )
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="Only verify checksum of the file already in data/raw/.",
    )
    args = parser.parse_args()

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    target = RAW_DIR / EXPECTED_FILENAME

    # ---- Acquire the file ------------------------------------------------
    if args.verify_only:
        if not target.exists():
            print(f"[ERROR] File not found: {target}")
            sys.exit(1)
    elif args.local_path:
        src = Path(args.local_path).resolve()
        if not src.exists():
            print(f"[ERROR] File not found: {src}")
            sys.exit(1)
        if src != target:
            RAW_DIR.mkdir(parents=True, exist_ok=True)
            print(f"[INFO] Copying {src} -> {target}")
            shutil.copy2(src, target)
        target = RAW_DIR / src.name if src.name != EXPECTED_FILENAME else target
    else:
        target = download_kaggle(RAW_DIR)

    if not target.exists():
        print(f"[ERROR] File not found after acquisition: {target}")
        sys.exit(1)

    # ---- Checksum ---------------------------------------------------------
    print(f"\n[INFO] Computing SHA-256 for {target.name} ...")
    digest = sha256_file(target)
    print(f"[OK]   SHA-256: {digest}")

    saved = read_saved_checksum(target.name)
    if saved and saved != digest:
        print(f"[WARNING] Checksum mismatch! Saved={saved}, Computed={digest}")
    elif saved:
        print(f"[OK]   Checksum matches saved value.")

    save_checksum(target, digest)

    # ---- Quick sanity check -----------------------------------------------
    print(f"\n[INFO] Quick CSV sanity check...")
    info = quick_csv_check(target)
    size_mb = info["file_size_bytes"] / (1024 * 1024)

    print(f"       File size     : {size_mb:,.1f} MB ({info['file_size_bytes']:,} bytes)")
    print(f"       Columns       : {info['num_columns']} ({', '.join(info['columns'][:5])}...)")
    print(f"       Data rows     : {info['num_rows']:,}")

    if info["num_columns"] != EXPECTED_COLUMNS:
        print(f"[WARNING] Expected {EXPECTED_COLUMNS} columns, found {info['num_columns']}")

    # ---- Summary ----------------------------------------------------------
    print("\n" + "=" * 60)
    print("  PaySim Dataset — Acquisition Summary")
    print("=" * 60)
    print(f"  File     : {target}")
    print(f"  Size     : {size_mb:,.1f} MB")
    print(f"  Rows     : {info['num_rows']:,}")
    print(f"  Columns  : {info['num_columns']}")
    print(f"  SHA-256  : {digest}")
    print(f"  Checksum : {CHECKSUM_FILE}")
    print("=" * 60)
    print("\n[OK] Dataset acquisition complete. Run profile_dataset.py for full analysis.")


if __name__ == "__main__":
    main()
