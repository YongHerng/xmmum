"""Build public fictional demo assets locally. Never reads accounts or providers."""
import html
import io
import sys
from pathlib import Path
import pymupdf as fitz

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.demo import demo_snapshot
from app.demo_outcomes import COURSES
from app.schemas import CV
from app.cv_pdf import render_cv

OUTPUT = Path(__file__).resolve().parents[2] / 'frontend/public/demos'


def label_pdf(content, title):
    with fitz.open(stream=content, filetype='pdf') as doc:
        doc.set_metadata({'title':title, 'creator':'Pravista authored demo'})
        for page in doc:
            page.insert_text((48, 26), 'PRAVISTA | FICTIONAL DEMO - NOT A REAL PERSON OR QUALIFICATION', fontsize=7, color=(.35,.27,.65))
        return doc.tobytes(garbage=3, deflate=True)


def guide(title, chapters):
    esc = html.escape
    body = f'<h1>{esc(title)}</h1><p class="intro">Original introductory study example. Read each numbered lesson, then try the local demonstration quiz. No provider affiliation or professional certification is claimed.</p>'
    for number, (chapter, lessons) in enumerate(chapters, 1):
        body += f'<h2>Chapter {number}: {esc(chapter)}</h2>'
        for index, (heading, content) in enumerate(lessons, 1):
            body += f'<h3>{number}.{index} {esc(heading)}</h3><p>{esc(content)}</p>'
    body += '<h2>Practice checkpoint</h2><p>Explain the concept in your own words, describe an approved example, and record what you still need to learn. The demonstration quiz includes single-answer, multiple-answer, fill-in-the-blank and matching questions.</p>'
    story = fitz.Story(html='<html><body>'+body+'</body></html>', user_css='body{font-family:sans-serif;font-size:10pt;color:#252238;line-height:1.5}h1{font-size:23pt;color:#5735b9;margin:0 0 12pt}h2{font-size:13pt;margin:16pt 0 7pt;color:#493b71;page-break-after:avoid}h3{font-size:10.5pt;margin:9pt 0 4pt;page-break-after:avoid}p{margin:0 0 7pt}.intro{color:#605975}')
    stream = io.BytesIO()
    writer = fitz.DocumentWriter(stream)
    for _ in range(5):
        device = writer.begin_page(fitz.Rect(0,0,595,842))
        more, _ = story.place(fitz.Rect(48,48,547,785))
        story.draw(device);writer.end_page()
        if not more:
            break
    writer.close()
    if more:
        raise ValueError('Demo guide exceeds the expected page bound.')
    return label_pdf(stream.getvalue(), title+' - fictional study guide')


def export():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for persona in ('student', 'professional'):
        sample = demo_snapshot(persona)
        cv = CV.model_validate(sample['cv'])
        for change in sample['demo_outcomes']['improvements']:
            setattr(cv, change['field'], change['after'])
        cv.entries = [entry for entry in cv.entries if entry.section != 'projects']
        cv.certificates_training = sample['demo_outcomes']['badge_addition']
        content = label_pdf(render_cv(cv), 'Fictional improved CV - '+persona)
        target = OUTPUT / f'{persona}-improved-cv.pdf'
        target.write_bytes(content)
        print(target.name)
    for skill, title, chapters in COURSES:
        target = OUTPUT / f'{skill}-study-guide.pdf'
        target.write_bytes(guide(title, chapters))
        print(target.name)


if __name__ == '__main__':
    export()
