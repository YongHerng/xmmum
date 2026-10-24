"""Authored expected outcomes for public demos only. No provider or account access.

These examples deliberately do not claim to be live vacancies or model responses.
The offline exporter bundles them into the frontend for use during API outages.
"""
from copy import deepcopy

STAMP = '2026-10-25T00:00:00Z'
NOTICE = 'Hardcoded fictional example. No AI request, live job search or personal account update.'
COURSES = [
    ('networking', 'Networking Fundamentals', [
        ('Network foundations', [('What is a network?', 'A network connects devices so they can exchange information. A local area network covers a limited area.'), ('Switches and routers', 'A switch connects devices within a LAN. A router forwards packets between networks.')]),
        ('Addresses and services', [('IPv4 addressing', 'An IPv4 address identifies an interface. The subnet mask defines the network portion.'), ('DHCP and DNS', 'DHCP can assign network settings. DNS resolves names to records such as IP addresses.')]),
        ('Safe troubleshooting', [('Check from the connection outward', 'Check power, link status, addressing and the gateway before investigating a remote service.'), ('Document the result', 'Record observations, approved changes and the outcome. Avoid changes you are not authorized to make.')]),
    ]),
    ('data-center', 'Data Center Fundamentals', [
        ('Inside the facility', [('Racks and equipment', 'Racks organize servers, switches and supporting equipment. Follow site labels and approved access procedures.'), ('Power and cooling', 'Reliable power and cooling support service availability. Report alarms rather than bypassing safety controls.')]),
        ('Operations and monitoring', [('Follow a runbook', 'A runbook records approved steps, checks and escalation contacts for an operational task.'), ('Read an alert', 'Check the time, affected asset and related alerts before deciding what to escalate.')]),
        ('Change and incident handling', [('Plan a change', 'Record scope, approval, verification and rollback steps before an authorized change.'), ('Handover clearly', 'Explain the impact, evidence, actions already taken and the next owner.')]),
    ]),
    ('cloud', 'Cloud Fundamentals', [
        ('Cloud concepts', [('Service models', 'IaaS, PaaS and SaaS place different operational responsibilities on the customer and provider.'), ('Shared responsibility', 'Check the selected service: customer responsibilities do not disappear when a workload moves to the cloud.')]),
        ('Build a service', [('Compute and storage', 'Compute runs a workload. Storage retains data. Select resources to suit an example application requirement.'), ('Identity and access', 'Use named identities and least privilege. Keep secrets out of source code.')]),
        ('Operate responsibly', [('Monitor a workload', 'Track service health and investigate useful alerts. Define a recovery objective with the service owner.'), ('Control cost', 'Tag resources, review usage and set budget alerts before experimenting with paid services.')]),
    ]),
    ('cybersecurity', 'Cybersecurity Fundamentals', [
        ('Protect information', [('Security goals', 'Confidentiality, integrity and availability describe different protection requirements.'), ('Recognize phishing', 'Check unexpected requests through a known channel. Do not open suspicious links to investigate them.')]),
        ('Secure access', [('Account protection', 'Use unique passwords, a password manager and multifactor authentication where supported.'), ('Maintain devices', 'Apply approved updates and avoid granting unnecessary privileges.')]),
        ('Respond safely', [('Recovery preparation', 'Keep protected backups and test recovery according to an approved plan.'), ('Incident reporting', 'Record observations and report through the organization\'s process. Do not delete evidence or investigate outside your authority.')]),
    ]),
]


def sample_questions(prefix, skill):
    """All four supported question types, with explicit demo-only answer keys."""
    return [
        dict(id=prefix+'-single', question_type='single', prompt='What should you do before changing a system?', options=['Follow an approved plan', 'Change it without permission', 'Share a password'], answer_key=0, explanation='Use an authorized plan and know how to verify or undo the change.'),
        dict(id=prefix+'-multiple', question_type='multiple', prompt='Which actions support a clear operational handover?', options=['Record observations', 'Name the next owner', 'Hide unresolved issues'], answer_key=[0, 1], explanation='A handover needs evidence, ownership and unresolved work.'),
        dict(id=prefix+'-fill', question_type='fill', prompt='Complete the phrase: least ____ gives only the access needed.', options=[], answer_key=['privilege'], explanation='Least privilege limits unnecessary access.'),
        dict(id=prefix+'-matching', question_type='matching', prompt='Match each activity to its purpose.', options={'left':['Monitor', 'Document'], 'right':['Observe service health', 'Keep an evidence record']}, matching_choices=[{'value':0,'label':'Observe service health'}, {'value':1,'label':'Keep an evidence record'}], answer_key=[0, 1], explanation='Monitoring observes service health; documentation preserves the record.'),
    ]


