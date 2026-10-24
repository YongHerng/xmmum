"""Explicit bounded live QA: synthetic CV, public vacancies; no account writes."""
import argparse
import asyncio
import json
from pathlib import Path
import pymupdf as fitz
from app.schemas import CV
from app.config import settings
from app.cv_ai import extract_cv,rewrite_cv
from app.cv_rating import assess_cv
from app.cv_pdf import render_cv
from app.jobs import fetch_jobs,rate_jobs,Outlook,OutlookRequest,outlook
from app.ai_provider import AIUnavailable
from app import ai_provider

SOURCE='''Example Candidate
Professional summary
I configure small networks and troubleshoot connectivity problems. I used SQL for a student project.
Education
Diploma in Information Technology
Example Institute
2022-2024
Experience
IT Support Intern
Example Organisation
2024-2025
Configured 2 routers and documented network troubleshooting steps.
Skills
Networking
SQL
Projects
Office network lab
Built a lab using 2 routers and tested connectivity.
Volunteering
Supported a community computer lab.
Languages
English
Awards
Student network project prize.
'''


async def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--live',action='store_true')
    parser.add_argument('--task',choices=['all','extraction','rating','outlook','pdf'],default='all')
    args=parser.parse_args()
    cv=CV(name='Example Candidate',email='candidate@example.invalid',summary='I configure small networks and troubleshoot connectivity problems. I used SQL for a student project.',
          education='Diploma in Information Technology\nExample Institute\n2022-2024',
          experience='IT Support Intern\nExample Organisation\n2024-2025\nConfigured 2 routers and documented network troubleshooting steps.',
          projects='Office network lab\nBuilt a lab using 2 routers and tested connectivity.',skills=['Networking','SQL'],target_role='cloud-support')
    folder=Path(__file__).resolve().parents[1]/'.private-ai-tests';folder.mkdir(exist_ok=True)
    report={}
    if args.live:
        # Explicit operator checks only; normal signed-in users retain the 8/hour cap.
        settings.ai_calls_per_user_hour=12
        original_transport=ai_provider.transport
        async def capture(messages,schema):
            response=await original_transport(messages,schema)
            if args.task=='rating':
                (folder/'synthetic-rating-response.txt').write_text(response[0] if isinstance(response,tuple) else response,encoding='utf-8')
            return response
        ai_provider.transport=capture
        for name,operation in [('extraction',lambda:extract_cv(SOURCE,CV(),'operator-v2')),
                               ('rating',lambda:assess_cv(cv,'operator-v2')),
                               ('rewrite',lambda:rewrite_cv(cv,'operator-v2',['summary']))]:
            if args.task!='all' and args.task!=name:continue
            try:
                result=await operation();report[name]={'ok':True}
                if name=='extraction':
                    report[name]['structured_entries']=len(result.entries)
                    report[name]['additional_sections']=[section.title for section in result.additional_sections]
                    cv=result.model_copy(update={'email':cv.email,'target_role':'cloud-support'})
                if name=='rating':
                    report[name].update(score=result['score'],criteria=len(result['breakdown']))
                    report[name]['direction']=result.get('direction',{}).get('title') if result.get('direction') else None
                if name=='rewrite':
                    cv=cv.model_copy(update={item.field:item.after for item in result})
                    cv.entries=[item for item in cv.entries if item.section not in {change.field for change in result}]
            except AIUnavailable as exc:
                report[name]={'ok':False,'issue':str(exc),'cause':type(exc.__cause__).__name__ if exc.__cause__ else None}
                if exc.__cause__ and hasattr(exc.__cause__,'errors'):
                    report[name]['validation']=[{'location':error['loc'],'type':error['type']} for error in exc.__cause__.errors(include_input=False,include_context=False,include_url=False)]
        try:
            if args.task!='all':raise StopAsyncIteration
            fetched,cached=await fetch_jobs('junior network engineer in Kuala Lumpur','my','operator-v2')
            report['job_search']={'ok':True,'listings':len(fetched['jobs']),'cached':cached}
            if fetched['jobs']:
                ranked=await rate_jobs(fetched['jobs'],cv,{'cv':cv.model_dump(exclude={'name','email','phone'}),'preferences':{'location':'Malaysia','work_style':'practical'},'badges':[]},'operator-v2')
                report['job_matching']={'ok':True,'assessments':len(ranked)}
                (folder/'public-job-report.json').write_text(json.dumps({'search':fetched|{'jobs':ranked}},indent=2),encoding='utf-8')
        except StopAsyncIteration:
            pass
        except Exception as exc:
            report['job_search']={'ok':False,'issue':getattr(exc,'detail',str(exc))}
        if args.task in ('all','outlook'):
            from sqlalchemy.ext.asyncio import create_async_engine,async_sessionmaker
            from app.db import Base,CVProfile
            engine=create_async_engine('sqlite+aiosqlite:///:memory:')
            try:
                async with engine.begin() as connection:await connection.run_sync(Base.metadata.create_all)
                async with async_sessionmaker(engine,expire_on_commit=False)() as db:
                    db.add(CVProfile(user_id='operator-v2',payload={'cv':cv.model_dump(),'version':1}));await db.flush()
                    value=await outlook(OutlookRequest(role='Network support in Malaysia',ai_consent=True),user='operator-v2',db=db)
                    report['outlook']={'ok':True,'target_year':value['data']['target_year'],'sources':len(value['data']['sources'])}
            except Exception as exc:report['outlook']={'ok':False,'issue':getattr(exc,'detail',str(exc))}
            finally:await engine.dispose()
    pdf=render_cv(cv);(folder/'synthetic-improved-cv.pdf').write_bytes(pdf)
    with fitz.open(stream=pdf,filetype='pdf') as document:
        report['pdf']={'pages':len(document),'readable':bool(document[0].get_text().strip())}
        for index,page in enumerate(document):
            page.get_pixmap(matrix=fitz.Matrix(1,1)).save(folder/f'synthetic-cv-page-{index+1}.png')
    (folder/'v2-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps(report,indent=2))


if __name__=='__main__':
    asyncio.run(main())
