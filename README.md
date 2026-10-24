## Team Information

| Field             | Details                                          |
| ----------------- | ------------------------------------------------ |
| Team Name         | XMMUM                                            |
| Team Domain       | Domain 1                                         |
| SDG Track (1–17)  | SDG 4 –QUALITY EDUCATION, SDG 8- DECENT WORK AND ECONOMIC GROWTH|
| Team Leader       | TAN ZHI KAI                                      |
| University        | Xiamen University Malaysia, Multimedia University                       |
| Number of Members | 5                                                |

## Links

| Resource          | Link                                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------------------------|
| GitHub Repository | [https://github.com/Xuan7086/XMMUM]|
| Replit Project    | [https://replit.com/@your-username/your-project]|
| Live Demo         | [https://your-project.replit.app]|
| RunPod Endpoint   | [https://api.runpod.ai/v2/your-endpoint-id]|
| Slide Deck        | [https://example.com/slides]|
| Demo Video        | [https://youtu.be/CG04NzT_HyY]|

A career-planning prototype for Malaysian students and graduates, built with Next.js, FastAPI and Supabase. Upload and review a CV, explore explainable career matches, compare learning pathways and see potential SDG connections.

## Start after cloning

Install **Node.js 22.13 or later** (tested with 24), **npm**, **Python 3.12 or later** (tested with 3.12), and Git. Open a terminal in the repository root: the folder containing this README and `package.json`.

```sh
npm run setup
npm run doctor
npm run dev
```
```text
Project Structure XMUMM/
├── frontend/                  # Website
│   ├── src/
│   │   ├── app/              # Pages and routing
│   │   └── components/       # Screens and UI components
│   ├── lib/                  # API clients and shared logic
│   ├── public/               # Public assets and samples
│   ├── tests/                # Unit/component tests
│   ├── e2e/                  # Browser tests
│   ├── scripts/
│   ├── package.json
│   ├── next.config.ts
│   └── .env.example
│
├── backend/                   # Python API
│   ├── app/                  # Application logic
│   ├── migrations/           # Database migrations
│   ├── tests/                # API/unit tests
│   ├── scripts/
│   ├── requirements.txt
│   ├── requirements.lock
│   ├── pyproject.toml
│   ├── alembic.ini
│   ├── check_*.py
│   └── verify_*.py
│
├── scripts/                   # Project management commands
│   ├── setup.mjs
│   ├── dev.mjs
│   ├── api.mjs
│   ├── doctor.mjs
│   └── runtime.mjs
│
├── shared/
│   └── countries.json
│
├── README.md
├── package.json
├── design-qa.md
├── .env.example
└── .gitignore
```

These commands work in Windows PowerShell and macOS/Linux terminals. Setup installs the locked frontend and Python dependencies, creates `backend/.venv`, prepares the PDF preview assets and copies the two example environment files **only if they do not exist**. No virtual-environment activation or root `npm install` is needed. The first setup needs internet access.

Open one of these URLs after both services start:

| URL | Purpose |
| --- | --- |
| [Student demo](http://127.0.0.1:3000/demo/student) | Fictional, read-only workspace; no Supabase account or AI key needed |
| [Professional demo](http://127.0.0.1:3000/demo/professional) | Second fictional profile |
| [Website](http://127.0.0.1:3000) | Login, then main page and personal workspace |
| [API docs](http://127.0.0.1:8000/docs) | Interactive backend API reference |
| [API health](http://127.0.0.1:8000/api/v1/healthz) | API process/configuration status; does not test the database connection |

Keep the terminal open. **Ctrl+C stops both services.** The root launcher watches Python files on Windows without sharing Uvicorn reload signals with Next.js; on macOS/Linux it uses Uvicorn reload. `npm run dev:api` alone requires a manual API restart after Python edits on Windows. The launcher checks dependencies, reserves ports 3000/8000, waits for the API health check, and stops the other service if one exits. Webpack is selected explicitly.

## Enable personal accounts and saved CVs

The fictional demos work without credentials. They are a backup presentation mode: CV scores, improvement examples, vacancy matches, 5/10/15-year outlooks, courses and badge evidence are bundled locally. PDFs are served by the frontend, and quizzes run in browser memory. RunPod, the job provider and FastAPI may all be unavailable; the frontend must still be running. Example scores remain fixed, and no demo result is saved to a personal account. Uploading your own CV, saving a profile and tracking real learning require configured services.

1. Edit the root **`.env`**, created by setup:

   ```dotenv
   SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   SUPABASE_PUBLISHABLE_KEY=YOUR-PUBLIC-PUBLISHABLE-OR-ANON-KEY
   DATABASE_URL=postgresql://postgres.YOUR-PROJECT:YOUR-ENCODED-PASSWORD@YOUR-SESSION-POOLER-HOST:5432/postgres
   AI_ENABLED=false
   DEMO_MODE=true
   ```

   Copy the actual database URL from **Supabase → Connect → Session pooler**. Replace the complete password placeholder, including brackets, and URL-encode special characters. Use the database password, which is different from the public API key. Session pooler port **5432** works with IPv4; transaction pooler port **6543** is also supported. Remove URL query options such as `sslmode=require`; the backend already requires TLS.

2. In **`frontend/.env.local`**, leave `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` blank to reuse the two public settings from the root `.env`. Set them explicitly only if needed, and keep them on the same project as the backend. Keep:

   ```dotenv
   NEXT_PUBLIC_API_URL=http://127.0.0.1:8000/api/v1
   ```

   Database passwords and AI keys belong only in root `.env`. Never use a Supabase service-role/secret key as a `NEXT_PUBLIC_` setting. Local `.env` files are ignored by Git and do not arrive with a clone or pull.

3. For a **new database**, apply the migration once to the project you intend to use:

   Windows PowerShell:

   ```powershell
   backend/.venv/Scripts/python.exe -m alembic -c backend/alembic.ini -x use_runtime=true upgrade head
   ```

   macOS/Linux:

   ```sh
   backend/.venv/bin/python -m alembic -c backend/alembic.ini -x use_runtime=true upgrade head
   ```

   This applies revisions 001–003: eight core tables, six SDG/community tables and three hosted-learning tables with their access policies. `use_runtime=true` uses `DATABASE_URL` through session pooler port 5432; omit it to use `MIGRATION_DATABASE_URL`, if configured. The configured team database was verified at revision 003 on 24 October 2026.

4. In Supabase Auth, enable **email/password**. Allow these redirect URLs: `http://127.0.0.1:3000/auth/login` and `http://localhost:3000/auth/login`. Register a user and confirm their email if confirmation is enabled.

5. Restart `npm run dev`, then sign in. Login opens the main page. **Open my workspace** starts required setup: upload and confirm your CV first, then complete every **Discover Yourself** field. The dashboard and other workspace pages unlock only after both steps. Unfinished setup resumes after reloading or signing in again; public demos remain available.

   After setup, a short introduction explains Career matches, Learning pathway,
   SDG impact, Community and News, with a button to enter each function. Choosing
   a function or continuing to Overview saves completion to your account, so the
   introduction does not repeat on later visits. Existing completed accounts keep
   their normal navigation.

   Completed users open personal information through the **top-right profile
   icon**. The sidebar then contains **My Profile**, **Your CV** and **Discover
   Yourself**, with **Back to main navigation** returning to Overview and Explore.
   Direct links and refreshes restore the appropriate sidebar. My Profile shows
   saved CV information and survey answers, with links to review or update each.
   Name and education stay synchronized between Profile and CV; category,
   location and career goal stay synchronized with Discover Yourself. This uses
   existing Supabase JSON records and requires no database migration.

`npm run doctor` reports local configuration without printing secrets. To test the actual Supabase connection and table presence, run `backend/.venv/Scripts/python.exe backend/check_supabase.py` on Windows or `backend/.venv/bin/python backend/check_supabase.py` on macOS/Linux. This check is read-only. The separate `backend/verify_database.py` verifies core ownership policies; `backend/verify_sdg.py` verifies the SDG/community policies. Both use temporary writes inside transactions that they roll back.

## CV reader

| File | Requirements and limits |
| --- | --- |
| Text PDF | Works immediately; up to 50 pages |
| DOCX | Works immediately; includes paragraphs and tables; built-in preview may reformat the document |
| Scanned PDF, JPG, PNG | Requires **Tesseract OCR** and its English language data; up to 10 scanned pages; images at most 24 megapixels |
| All uploads | Non-empty, at most 10 MB; encrypted PDFs and macro-enabled Word files are rejected |

Signed-in CV extraction and assessment require configured AI. Uploading a CV starts extraction; Save & analyse or Analyse saved CV starts assessment. Provider notices remain, without repeated AI-consent checkboxes. Local PDF/DOCX reading or OCR supplies text to AI; the old section classifier and scoring formula are not silent fallbacks. Files are processed temporarily; extracted fields are saved as an unconfirmed review draft and confirmed when you save. Manual entry remains available without AI; read-only demos offer a fictional CV.

Save & analyse stays on Your CV: progress is followed by a circular overall score and category bars. Use Continue to Discover yourself below the scores when ready. Partner Studio is hidden for now; its authoring code remains available for a future admin workspace.

The reader supports structured jobs, education and projects alongside phone numbers, memberships/licensure and certificates/training. Open **More CV details** to review entries. Flat sections remain compatible with older CVs and SDG imports. The target role supplies assessment context, not automatically granted skills.

AI extraction requires source evidence but can still miss information. Skills can be edited manually; credentials remain self-reported. Actual earned badges add course-skill evidence. Real-job matching combines CV, questionnaire and badges against JSearch vacancies. Detected contacts are scrubbed before AI calls, but other personal details may remain: this is not complete anonymisation. Existing JSON storage is used without a new migration.

For scans/images, install Tesseract separately and make `tesseract --version` work in your terminal. The backend also checks `C:/Program Files/Tesseract-OCR/tesseract.exe` on Windows. If it is installed elsewhere, set this in root `.env` and restart the API:

```dotenv
TESSERACT_CMD=C:/path/to/tesseract.exe
```

Optional: install LibreOffice to retain more of a DOCX's original page layout. Otherwise, the built-in reformatted preview works without Office. Override detection with `LIBREOFFICE_CMD=C:/path/to/soffice.exe` if necessary. OCR recognition and document formatting can vary; always review the extracted fields.

## After pulling updates

For RunPod extraction, AI-assigned CV assessment, improvement/PDF previews, badge additions, real JSearch vacancies and source-limited future roles, see [AI integration](docs/AI_INTEGRATION.md). Rubric weights remain, but AI now assigns category scores. No extra database migration is required.

Stop the running services, pull the changes, then run:

```sh
npm run setup
npm run doctor
npm run dev
```

Setup refreshes dependencies from the lockfiles and preserves existing environment files. Check `.env.example` for any newly added settings. Apply any new documented database migrations before using features that need them.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Missing `next`, `uvicorn` or another module | Run `npm run setup` from the repository root. Use `backend/.venv`, not a different global Python. |
| Python virtual-environment creation fails | Confirm Python 3.12+ is on PATH and the terminal can write to the repository and the OS temporary directory. On Linux, install your distribution's Python venv support if missing. |
| PowerShell blocks `npm.ps1` | Use `npm.cmd run setup` / `npm.cmd run dev`. No execution-policy change is needed. |
| Setup reports `EPERM` / `unlink` for `next-swc.win32-x64-msvc.node`, or native dependencies are in use | Stop this project's running dev/build/test commands with Ctrl+C, then rerun `npm run setup` and `npm run doctor`. Windows cannot delete a loaded native module. A failed `npm ci` can leave dependencies partly removed, so a subsequent “dependencies are missing” message is expected until setup completes. Setup now checks for loaded project native modules before installing. |
| Port 3000 or 8000 already in use | Stop the other server or a previous development terminal. The launcher uses fixed ports so API URLs and CORS stay consistent. |
| Website loads but API requests fail | Open the API health URL and inspect the development terminal. The API must run alongside Next.js; `npm run dev:web` alone starts only the website. |
| “Supabase setup is pending” or login fails | Set the root public URL/key, check frontend overrides, restart Next.js, and confirm the user's email. |
| “Database is not configured” or workspace cannot load | Fill `DATABASE_URL`, run the connectivity check, and confirm migrations were applied to the same Supabase project. |
| “Session invalid or expired” | Frontend and backend must use the same Supabase project. Sign out/in after fixing settings. |
| Scan/image cannot be read | Check `npm run doctor`, Tesseract installation and English data, or upload a text PDF/DOCX and use manual entry. |
| Blank or failed PDF preview | Run setup to regenerate the matching PDF.js worker/fonts. Reload the browser. Extracted fields remain reviewable if rendering fails. |
| New environment values have no effect | Restart both services. Rebuild production output after changing public frontend values. |

## Verification

```sh
npm run test:api
npm test
npm --prefix frontend run typecheck
npm run build
```

The API tests use an isolated in-memory database, covering uploads, analysis and user isolation. They do not write to your Supabase project.

With `npm run dev` running and Google Chrome installed:

```sh
npm --prefix frontend run test:e2e -- e2e/startup.spec.ts
npm run test:e2e
```

The startup smoke tests need no account. Some older browser journeys require `E2E_EMAIL` and `E2E_PASSWORD` in the terminal environment and are skipped when those are absent. Use a dedicated confirmed test account for account-specific tests.

## Hosted learning and Partner studio

Learning pathway now uses the integrated course platform. The catalogue starts
empty; add courses manually through **Learning pathway → Partner studio**.
Authors can create chapters and subsections, upload PDF/video lessons, build
four types of questions, publish, take courses offline to edit, and delete.
Learners study chapters in any order, pass chapter quizzes to unlock the final,
and earn an automatic digital badge on **My profile** after passing the final.

Revision **003** adds the three learning tables after main's SDG migration 002.
See [Learning integration](docs/LEARNING_INTEGRATION.md) for storage, progress,
badge behavior and database verification. Uploaded learning files live in
ignored `backend/.learning-media/`; keep this folder with database backups.

## Optional AI and SDG update

Configure `AI_ENABLED=true`, `AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY` and the provider base URL in root `.env`. Native RunPod and OpenAI-compatible endpoints are supported. Add server-only `JSEARCH_API_KEY` for real vacancies. Consent is required; failure preserves manual editing and saved data, not a fabricated vacancy list or heuristic replacement score. See the integration guide for quotas and outlook limitations.

The **SDG impact** page includes three tabs: **Your impact**, **Reading** and **My progress**. **Community** and **News** have their own workspace pages and sidebar links. They use the existing workspace design in light and dark themes.

- Explore curated skill/goal connections, source links and the existing interactive graph.
- Filter official reading across all 17 goals, select topics and preview a reading list. No email is sent or scheduled. The separate News page shows recent Google News headlines matched to your career and SDGs, with filters and unavailable-source handling.
- Signed-in users can share reflections, reply, appreciate posts, remove their own posts and report content for project-owner review. Public demos show fictional, read-only examples.
- Log personal projects, see XP split across relevant goals, earn in-app progress titles and select project entries for an editable CV preview. Project assessment uses Gemini when configured, with a keyword fallback; projects earn 100–200 XP with AI assessment or 150 XP with the fallback. Saving a CV requires explicit confirmation and rejects a preview if the CV changed in another tab. Only selected self-reported project skills/text are proposed; role skills are never added automatically.

**After pulling this update, run migration 002** using the Alembic command above, then restart the services. Missing migrations affect the new personal community/progress features. Demo pages remain database-independent. The configured team database was migrated during integration; other Supabase projects must apply the migration themselves.

See [SDG integration guide](docs/SDG_INTEGRATION.md) for the API, migration, moderation and verification details. Gemini is disabled by default. Set `SDG_AI_ENABLED=true`, `GEMINI_API_KEY` and `GEMINI_MODEL` in root `.env` to configure it. The Request AI wording action sends the selected career and skills to Gemini without a separate checkbox. When enabled, project assessment sends the logged project's title, description and skill to Gemini when you save a project; it does not send the CV document or separate contact fields. Real email delivery and external credential verification are not enabled.

## Project notes

Career mappings, market outlook and scenarios are curated prototype estimates. They do not establish hiring demand, certification or verified real-world impact. This is a local prototype; public deployment, rate limits, upload process isolation and production hardening need further work.

- [Repair findings and validation](docs/PROJECT_REPAIR_REPORT.md)
- [SDG service review](docs/SDG_SERVICE_REVIEW.md)
- [Architecture](docs/ARCHITECTURE.md)
- [API](docs/API.md)
- [Database and RLS](docs/DATABASE.md)
- [AI methods](docs/AI_METHODS.md)
- [Sources and limitations](docs/DATA_SOURCES.md)
- [Security](docs/SECURITY.md)
- [Demo guide](docs/DEMO_GUIDE.md)

## Local PR #8 integration

PR #8 was adapted onto Xuan7086/XMMUM `main` at `ce8c672`; its head was `485eca2`. The integration preserves the root `backend/`, startup/CV repairs, authenticated community storage, account isolation and explicit CV confirmation.

- **What-if skills:** expand “Explore a different skill set” on Your impact. Hypothetical skills change only that view. Reset with “Use my CV skills”; changing career/account also resets the simulation.
- **Reading:** search topics/skills, filter by goal, and preview selected readings. “Draft in your email app” opens a draft for you to review and send; it is not a delivery service or subscription.
- **Offline demos:** explicit public student/professional demo reads always use bundled, labelled fictional snapshots. They do not wait for authentication or make API requests. Personal workspaces, uploads, saves and service errors never become fictional successes; failure screens offer links to the separate demo instead. Demo fixtures are authored in `backend/app/demo_outcomes.py` and exported to `frontend/src/lib/data/offline-demos.json`.
- **Compatible links:** `/app/news` and `/app/community` open their dedicated pages. `/app/forum` redirects to Community and `/app/tracker` to My progress, preserving demo/role parameters. Old `?tab=community` links also open Community.

No new database migration is needed beyond revision 002. No new dependency is required. Existing `.env` files are preserved; new optional settings appear in `.env.example` and take effect after restarting the API.

Regenerate offline snapshots after changing the demo engine/catalog:

```powershell
backend/.venv/Scripts/python.exe backend/scripts/export_offline_demos.py
backend/.venv/Scripts/python.exe backend/scripts/export_offline_demos.py --check
backend/.venv/Scripts/python.exe backend/scripts/export_demo_pdfs.py
```

See [PR #8 integration and verification](docs/PR8_INTEGRATION.md) for implementation decisions and test coverage.