def example_courses(persona):
    result = []
    completed_skill = 'data-center' if persona == 'professional' else 'networking'
    for skill, title, chapters in COURSES:
        cid = 'demo-'+skill
        rows = []
        for number, (name, lessons) in enumerate(chapters, 1):
            chapter_id = f'{cid}-ch-{number}'
            sections = [dict(id=f'{chapter_id}-{i}', title=heading, body=body, video_url='') for i, (heading, body) in enumerate(lessons, 1)]
            materials = [dict(id=f'{section["id"]}-pdf', name=title+' - study guide.pdf', kind='pdf', mime='application/pdf', size=10000, subsection_id=section['id'], url=f'/demos/{skill}-study-guide.pdf', download_url=f'/demos/{skill}-study-guide.pdf', expires_at=0) for section in sections]
            rows.append(dict(id=chapter_id, title=name, body='', skill=skill, minutes=12, subsections=sections, materials=materials, questions=sample_questions(chapter_id, skill), question_count=4))
        complete = skill == completed_skill
        # Chapter 2 first deliberately demonstrates actual completion order.
        order = [rows[1], rows[0], rows[2]] if complete else [rows[1]] if skill == 'cloud' else []
        passes = {chapter['id']:dict(completed_at=f'2026-10-{20+i:02d}T02:00:00Z', attempt_id=f'{chapter["id"]}-passed', order=i) for i, chapter in enumerate(order, 1)}
        completion = dict(completed_at=STAMP, attempt_id=cid+'-final-passed', badge_code='DEMO-'+skill.upper(), score=100) if complete else None
        assessments = {chapter['id']:dict(count=1, best_score=100, latest_id=passes[chapter['id']]['attempt_id']) for chapter in order}
        if completion:
            assessments['final'] = dict(count=1, best_score=100, latest_id=completion['attempt_id'])
        enrollment = dict(course_id=cid, enrolled_at='2026-10-20T00:00:00Z', chapter_passes=passes, assessments=assessments, completion=completion, resume={}) if passes else None
        result.append(dict(id=cid, title=title, provider='Pravista Demo Learning Lab', description='An original, short study example with three chapters, numbered lessons, PDF material and four quiz formats. Demo progress is local only and does not grant a real qualification.', category=title.removesuffix(' Fundamentals'), sample=True, owned=False, published=True, chapters=rows, final_questions=sample_questions(cid+'-final', skill), pass_percent=100, final_pass_percent=80, assessed_skills=[dict(skill_id=skill, level='foundation')], minutes=36, chapter_count=3, final_question_count=4, enrollment=enrollment, complete=complete, final_unlocked=complete, percent=100 if complete else 25 if passes else 0, milestones=[dict(**passes[chapter['id']], chapter_id=chapter['id'], title=chapter['title'], number=rows.index(chapter)+1) for chapter in order], disclaimer=NOTICE))
    return result


def example_assessment(professional):
    scores = [80, 76, 78, 80, 76, 78] if professional else [85, 80, 80, 85, 80, 82]
    names = ['Clarity & readability', 'Evidence & specificity', 'Target-role relevance', 'Organization', 'Skills presentation', 'Completeness']
    explanations = [
        'The summary states an understandable direction. Shorter, active sentences would make the contribution easier to scan.',
        'The fictional project names the work and its scope. Explain the outcome without inventing commercial impact.',
        'The current experience supports an early-career direction. Additional role-specific practice would strengthen the application.',
        'Education, experience, projects and extra sections are clearly separated.',
        'Tools are named explicitly. A foundation-level course badge is learning evidence, not professional experience.',
        'The example includes education, a project, skills and additional sections. Tailor it to an actual vacancy before use.',
    ]
    direction = dict(title='Data Center Operations Technician' if professional else 'Junior Data Analyst', explanation='The example combines hands-on equipment monitoring, fault documentation and a Data Center foundation badge.' if professional else 'The example combines Python and Excel analysis, a documented student project and an analytical work preference.', supporting_skills=['Excel', 'Data Center', 'Problem solving'] if professional else ['Python', 'Excel', 'Data analysis'], next_steps=['Practise an incident runbook.', 'Build cloud fundamentals.', 'Describe your own contribution with clear evidence.'] if professional else ['Build a small cloud-backed analysis project.', 'Document assumptions and data quality.', 'Tailor the CV to an entry-level vacancy.'])
    return dict(score=78 if professional else 82, breakdown=[dict(name=name, score=score, weight=weight, explanation=explanation, evidence=['Monitored 12 production stations.' if professional else 'Analyzed 2,000 synthetic energy readings in Python.']) for name, score, weight, explanation in zip(names, scores, [20,20,20,15,15,10], explanations)], strengths=['Specific project scope.', 'Clear education and skill sections.', 'A practical direction to explore.'], suggestions=['Use active wording to identify your contribution.', 'Explain the outcome without inventing achievements.', 'Label course learning as foundation-level evidence.'], skills=[], analysis_mode='demo-ai-rating', ai_status='Hardcoded assessment illustration - not a model response', note='Illustrative CV-writing score, not an ATS score or hiring probability.', summary='This authored example shows the expected six-part assessment of a saved CV. The strongest evidence is its specific project context; the main next step is clearer, role-relevant wording.', model='Authored demo example', rubric_version='ai-cv-rubric-2', rated_at=STAMP, direction=direction)


