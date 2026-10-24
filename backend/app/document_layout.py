"""Ephemeral document previews and normalized source positions for the CV reader."""
from __future__ import annotations

import base64
import csv
import html
import io
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from unicodedata import normalize

import pymupdf as fitz

from .config import settings

MAX_OCR_PAGES = 10
MAX_PIXELS = 24_000_000


def executable(name: str) -> str | None:
    override = (os.getenv("TESSERACT_CMD") or settings.tesseract_cmd) if name == "tesseract" else (os.getenv("LIBREOFFICE_CMD") or settings.libreoffice_cmd)
    if override and Path(override).is_file():
        return override
    found = shutil.which(name)
    if found:
        return found
    if os.name == "nt":
        candidates = ([Path(__file__).resolve().parents[2] / ".tools/tesseract/tesseract.exe",
                       Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe")]
                      if name == "tesseract" else [
                          Path(__file__).resolve().parents[2] / ".tools/libreoffice/program/soffice.exe",
                          Path(r"C:\Program Files\LibreOffice\program\soffice.exe"),
                      ])
        return next((str(p) for p in candidates if p.is_file()), None)
    return None


def word_preview(content: bytes, paragraphs: list[str]) -> tuple[bytes, bool]:
    """Convert using a private temporary office profile; retain no uploaded files."""
    office = executable("soffice")
    if office:
        with tempfile.TemporaryDirectory(prefix="futureproof-cv-") as folder:
            root = Path(folder)
            source = root / "cv.docx"
            source.write_bytes(content)
            profile = (root / "profile").as_uri()
            command = [office, f"-env:UserInstallation={profile}", "--headless", "--nologo",
                       "--nodefault", "--norestore", "--convert-to", "pdf:writer_pdf_Export",
                       "--outdir", str(root), str(source)]
            try:
                result = subprocess.run(command, check=False, capture_output=True, timeout=60,
                                        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            except subprocess.TimeoutExpired as exc:
                raise ValueError("This Word document took too long to prepare. Try exporting it as PDF.") from exc
            target = root / "cv.pdf"
            if result.returncode == 0 and target.is_file():
                return target.read_bytes(), False
    # A fresh checkout still supports Word files without a machine-wide Office install.
    # This is explicitly labelled as a reformatted preview, never as the original layout.
    body = "".join(f"<p>{html.escape(p)}</p>" for p in paragraphs if p.strip())
    story = fitz.Story(html=f"<html><body>{body}</body></html>",
                       user_css="body {font-family:sans-serif;font-size:11pt} p {margin:0 0 10pt}")
    stream = io.BytesIO()
    writer = fitz.DocumentWriter(stream)
    more = True
    for _ in range(50):
        device = writer.begin_page(fitz.Rect(0, 0, 595, 842))
        more, _ = story.place(fitz.Rect(48, 48, 547, 794))
        story.draw(device)
        writer.end_page()
        if not more:
            break
    writer.close()
    if more:
        raise ValueError("The Word preview exceeds 50 pages. Please use a shorter CV.")
    return stream.getvalue(), True


def ocr_lines(page: fitz.Page, page_index: int) -> list[dict]:
    engine = executable("tesseract")
    if not engine:
        raise ValueError("This CV is scanned. Install Tesseract OCR, use a text-based PDF, or enter the details manually.")
    scale = min(2.0, (MAX_PIXELS / max(1, page.rect.width * page.rect.height)) ** .5)
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
    language_data = Path(engine).parent / "tessdata"
    # Tesseract's narrow filesystem API cannot open non-ASCII absolute paths on
    # Windows. Python sets the Unicode working directory; use a relative model path.
    language_args = ["--tessdata-dir", "tessdata"] if (language_data / "eng.traineddata").is_file() else []
    try:
        result = subprocess.run([engine, "stdin", "stdout", *language_args, "-l", "eng", "--psm", "3", "tsv"],
                                check=False, input=pix.tobytes("png"), capture_output=True, timeout=30,
                                cwd=str(Path(engine).parent) if language_args else None,
                                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    except subprocess.TimeoutExpired as exc:
        raise ValueError("The scanned CV took too long to read. Try a clearer, smaller file.") from exc
    if result.returncode:
        raise ValueError("OCR could not read this document. Try a clearer PDF or image.")
    groups: dict[tuple, list] = {}
    for row in csv.DictReader(io.StringIO(result.stdout.decode("utf-8", errors="replace")), delimiter="\t"):
        text = row.get("text", "").strip()
        if not text or float(row.get("conf", -1)) < 0:
            continue
        key = tuple(row.get(k) for k in ("block_num", "par_num", "line_num"))
        groups.setdefault(key, []).append(row)
    lines = []
    for words in groups.values():
        x0 = min(int(w["left"]) for w in words)
        y0 = min(int(w["top"]) for w in words)
        x1 = max(int(w["left"]) + int(w["width"]) for w in words)
        y1 = max(int(w["top"]) + int(w["height"]) for w in words)
        lines.append({"page": page_index, "text": " ".join(w["text"] for w in words),
                      "box": [x0 / pix.width, y0 / pix.height, x1 / pix.width, y1 / pix.height],
                      "confidence": round(sum(float(w["conf"]) for w in words) / len(words))})
    return lines


def document_layout(pdf: bytes) -> tuple[str, dict]:
    pages, lines = [], []
    started, ocr_count = time.monotonic(), 0
    with fitz.open(stream=pdf, filetype="pdf") as doc:
        if doc.is_encrypted:
            raise ValueError("Password-protected PDFs are not supported.")
        if not len(doc) or len(doc) > 50:
            raise ValueError("PDFs must have between 1 and 50 pages.")
        for index, page in enumerate(doc):
            if time.monotonic() - started > 90:
                raise ValueError("This CV took too long to read. Try a shorter document.")
            rect = page.rect
            pages.append({"number": index + 1, "width": rect.width, "height": rect.height})
            page_lines = []
            for block in page.get_text("dict", flags=fitz.TEXTFLAGS_DICT & ~fitz.TEXT_PRESERVE_IMAGES, sort=True)["blocks"]:
                for line in block.get("lines", []):
                    text = "".join(span["text"] for span in line["spans"]).strip()
                    if not text:
                        continue
                    bounds = fitz.Rect(line["bbox"]) * page.rotation_matrix
                    page_lines.append({"page": index, "text": text,
                                       "box": [max(0, bounds.x0 / rect.width), max(0, bounds.y0 / rect.height),
                                               min(1, bounds.x1 / rect.width), min(1, bounds.y1 / rect.height)],
                                       "confidence": None})
            if not page_lines:
                ocr_count += 1
                if ocr_count > MAX_OCR_PAGES:
                    raise ValueError("Scanned CVs can contain up to 10 pages. Please upload a shorter file.")
                page_lines = ocr_lines(page, index)
            lines.extend(page_lines)
    text = "\n".join(line["text"] for line in lines)
    return text, {"pages": pages, "lines": lines, "used_ocr": bool(ocr_count)}


def evidence(cv: dict, lines: list[dict]) -> list[dict]:
    """Map each extracted field to actual lines. Native PDF text has no OCR confidence."""
    fields = []
    # PDF/Office fonts can emit ligatures such as "\ufb01". Keep original boxes
    # while matching the normalized text returned by the section parser.
    searchable = [(line, normalize("NFKC", line["text"]).casefold()) for line in lines]
    for key in ("name", "email", "phone", "skills", "summary", "education", "experience", "projects", "membership_licensure", "certificates_training"):
        value = cv.get(key)
        candidates = value if isinstance(value, list) else str(value or "").splitlines()
        candidates = [v.strip() for v in candidates if v.strip()]
        matches = []
        for candidate in candidates:
            match = next((line for line, text in searchable if normalize("NFKC", candidate).casefold() in text), None)
            if match and match not in matches:
                matches.append(match)
        confidences = [m["confidence"] for m in matches if m["confidence"] is not None]
        confidence = round(sum(confidences) / len(confidences)) if confidences else None
        reason = ""
        if not candidates and key not in {"phone", "membership_licensure", "certificates_training"}:
            reason = "Not found in the document. Add it or confirm that it can stay blank."
        elif candidates and (not matches or (key == "skills" and len(matches) < len(candidates)
                             and not all(any(normalize("NFKC", c).casefold() in normalize("NFKC", m["text"]).casefold() for m in matches) for c in candidates))):
            reason = "Some text was normalized. Check this field against the document."
        elif confidence is not None and confidence < 85:
            reason = "The scan is unclear here. Check this text against the document."
        elif key == "name" and (len(str(value).split()) < 2 or any(c.isdigit() for c in str(value))):
            reason = "Check that this is your full name."
        fields.append({"key": key, "value": ", ".join(value) if isinstance(value, list) else value or "",
                       "sources": [{"page": m["page"], "box": m["box"]} for m in matches[:12]],
                       "confidence": confidence, "needs_review": bool(reason), "reason": reason})
    return fields


def encode_pdf(pdf: bytes) -> str:
    return base64.b64encode(pdf).decode("ascii")
