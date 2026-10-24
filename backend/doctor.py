"""Local diagnostics only. Never prints keys, passwords or connection strings."""
import sys

from dotenv import dotenv_values
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError

from app.config import ROOT, settings
from app.document_layout import executable


def main():
    frontend = dotenv_values(ROOT / "frontend/.env.local")
    frontend_url = frontend.get("NEXT_PUBLIC_SUPABASE_URL") or settings.supabase_url
    frontend_key = frontend.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") or settings.supabase_publishable_key
    print(f"Python {sys.version.split()[0]}")
    print(f"Root .env present: {(ROOT / '.env').is_file()}")
    print(f"Frontend .env.local present: {(ROOT / 'frontend/.env.local').is_file()}")
    print(f"Supabase public key configured: {bool(frontend_key)}")
    print(f"Frontend/backend Supabase URLs match: {frontend_url.rstrip('/') == settings.supabase_url.rstrip('/')}")
    print(f"Database URL configured: {bool(settings.database_url)}")
    if settings.database_url:
        parsed = make_url(settings.database_url)
        print(f"Database URL uses PostgreSQL: {parsed.drivername.startswith(('postgres', 'postgresql'))}")
        print(f"Database URL has sslmode query option (remove it): {'sslmode' in parsed.query}")
        print(f"Database password still contains a placeholder: {bool(parsed.password and ('[YOUR-' in parsed.password or '<' in parsed.password))}")
    print("Text PDF/DOCX reading: available")
    print(f"Tesseract OCR for scans/images: {'available' if executable('tesseract') else 'not installed; use text PDF/DOCX or manual entry'}")
    print(f"LibreOffice Word layout: {'available' if executable('soffice') else 'using built-in reformatted preview'}")
    print(f"Optional AI wording review configured: {bool(settings.ai_enabled and settings.ai_api_key and settings.ai_model)}")
    print("Demos: http://127.0.0.1:3000/demo/student and /demo/professional")
    print("See README.md for the live Supabase connectivity/schema check.")


if __name__ == '__main__':
    try:
        main()
    except (ValueError, ArgumentError) as exc:
        print(f"Configuration check failed ({type(exc).__name__}). Check .env formatting; credentials have not been printed.")
        sys.exit(1)
