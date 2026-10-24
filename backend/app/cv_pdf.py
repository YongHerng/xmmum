"""Controlled, escaped, paginated CV layout; never render model-provided HTML."""
import html
import io
import pymupdf as fitz

SECTIONS = [('summary','Professional summary'),('experience','Experience'),('projects','Projects'),
            ('education','Education'),('skills','Skills'),('certificates_training','Certificates & learning'),
            ('membership_licensure','Membership & licensure')]


def text(value):
    return html.escape(value.replace('\u2011','-').replace('\u2013','-').replace('\u2014','-'))


def render_cv(cv):
    body = f'<h1>{text(cv.name or "Curriculum vitae")}</h1>'
    contacts = ' | '.join(value for value in (cv.email,cv.phone) if value)
    if contacts:
        body += f'<p class="contact">{text(contacts)}</p>'
    for key,title in SECTIONS:
        value = getattr(cv,key)
        if not value:
            continue
        body += f'<h2>{text(title)}</h2>'
        entries = [entry for entry in cv.entries if entry.section == key]
        if key == 'skills':
            body += '<p>'+text(' | '.join(value))+'</p>'
        elif entries:
            for entry in entries:
                body += f'<h3>{text(entry.title)}</h3>'
                meta = ' | '.join(item for item in (entry.organisation,entry.dates) if item)
                if meta:
                    body += f'<p class="meta">{text(meta)}</p>'
                headings={value.casefold().strip() for value in (entry.title,entry.organisation,entry.dates) if value}
                body += '<ul>'+''.join(f'<li>{text(item)}</li>' for item in entry.bullets if item.strip() and item.casefold().strip() not in headings)+'</ul>'
            covered=' '.join(' '.join([entry.title,entry.organisation,entry.dates,*entry.bullets]) for entry in entries).casefold()
            body += ''.join(f'<p>{text(line)}</p>' for line in value.splitlines()
                            if line.strip() and ' '.join(line.split()).casefold() not in covered)
        else:
            body += ''.join(f'<p>{text(line.lstrip("•- "))}</p>' for line in value.splitlines() if line.strip())
    for section in cv.additional_sections:
        if section.content:
            body += f'<h2>{text(section.title)}</h2>'
            body += ''.join(f'<p>{text(line)}</p>' for line in section.content.splitlines() if line.strip())
    story = fitz.Story(html='<html><body>'+body+'</body></html>', user_css='''
        body {font-family:sans-serif;font-size:10.5pt;color:#222631;line-height:1.5}
        h1 {font-size:25pt;color:#29243e;margin:0 0 5pt;font-weight:bold}
        h2 {font-size:11.5pt;color:#493b71;margin:17pt 0 7pt;border-bottom:1px solid #d9d4e2;padding-bottom:4pt;page-break-after:avoid}
        h3 {font-size:11pt;margin:10pt 0 3pt;page-break-after:avoid}
        p {margin:0 0 6pt} ul {margin:3pt 0 8pt;padding-left:16pt} li {margin:0 0 4pt}
        .contact,.meta {font-size:9pt;color:#626577}''')
    stream = io.BytesIO()
    writer = fitz.DocumentWriter(stream)
    more = True
    for _ in range(15):
        device = writer.begin_page(fitz.Rect(0,0,595,842))
        more,_ = story.place(fitz.Rect(48,44,547,788))
        story.draw(device)
        writer.end_page()
        if not more:
            break
    writer.close()
    if more:
        raise ValueError('This CV exceeds 15 PDF pages. Shorten the sections before exporting.')
    with fitz.open(stream=stream.getvalue(),filetype='pdf') as document:
        document.set_metadata({'title':'Curriculum vitae','creator':'FutureProof CV studio'})
        for index,page in enumerate(document):
            page.insert_text((48,814),f'{index+1} / {len(document)}',fontsize=8,color=(.45,.45,.48))
        return document.tobytes(garbage=3,deflate=True)
