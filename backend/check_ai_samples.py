"""Private CV regression harness. No network unless --live is explicitly supplied.

Usage: python backend/check_ai_samples.py --archive PATH
No account DB writes or model training. Only aggregate diagnostics are printed.
Private page previews stay ignored.
"""
import argparse
import asyncio
import json
import sys
from pathlib import Path
from zipfile import ZipFile

import pymupdf

sys.path.insert(0, str(Path(__file__).resolve().parent))
from app.documents import parse_document
from app.document_layout import executable
from app.engine import evaluate
from app.schemas import CV
from app.cv_ai import coverage_notice, extract_cv
from app.ai_provider import AIUnavailable
from app.config import settings


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--archive', required=True)
    parser.add_argument('--live', action='store_true', help='Send redacted OCR text to the configured AI provider; obtain permission first.')
    parser.add_argument('--sample', type=int, help='Only run live AI for this sample number.')
    args = parser.parse_args()
    if args.live:
        settings.ai_enabled = True
        settings.ai_max_output_tokens = 4096
        # Two full runs plus four targeted diagnostics, never an unbounded loop.
        settings.ai_calls_per_user_hour = 24
    output = Path(__file__).resolve().parents[1] / '.private-ai-tests'
    output.mkdir(exist_ok=True)
    results = []
    with ZipFile(args.archive) as archive:
        files = [entry for entry in archive.infolist() if entry.filename.lower().endswith('.pdf')]
        if len(files) > 100 or any(entry.file_size > 10*1024*1024 for entry in files):
            raise ValueError('Sample archive exceeds test limits.')
        for index, entry in enumerate(files, 1):
            if args.sample is not None and args.sample != index:
                continue
            content = archive.read(entry)
            with pymupdf.open(stream=content, filetype='pdf') as document:
                characters = sum(len(page.get_text()) for page in document)
                document[0].get_pixmap(matrix=pymupdf.Matrix(.7,.7)).save(output / f'sample-{index:02d}.png')
            item = {'sample': index, 'category': Path(entry.filename).parent.name,
                    'text_characters': characters, 'requires_ocr': characters < 30}
            try:
                live = args.live and (args.sample is None or args.sample == index)
                result = parse_document(content, entry.filename, 'application/pdf', include_ai_source=live)
                cv = CV.model_validate(result['cv'])
                if live:
                    try:
                        cv = await extract_cv(result['_ai_source']['text'], cv, 'operator-sample-tests')
                        item['ai_validated'] = True
                    except (AIUnavailable,ValueError) as exc:
                        item['ai_validated'] = False
                        item['ai_issue'] = str(exc) if isinstance(exc,AIUnavailable) else 'AI extraction failed schema validation.'
                        cause = exc.__cause__
                        if cause:
                            item['ai_error_kind'] = type(cause).__name__
                            if hasattr(cause, 'errors'):
                                item['validation_issues'] = [{'location':error['loc'],'type':error['type']}
                                    for error in cause.errors(include_input=False, include_context=False, include_url=False)]
                rating = evaluate(cv)
                item.update(parsed=True, used_ocr=result['document']['used_ocr'],
                            populated_sections=[key for key in ('summary','education','experience','projects','skills','certificates_training') if getattr(cv,key)],
                            recognized_skills=len(rating['skills']), unmapped_skills=len(coverage_notice(cv)['unmapped_skills']),
                            score_in_range=0 <= rating['score'] <= 100,
                            reproducible=(rating==evaluate(cv)))
            except ValueError as exc:
                item.update(parsed=False, issue=str(exc))
            results.append(item)
    report = {'count': len(results), 'ocr_available':bool(executable('tesseract')),
              'parsed':sum(item.get('parsed',False) for item in results), 'samples':results}
    suffix = f'-{args.sample}' if args.sample is not None else ''
    (output/(f'sample-report-live{suffix}.json' if args.live else f'sample-report{suffix}.json')).write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps(report,indent=2))


if __name__ == '__main__':
    asyncio.run(main())
