"""Grounded extraction and review-only proposals. Never execute CV instructions."""
import re
from typing import Literal

from pydantic import Field

from .ai_provider import generate, scrub, AIUnavailable
from .engine import normalize_skills
from .schemas import StrictModel, CV, CVEntry, CVSection

TextField = Literal["summary", "education", "experience", "projects", "membership_licensure", "certificates_training"]
Interest = Literal["data", "technology", "sustainability", "creative", "people", "practical", "business", "investigation"]


class SectionSelection(StrictModel):
    field: TextField
    line_ids: list[int] = Field(min_length=1, max_length=150)


class SkillQuote(StrictModel):
    # Accept a bounded worker response, then omit sentence-length "skills" below.
    skill: str = Field(min_length=1, max_length=500)
    quote: str = Field(min_length=1, max_length=1000)


class EntrySelection(StrictModel):
    section: Literal['education','experience','projects','membership_licensure','certificates_training']
    title: str = Field(max_length=300)
    organisation: str = Field(default='', max_length=300)
    dates: str = Field(default='', max_length=150)
    line_ids: list[int] = Field(max_length=30)


class AdditionalSelection(StrictModel):
    title: str = Field(min_length=1, max_length=150)
    line_ids: list[int] = Field(min_length=1, max_length=150)


class Extraction(StrictModel):
    sections: list[SectionSelection] = Field(max_length=30)
    skills: list[SkillQuote] = Field(max_length=50)
    entries: list[EntrySelection] = Field(default_factory=list, max_length=40)
    name_quote: str = Field(default='', max_length=100)
    other_sections: list[AdditionalSelection] = Field(default_factory=list, max_length=29)
    skill_line_ids: list[int] = Field(default_factory=list,max_length=100)


class Change(StrictModel):
    field: TextField
    before: str = Field(max_length=10000)
    after: str = Field(min_length=1, max_length=10000)
    reason: str = Field(min_length=1, max_length=500)


class Rewrite(StrictModel):
    changes: list[Change] = Field(min_length=1, max_length=6)


class Personalisation(StrictModel):
    summary: str = Field(min_length=1, max_length=1500)
    interests: list[Interest] = Field(max_length=8)
    work_style: Literal["analytical", "creative", "practical", "people"]
    environment: Literal["structured", "flexible"]
    motivation: Literal["growth", "stability", "impact", "balance"]
    explanation: str = Field(min_length=1, max_length=1000)


class MatchExplanation(StrictModel):
    role_id: str = Field(max_length=100)
    explanation: str = Field(min_length=1, max_length=1500)


class MatchExplanations(StrictModel):
    explanations: list[MatchExplanation] = Field(min_length=1, max_length=5)


def compact(value):
    return " ".join(value.split()).casefold()


