import base64
from io import BytesIO
from types import SimpleNamespace

import pymupdf as fitz
import pytest
from docx import Document

from app import document_layout as layout
from app.documents import parse_document


def cv_pdf(rotated=False):
    with fitz.open() as doc:
        page = doc.new_page()
        page.insert_text((50, 55), "CURRICULUM VITAE\nAisha Rahman\naisha@example.invalid\nEducation\nComputer Science")
        if rotated:
            page.set_rotation(90)
        page = doc.new_page()
        page.insert_text((50, 55), "Skills\nPython, SQL, Communication\nProjects\nBuilt a renewable energy dashboard")
        return doc.tobytes()


@pytest.mark.parametrize("rotated", [False, True])
def test_real_pdf_fields_have_normalized_source_positions_across_pages(rotated):
    result = parse_document(cv_pdf(rotated), "cv.pdf", "application/pdf")
    fields = {field["key"]: field for field in result["document"]["fields"]}
    assert result["cv"]["name"] == "Aisha Rahman"
    assert fields["name"]["sources"][0]["page"] == 0
    assert fields["skills"]["sources"][0]["page"] == 1
    assert fields["email"]["value"] == "aisha@example.invalid"
    assert fields["email"]["confidence"] is None  # Native text is not fabricated OCR confidence.
    assert len(result["document"]["pages"]) == 2
    for field in fields.values():
        for source in field["sources"]:
            x0, y0, x1, y1 = source["box"]
            assert 0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1