def demo_outcomes(persona, cv):
    professional = persona == 'professional'
    courses = example_courses(persona)
    completed = next(course for course in courses if course['complete'])
    badge = dict(**completed['enrollment']['completion'], course_id=completed['id'], title=completed['title'], provider=completed['provider'], sample=True, skills=[dict(**completed['assessed_skills'][0], name='Data Center' if professional else 'Networking')], matching_eligible=False)
    direction = example_assessment(professional)['direction']
    job_titles = ['Data Center Operations Technician', 'Infrastructure Support Associate', 'Cloud Operations Trainee'] if professional else ['Junior Data Analyst', 'Reporting Analyst Trainee', 'Technical Support Analyst']
    jobs = []
    for index, title in enumerate(job_titles):
        skill = 'cybersecurity' if index == 1 else 'cloud'
        course = next(c for c in courses if c['id'] == 'demo-'+skill)
        matched = ['Excel', 'Problem solving', 'Data Center'] if professional else ['Networking', 'Git', 'Communication'] if index == 2 else ['Python', 'Excel', 'Data analysis']
        jobs.append(dict(id=f'demo-{persona}-job-{index}', title=title, company=['Example Systems Studio', 'Example Digital Services', 'Example Infrastructure Lab'][index], location='Penang, Malaysia' if professional else 'Kuala Lumpur, Malaysia', description=f'Fictional vacancy example: {title}. Uses documentation, teamwork and {skill} fundamentals. This is not an active job advertisement.', apply_url='', publisher='Authored demo vacancy', posted_at='', salary=None, employment_type='Full-time example', assessment=dict(job_id=f'demo-{persona}-job-{index}', score=[86,79,72][index], explanation='The illustrated fit combines current CV skills, Discover yourself preferences and the example earned badge. It is not a prediction of hiring.', matched_skills=matched, current_matched_skills=matched, missing_requirements=['Practical '+skill+' experience is not yet evidenced.'], unknowns=['Employer eligibility and actual role availability are not assessed in this demo.'], skill_gaps=[dict(skill_id=skill, label=course['category'], courses=[dict(id=course['id'], title=course['title'])])])))
    outlooks = {}
    future_titles = ['Infrastructure Operations Specialist', 'Cloud Operations Engineer', 'Infrastructure Team Lead'] if professional else ['Data Analyst', 'Analytics Engineer', 'Analytics Team Lead']
    for years, title in zip([5,10,15], future_titles):
        outlooks[str(years)] = dict(role=direction['title'], target_year=2026+years, horizon_years=years, summary='A hardcoded development scenario showing how current evidence, additional learning and practical experience could connect. It does not forecast the number of jobs.', drivers=['Practice with data and digital infrastructure.', 'Communication, responsible change and continuous learning.'], uncertainties=['Local employer demand can change.', 'Longer horizons carry greater uncertainty.'], notice=NOTICE+' No guaranteed job, growth rate or future vacancy count.', evidence_quality='Illustration only; no live labour-market analysis has been performed.', created_at=STAMP, sources=[], future_roles=[dict(title=title, reason=f'An illustrative {years}-year direction, conditional on further practice and experience.', development_steps=['Complete the next foundation course.', 'Build and document a practical project.', 'Seek feedback and relevant work experience.']), dict(title='Technical Project Coordinator', reason='An alternative path combining technical understanding and clear coordination.', development_steps=['Practise a documented handover.', 'Coordinate a small approved project.', 'Review which type of work you enjoy.'])])
    improved_summary = 'Quality technician with four years of equipment-monitoring experience, now building a foundation in data center operations. Documents faults and communicates evidence clearly.' if professional else 'Computer science student using Python and Excel to explore data. Analyzed synthetic energy readings and presented clear charts to a student team.'
    improvements = [dict(field='summary', title='Professional summary', before=cv.summary, after=improved_summary, reason='Use active wording and connect the existing evidence to the stated direction.'), dict(field='projects', title='Projects', before=cv.projects, after='Tracked quality measurements in Excel and presented inspection findings to supervisors.' if professional else 'Analyzed 2,000 synthetic energy readings in Python, created three charts and presented recommendations to a student team.', reason='Keep the supplied scope and numbers; make the contribution easy to identify.')]
    badge_addition = f'{completed["title"]} - {badge["skills"][0]["name"]}, foundation level. Fictional platform completion record, not an industry certification.'
    return dict(notice=NOTICE, career=dict(search=dict(jobs=jobs, query=direction['title']+' in Malaysia', country='my', fetched_at=STAMP, assessed_at=STAMP, auto_refresh=False, ai_status=NOTICE, model='Authored demo example'), stale=False, direction=direction, direction_stale=False, outlook=deepcopy(outlooks['5']), outlook_stale=False), outlooks=outlooks, improvements=improvements, badge_addition=badge_addition, courses=courses, badges=[badge])