async def extract_cv(source, cv, actor):
    clean = scrub(source, cv)
    lines = [line.strip() for line in clean.splitlines() if line.strip()]
    extracted = await generate("cv-extract", "Classify the numbered CV lines into sections. Return line_ids "
                               "(one-based integers), not rewritten text. Select all relevant lines in source order. "
                               "Never invent IDs or guess missing sections. Omit contact lines and section headings. "
                               "Extract ALL document sections, not only the predefined categories. Use other_sections "
                               "for languages, awards, publications, volunteering, interests, references or any other "
                               "section. Copy its heading verbatim as title and supply every body line ID. Do not "
                               "drop a section just because it has no predefined field. "
                               "Return the person's name as name_quote copied exactly, or empty if unavailable. "
                               "Also group individual jobs, qualifications and projects into entries. Copy title, "
                               "organisation and dates exactly from source substrings (empty when absent); use line_ids "
                               "for the corresponding achievement/detail lines. Do not merge different employers. "
                               "Include EVERY explicit skills-list item, including broad labels such as Networking "
                               "or Communication, not only programming tools. Each skill must be copied VERBATIM "
                               "and EVERY source Skills-list line must also appear in skill_line_ids so no listed "
                               "skill is lost. These IDs must refer only to explicit skill-label lines, not sentences "
                               "from experience or qualifications. "
                               "from its exact supporting source quotation: "
                               "do not paraphrase 'Customer Relationship Management' as 'CRM', or infer abilities "
                               "from a job title. Use short skill labels (at most 100 characters), not sentences. "
                               "Omit uncertain skills. Keep unknown skills verbatim; do not "
                               "force unrelated career labels.",
                               {"lines": [{"id": index, "text": line} for index, line in enumerate(lines, 1)]},
                               Extraction, actor=actor, cv=cv)
    sections = {}
    for item in extracted.sections:
        if any(index < 1 or index > len(lines) for index in item.line_ids):
            raise AIUnavailable("AI extraction contained unsupported text; the original extraction is retained.")
        sections.setdefault(item.field, []).extend(item.line_ids)
    skills = []
    if any(index<1 or index>len(lines) for index in extracted.skill_line_ids):
        raise AIUnavailable('AI returned unsupported skill-line references. Please retry.')
    for index in extracted.skill_line_ids:
        for value in re.split(r'[,;|\u2022]',lines[index-1]):
            value=value.strip()
            if value and len(value)<=100:
                skills.append(value)
    for item in extracted.skills:
        if len(item.skill) > 100 or compact(item.quote) not in compact(clean):
            continue
        literal = compact(item.skill) in compact(item.quote)
        supported = bool(set(normalize_skills([item.skill])) & set(normalize_skills([item.quote])))
        if literal or supported:
            skills.append(item.skill)
        # An unsupported paraphrased skill is omitted, never credited. Other
        # source-grounded sections remain useful and need not be discarded.
    updates = {key: "\n".join(lines[index-1] for index in sorted(set(values))) for key, values in sections.items()}
    if skills:
        updates["skills"] = list(dict.fromkeys(skills))
    entries = []
    for item in extracted.entries:
        if any(index < 1 or index > len(lines) for index in item.line_ids):
            raise AIUnavailable('AI returned unsupported entry references. Retry or enter your details manually.')
        if any(value and compact(value) not in compact(clean) for value in (item.title,item.organisation,item.dates)):
            raise AIUnavailable('AI returned an entry without source evidence. Retry or enter your details manually.')
        headings={compact(value) for value in (item.title,item.organisation,item.dates) if value}
        entries.append(CVEntry(section=item.section,title=item.title,organisation=item.organisation,
                               dates=item.dates,bullets=[lines[index-1] for index in dict.fromkeys(item.line_ids)
                                                       if compact(lines[index-1]) not in headings]))
    if extracted.name_quote:
        if compact(extracted.name_quote) not in compact(clean):
            raise AIUnavailable('AI returned a name without source evidence. Please review manually.')
        updates['name'] = extracted.name_quote
    for section in {entry.section for entry in entries}:
        if not updates.get(section):
            updates[section]='\n\n'.join('\n'.join(value for value in [entry.title,entry.organisation,entry.dates,*entry.bullets] if value)
                                       for entry in entries if entry.section==section)
    additional=[]
    covered={index for values in sections.values() for index in values}
    covered.update(extracted.skill_line_ids)
    for item in extracted.other_sections:
        if compact(item.title) not in compact(clean) or any(index<1 or index>len(lines) for index in item.line_ids):
            raise AIUnavailable('An additional CV section did not match its source. Please retry.')
        covered.update(item.line_ids)
        additional.append(CVSection(title=item.title,content='\n'.join(lines[index-1] for index in sorted(set(item.line_ids)))))
    for item in extracted.entries:
        covered.update(item.line_ids)
    headings={compact(value) for value in ('summary','professional summary','profile','education','experience','work experience',
        'employment history','projects','skills','technical skills','certifications','certificates','training',
        'membership','memberships','languages',*[item.title for item in additional])}
    literals=[extracted.name_quote,cv.name,cv.email,cv.phone,*skills,
              *[value for item in extracted.entries for value in (item.title,item.organisation,item.dates) if value]]
    # Keep source lines the model overlooked instead of silently discarding them.
    remainder=[line for index,line in enumerate(lines,1) if index not in covered
        and compact(line).rstrip(':') not in headings and not any(marker in line for marker in ('[email removed]','[phone removed]','[link removed]','[personal detail removed]'))
        and not any(value and compact(line)==compact(value) for value in literals)
        and not any(compact(line) in compact(item.quote) for item in extracted.skills)]
    if remainder:
        content='\n'.join(remainder)
        if len(content)>10000:
            raise AIUnavailable('The remaining CV content is too long to retain safely. Use a shorter document.')
        additional.append(CVSection(title='Other extracted details',content=content))
    updates.update(entries=entries,additional_sections=additional,structure_version=2)
    return CV.model_validate(cv.model_dump() | updates)


async def rewrite_cv(cv, actor, fields):
    content = {field: getattr(cv, field) for field in fields if getattr(cv, field)}
    if not content:
        raise AIUnavailable("Add text to the selected CV sections before improving them.")
    result = await generate("cv-rewrite", "Improve wording ONLY in the supplied sections. Return before "
                            "exactly as supplied. Preserve all facts, dates, employers and qualifications. "
                            "Never add numbers, tools or achievements. A course badge is not an official "
                            "certification. Do not add job titles, proficiency claims or new skill terms. "
                            "Prefer small edits and active verbs over inferred capabilities. Return only sections worth changing.",
                            {"sections": content, "goal":"Clear, specific, honest CV wording; not invented achievements."}, Rewrite, actor=actor, cv=cv)
    seen = set()
    for change in result.changes:
        original = getattr(cv, change.field)
        if change.field not in content or change.field in seen or change.before != scrub(original, cv):
            raise AIUnavailable("The rewrite did not match your original CV. No changes were saved.")
        if set(re.findall(r"\d+(?:\.\d+)?", change.after)) != set(re.findall(r"\d+(?:\.\d+)?", original)):
            raise AIUnavailable("The rewrite changed factual numbers. No changes were saved.")
        evidence='\n'.join([cv.summary,cv.education,cv.experience,cv.projects,cv.certificates_training,*cv.skills])
        if set(normalize_skills([change.after])) - set(normalize_skills([evidence])):
            raise AIUnavailable("The rewrite introduced unsupported skills. No changes were saved.")
        seen.add(change.field)
        if any(marker in change.after for marker in ("[personal detail removed]", "[email removed]", "[phone removed]", "[link removed]")):
            raise AIUnavailable("This section contains personal details. Please edit it manually.")
        change.before = original
    return result.changes


def coverage_notice(cv):
    return {"unmapped_skills": [value for value in cv.skills if not normalize_skills([value])],
            "supported_skill_count": len(normalize_skills(cv.skills)),
            "notice": "Matches use the existing curated career catalogue, not a complete labour market. "
                      "Unmapped skills stay in your CV but do not silently gain matching credit."}