def test_word_without_office_keeps_content_and_labels_reformatted_preview(monkeypatch):
    monkeypatch.setattr(layout, "executable", lambda _: None)
    word = Document()
    for text in ["Daniel Example", "Experience", "Quality control and troubleshooting", "Skills", "Python"]:
        word.add_paragraph(text)
    content = BytesIO()
    word.save(content)
    result = parse_document(content.getvalue(), "cv.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    assert result["cv"]["name"] == "Daniel Example"
    assert "Quality control" not in result["cv"]["skills"]
    assert result["cv"]["experience"].startswith("Quality control")
    assert result["document"]["reformatted"]
    assert base64.b64decode(result["document"]["pdf_base64"]).startswith(b"%PDF-")


def test_ocr_returns_measured_confidence_and_flags_unclear_text(monkeypatch):
    monkeypatch.setattr(layout, "executable", lambda _: "test-tesseract")
    tsv = ("level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n"
           "5\t1\t1\t1\t1\t1\t30\t30\t120\t20\t62\tAisha\n"
           "5\t1\t1\t1\t1\t2\t160\t30\t120\t20\t68\tRahman\n"
           "5\t1\t1\t1\t2\t1\t30\t80\t250\t20\t96\taisha@example.invalid\n"
           "5\t1\t1\t1\t3\t1\t30\t120\t100\t20\t98\tPython\n")
    monkeypatch.setattr(layout.subprocess, "run", lambda *a, **kw: SimpleNamespace(returncode=0, stdout=tsv.encode()))
    with fitz.open() as doc:
        doc.new_page(width=300, height=400)
        result = parse_document(doc.tobytes(), "scan.pdf", "application/pdf")
    name = next(f for f in result["document"]["fields"] if f["key"] == "name")
    assert result["document"]["used_ocr"]
    assert name["confidence"] == 65 and name["needs_review"]
    assert "scan is unclear" in name["reason"]


def test_image_signature_is_checked_before_ocr():
    with pytest.raises(ValueError, match="valid JPG or PNG"):
        parse_document(b"not an image", "cv.png", "image/png")


@pytest.mark.parametrize("suffix,mime", [("png", "image/png"), ("jpg", "image/jpeg")])
def test_real_image_conversion_returns_preview_and_fields(monkeypatch, suffix, mime):
    monkeypatch.setattr(layout, "ocr_lines", lambda page, index: [
        {"page": index, "box": [.1, .1, .5, .2], "text": "Aisha Rahman", "confidence": 95},
        {"page": index, "box": [.1, .3, .5, .4], "text": "Python", "confidence": 98},
    ])
    with fitz.open() as doc:
        image = doc.new_page(width=300, height=400).get_pixmap().tobytes(suffix)
    result = parse_document(image, f"cv.{suffix}", mime)
    assert result["cv"]["name"] == "Aisha Rahman"
    assert result["document"]["used_ocr"]
    assert base64.b64decode(result["document"]["pdf_base64"]).startswith(b"%PDF-")


def test_summary_heading_excludes_contact_header_from_summary():
    with fitz.open() as doc:
        page = doc.new_page()
        page.insert_text((50, 55), "Aisha Rahman\nCOMPUTER SCIENCE GRADUATE\naisha@example.invalid\nSummary\nEnjoys analyzing data.\nSkills\nPython")
        result = parse_document(doc.tobytes(), "cv.pdf", "application/pdf")
    assert result["cv"]["summary"] == "Enjoys analyzing data."
    assert result["cv"]["email"] == "aisha@example.invalid"


def test_missing_and_normalized_fields_require_review_without_fake_percentages():
    cv = {"name": "Aisha Rahman", "email": "", "skills": ["Data analysis"]}
    fields = {f["key"]: f for f in layout.evidence(cv, [
        {"page": 0, "box": [.1, .1, .5, .2], "text": "Aisha Rahman", "confidence": None},
        {"page": 0, "box": [.1, .3, .8, .4], "text": "Data analytics", "confidence": None},
    ])}
    assert fields["email"]["needs_review"] and fields["skills"]["needs_review"]
    assert fields["skills"]["confidence"] is None


def test_no_text_without_ocr_has_actionable_error(monkeypatch):
    monkeypatch.setattr(layout, "executable", lambda _: None)
    with fitz.open() as doc:
        doc.new_page()
        with pytest.raises(ValueError, match="Install Tesseract"):
            parse_document(doc.tobytes(), "scan.pdf", "application/pdf")



def test_parser_preserves_repeated_sections_and_limits_skills_to_skill_section():
    with fitz.open() as doc:
        page = doc.new_page()
        page.insert_text((50, 55), """Aisha Rahman
aisha@example.invalid
Professional Summary
Data analyst with Python experience.
Education & Qualifications
BSc Computer Science, 2022
MSc Data Science, 2024
Work History
Analyst, Acme Ltd, 2022-2024
Used SQL and Python to prepare reports.
Internships
Research Intern, Uni Lab, 2021
Selected Projects
Energy dashboard using Python and SQL
Carbon tracker in Excel
Achievements
Team award for the energy dashboard
Core Competencies
Python, SQL, Excel, Communication, Power BI
Certifications
AWS Cloud Practitioner""")
        result = parse_document(doc.tobytes(), "cv.pdf", "application/pdf")

    cv = result["cv"]
    assert cv["name"] == "Aisha Rahman"
    assert cv["summary"] == "Data analyst with Python experience."
    assert cv["education"] == "BSc Computer Science, 2022\nMSc Data Science, 2024"
    assert cv["experience"] == "Analyst, Acme Ltd, 2022-2024\nUsed SQL and Python to prepare reports.\nResearch Intern, Uni Lab, 2021"
    assert cv["projects"] == "Energy dashboard using Python and SQL\nCarbon tracker in Excel\nTeam award for the energy dashboard"
    assert cv["skills"] == ["Communication", "Excel", "Python", "SQL", "Power BI"]
    assert "Cloud fundamentals" not in cv["skills"]



def test_parser_keeps_summary_blank_and_classifies_phone_extracurricular_and_licensure():
    with fitz.open() as doc:
        page = doc.new_page()
        page.insert_text((50, 55), """Aisha Rahman
Phone: +60 12-345 6789
Data Science graduate
Education
BSc Data Science
Experience
Research assistant, University Lab
Projects
Campus data dashboard
Extracurricular Activities
Led the coding club
Achievements
Dean's list
Membership and Licensure
Registered Engineer, Board of Engineers Malaysia
Certifications
AWS Cloud Practitioner
Hobbies
Photography""")
        result = parse_document(doc.tobytes(), "cv.pdf", "application/pdf")

    cv = result["cv"]
    assert cv["summary"] == ""
    assert cv["phone"] == "+60 12-345 6789"
    assert cv["experience"] == "Research assistant, University Lab\nLed the coding club"
    assert cv["projects"] == "Campus data dashboard\nDean's list"
    assert cv["membership_licensure"] == "Registered Engineer, Board of Engineers Malaysia"
    assert "AWS Cloud Practitioner" not in cv["membership_licensure"]
    assert "Photography" not in cv["experience"]
    fields = {field["key"]: field for field in result["document"]["fields"]}
    assert fields["phone"]["sources"]
    assert fields["membership_licensure"]["sources"]


def test_varied_resume_headings_capture_summary_projects_awards_and_membership():
    with fitz.open() as doc:
        page = doc.new_page()
        page.insert_text((50, 55), """Mina Lee
Profile Summary
Mechanical engineering graduate with hands-on robotics experience.
Education
BEng Mechanical Engineering, 2024
Experience & Projects
Robotics Intern, Acme
Built a warehouse robot prototype.
Projects & Extracurricular
Led the university robotics club.
Awards & Scholarships
First place, university design challenge.
Memberships & Certifications
Student Member, Institution of Mechanical Engineers.
Registered Engineering Technician.
Certifications
First Aid Certificate
Interests
Hiking and photography""")
        result = parse_document(doc.tobytes(), "cv.pdf", "application/pdf")

    cv = result["cv"]
    assert cv["summary"] == "Mechanical engineering graduate with hands-on robotics experience."
    assert "Robotics Intern, Acme" in cv["experience"]
    assert "Built a warehouse robot prototype." in cv["experience"]
    assert "Led the university robotics club." in cv["experience"]
    assert cv["projects"] == "First place, university design challenge."
    assert "Student Member" in cv["membership_licensure"]
    assert "Registered Engineering Technician" in cv["membership_licensure"]
    assert "First Aid Certificate" not in cv["membership_licensure"]
    assert "First Aid Certificate" in cv["certificates_training"]
    assert "Hiking" not in cv["experience"]


def test_wrapped_headings_awards_and_explicit_skills_stay_in_their_sections():
    with fitz.open() as doc:
        page = doc.new_page()
        page.insert_text((50, 55), """Nora Tan
CAREER OBJECTIVE
Engineering student interested in embedded systems.
EDUCATION
BEng Electrical Engineering, 2025
Dean's List Award
2024
WORKING
EXPERIENCE
Hardware Intern
Tested circuits and documented results.
EXTRA-
CURRICULAR
ACHIEVEMENTS
President, Robotics Club
Silver Award (2025)
SKILLS AND LANGUAGES
Technical Skills
Proficient in C and Python
Excel | SQL | MATLAB
Language Skills
English: Fluent
PROJECT EXPERIENCE
Built an autonomous robot with a Raspberry Pi.
REFERENCES
Available on request.""")
        result = parse_document(doc.tobytes(), "cv.pdf", "application/pdf")

    cv = result["cv"]
    assert cv["summary"] == "Engineering student interested in embedded systems."
    assert "BEng Electrical Engineering" in cv["education"]
    assert "Dean's List Award" not in cv["education"]
    assert "Dean's List Award" in cv["projects"]
    assert "President, Robotics Club" in cv["experience"]
    assert "Hardware Intern" in cv["experience"]
    assert "Built an autonomous robot" in cv["projects"]
    assert "Silver Award" in cv["projects"]
    assert set(cv["skills"]) >= {"C", "Python", "Excel", "SQL", "MATLAB", "English (Fluent)"}
    assert "Tested circuits" not in cv["skills"]
    assert "Available on request" not in cv["experience"]


def test_spatially_aligned_wrapped_heading_precedes_right_column_content():
    with fitz.open() as doc:
        page = doc.new_page(width=600, height=800)
        # The first experience entry is slightly above its two-line left-rail heading,
        # as happens in some designed CV layouts.
        page.insert_text((35, 50), "Aisha Rahman")
        page.insert_text((180, 100), "Technician Intern")
        page.insert_text((180, 118), "Maintained test equipment.")
        page.insert_text((35, 101), "WORKING")
        page.insert_text((35, 113), "EXPERIENCE")
        page.insert_text((35, 170), "EDUCATION")
        page.insert_text((180, 170), "BEng Electrical Engineering")
        result = parse_document(doc.tobytes(), "cv.pdf", "application/pdf")

    assert result["cv"]["experience"] == "Technician Intern\nMaintained test equipment."
    assert result["cv"]["education"] == "BEng Electrical Engineering"


def test_parser_extracts_certificates_and_training_separately_from_memberships():
    with fitz.open() as doc:
        page = doc.new_page()
        page.insert_text((50, 55), """Aisha Rahman
Memberships and Certifications
Student Member, Engineering Society
Registered Engineer, Board of Engineers
AWS Cloud Practitioner Certificate
First Aid Training, 2024
Unrelated campus details
Interests
Hiking""")
        result = parse_document(doc.tobytes(), "cv.pdf", "application/pdf")

    cv = result["cv"]
    assert cv["membership_licensure"] == "Student Member, Engineering Society\nRegistered Engineer, Board of Engineers"
    assert cv["certificates_training"] == "AWS Cloud Practitioner Certificate\nFirst Aid Training, 2024"
    fields = {field["key"]: field for field in result["document"]["fields"]}
    assert fields["certificates_training"]["sources"]
    assert "certificates_training" in fields
    assert "Hiking" not in cv["certificates_training"]
    assert "Unrelated campus details" not in cv["certificates_training"]


def test_cv_schema_defaults_certificates_for_older_saved_payloads():
    from app.schemas import CV

    cv = CV.model_validate({"name": "Aisha Rahman", "skills": ["Python"]})
    assert cv.certificates_training == ""


def test_skills_without_heading_require_confirmation_and_empty_section_does_not_infer():
    def parse(text):
        with fitz.open() as doc:
            doc.new_page().insert_text((50, 55), text)
            return parse_document(doc.tobytes(), "cv.pdf", "application/pdf")
    result = parse("Aisha Rahman\nProjects\nBuilt reports with Python and SQL.\nCertifications\nAWS Cloud Practitioner")
    assert result["cv"]["skills"] == ["Python", "SQL"]
    skill = next(field for field in result["document"]["fields"] if field["key"] == "skills")
    assert skill["needs_review"] and "outside a Skills section" in skill["reason"]
    assert skill["sources"]
    explicit = parse("Aisha Rahman\nProjects\nBuilt reports with Python.\nSkills\nEducation\nComputer Science")
    assert explicit["cv"]["skills"] == []
    for key in ("phone", "membership_licensure", "certificates_training"):
        field = next(field for field in explicit["document"]["fields"] if field["key"] == key)
        assert not field["needs_review"] and not field["sources"]


@pytest.mark.parametrize("credential", ["First Aid Certificate", "AWS Cloud Practitioner Certificate", "First Aid Training, 2024"])
def test_standalone_certificate_names_are_content_not_headings(credential):
    with fitz.open() as doc:
        doc.new_page().insert_text((50, 55), f"Aisha Rahman\nCertifications\n{credential}\nInterests\nHiking")
        result = parse_document(doc.tobytes(), "cv.pdf", "application/pdf")
    assert result["cv"]["certificates_training"] == credential


def test_uppercase_skills_and_credentials_are_not_consumed_as_wrapped_headings():
    with fitz.open() as doc:
        doc.new_page().insert_text((50, 55), "Aisha Rahman\nSKILLS\nPYTHON\nSQL\nCERTIFICATIONS\nFIRST AID CERTIFICATE")
        result = parse_document(doc.tobytes(), "cv.pdf", "application/pdf")
    assert result["cv"]["skills"] == ["Python", "SQL"]
    assert result["cv"]["certificates_training"] == "FIRST AID CERTIFICATE"


def test_sample_document_footer_is_not_an_extracted_skill():
    with fitz.open() as doc:
        doc.new_page().insert_text((50, 55), "Aisha Rahman\nSkills\nPython, MATLAB\nFICTIONAL SAMPLE CV\nFor exploring the reader. No real personal information.")
        result = parse_document(doc.tobytes(), "cv.pdf", "application/pdf")
    assert result["cv"]["skills"] == ["Python", "MATLAB"]
