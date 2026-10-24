# Home page animation QA — 2026-10-24

final result: passed

The target is the motion style in the supplied recording, adapted to FutureProof's existing page. This is not a pixel-for-pixel reproduction of the source agency's branding, typography, copy, imagery or section sizes. No actionable P0/P1/P2 findings remain for that scope.

## Visual evidence

- Source: `C:/Users/oscar/Videos/Screen Recordings/Screen Recording 2026-10-24 010313.mp4`, 1918 × 1078, 30 fps, 30.03 seconds.
- Source truth frames: `C:/Users/oscar/.codex/visualizations/2026/10/22/01a1649b-5c54-7910-a411-61b83fce9d05/home-motion-reference/`, including `frame-00.jpg` (0s), `frame-02.jpg` (4s) and the two dense motion contact sheets.
- Matched wide CSS viewport: 1918 × 1078. The in-app browser captured 1903 × 1070, excluding/rounding viewport edges. Both source and implementation are scaled proportionally to 720px wide in the comparisons, without stretching. No device-pixel-ratio override was applied.
- Full comparisons opened together: `docs/design/home-motion-preview-comparison.jpg` and `docs/design/home-motion-story-comparison.jpg`. They compare the angled dashboard panel and sticky narrative/card progression respectively.
- Focused panel comparison opened together: `docs/design/home-motion-detail-comparison.jpg`. It checks the perspective treatment, card edges, padding, product UI and content legibility; actual source and FutureProof content intentionally differ.
- Wide dark captures: `home-motion-hero-wide.png`, `home-motion-preview-wide.png`, `home-motion-journey-wide.png`, `home-motion-platform-wide.png` under `docs/design/`.
- Additional desktop checks: 1440 × 900 in both themes (`home-motion-preview-light.png`, `home-motion-preview-dark.png`). Captures are 1425 × 891.
- Mobile light checks: 390 × 844 (`home-motion-mobile-light.png`, `home-motion-journey-mobile.png`, `home-motion-faq-mobile.png`). Source recording contains no mobile target; this layout follows the existing product and is an intentional responsive adaptation.

## Required fidelity surfaces

| Surface | Result |
| --- | --- |
| Typography | Existing Geist/Inter fonts, weights and purple headline retained. Hero lines reveal within masks without cropping their final text. Product UI and mobile FAQ remain readable. The source site's font is not copied. |
| Layout | Wide preview tilts and settles into its normal layout. Desktop chapter cards stack beside the sticky introduction; mobile cards return to normal flow. No horizontal overflow at 390, 1440 or 1918 CSS pixels. |
| Colors | Existing light/dark surface, purple, lavender and mint tokens retained. Theme switching works during scroll and restores the original dark preference. |
| Assets | The existing semantic ProductPreview and Lucide icons are reused. No reference-site logos, artwork, placeholders or rasterized page screenshots are used as website assets. |
| Copy | Existing product explanations, actual catalogue counts and fictional-demo disclosures retained. New chapter links lead to existing routes. No source-site funding, customer or award claims are copied. |

## Motion and interaction evidence

- Live preview matrices changed from a pronounced `matrix3d` pose near the hero to almost identity as the panel scrolled into place. This verifies scroll-driven perspective rather than a static rotated mockup.
- Chapter tops showed the expected staggered sticky positions (128, 144, 160, 176px at desktop), with independent entry rotations and scale changes. Keyboard Tab brought the next chapter link into focus, with card z-index 10 and opacity 1.
- Mobile computed preview transform was `none` and chapter position was `relative`; desktop sticky/3D effects are absent there.
- Mobile navigation opens and closes, section links update the correct hash, FAQ expansion works, and the primary demo links load the student demo.
- Return navigation was checked after the section-link correction below. GSAP effects dispose on route changes and reinitialize after returning.
- The browser reported no console errors or warnings during the inspected flow.
- Native scrolling is retained. Reduced-motion early return and static CSS fallbacks were inspected; the operating system's motion preference was not changed during this run.

## Correction history

1. **P2: section hash history could restore the home URL with the demo UI still visible on Back.** Reproduced after navigating through native section anchors. Changed desktop/mobile section navigation and the questions link to Next.js Link. The repeated sequence section link → demo → browser Back then restored the actual landing heading. No auth or workspace routes were modified.
2. Post-fix comparisons preserve the intended motion patterns and the product's existing branding. Full frontend tests passed (72); production build and TypeScript checks succeeded.

## Accepted differences and follow-up

The source recording's exact speeds depend on the recorded scrolling speed. FutureProof uses native scroll with modest smoothing instead of scroll hijacking. Mobile and reduced-motion users receive lighter/static layouts. Fine timing can be adjusted after user review; these are deliberate choices, not unresolved P0/P1/P2 findings.

---

# Previous QA record (retained)

# SDG integration design QA

final result: passed

No actionable P0/P1/P2 findings remain. This is an extension of the existing workspace, with four tabs on the original SDG route.

## Visual evidence and normalization

- Source visual truth: `docs/design/sdg-before.png` — existing SDG page, Data Analyst, student demo, dark theme, 617 × 698 pixels.
- Matched implementation: `docs/design/sdg-after-617.png` — same route, persona, career and dark theme, with the new tab navigation. Browser CSS viewport was set to 617 × 698; the browser screenshot API produced 602 × 682 pixels. Its capture excludes/rounds part of the viewport. The implementation was resized to the source's 617 × 698 pixels for comparison; no numerical pixel-perfect claim is made. No additional device-scale override was used.
- Full-view comparison: `docs/design/sdg-comparison.png` (1258 × 734), both captures together, with labels and a 24-pixel gutter.
- Focused typography comparison: `docs/design/sdg-typography-comparison.png` (1258 × 132), matching heading/intro regions together. This checks the display font, weight, hierarchy and small eyebrow text at readable size.
- Wide dark implementation: `docs/design/sdg-impact-desktop.png` and `docs/design/sdg-reading-preview.png` (1265 × 712 each).
- Final wide light implementation: `docs/design/sdg-final-desktop.png` (1425 × 990 capture from a 1440 × 1000 CSS viewport), Data Analyst student demo, Your impact tab, sidebar rail.
- Mobile: `docs/design/sdg-impact-mobile.png`, `docs/design/sdg-reading-mobile-light.png`, and `docs/design/sdg-cv-preview-mobile.png` (375 × 811 captures from a 390 × 844 CSS viewport).
- Desktop CV dialog: `docs/design/sdg-cv-preview-desktop.png` (1425 × 990, 1440 × 1000 CSS viewport).

The screenshots were opened and inspected, including the combined full-view and focused comparisons. Added navigation intentionally moves the hero down relative to the original single-view screen. New reading/community/progress content has no pre-existing visual mock; its target is the surrounding workspace design system.

## Required fidelity surfaces

| Surface | Result |
| --- | --- |
| Fonts and typography | Existing Inter/Geist font setup and hierarchy retained. Combined heading crops show consistent family, weight and eyebrow styling. Longer goal names and mobile headings wrap within their cards. |
| Spacing and layout rhythm | Shared page width/sidebar/header preserved. Hero radii, card padding and section spacing follow the workspace. Desktop grids become single-column cards; all four mobile tabs stay visible. Added career controls are an intentional functional change. |
| Colors and tokens | Workspace surface, foreground, border, indigo, lavender and mint tokens are reused in both themes. Selected, disabled and error controls retain distinct states. |
| Image quality and assets | Existing brand asset and Lucide icon family retained; the graph uses its existing renderer. No source illustration/photo was replaced or approximated. No new raster art was needed. |
| Copy and content | Reading is labelled as curated official goal context; preview does not claim email delivery. Demo examples are labelled fictional. Project work is self-reported, titles are in-app milestones, and CV edits require explicit confirmation. |

## Comparison and correction history

1. The initial mobile implementation repeated the career in both a context block and the select, consuming excessive space above the hero. **P2, spacing/responsiveness.** At widths below 480px, hide the repeated context block while keeping the labelled select. Revised evidence: `sdg-impact-mobile.png`. Reinspection found the four tabs, select and hero readable with no horizontal page overflow.
2. Closing an asynchronously opened CV preview left keyboard focus on the page body. **P2, interaction/accessibility.** Preserve the opening button before the preview request and explicitly restore focus when the dialog unmounts. The browser's active element was verified as the enabled “Preview CV additions” button after Escape; the component regression also checks restoration. Dialog layout remains as captured in `sdg-cv-preview-mobile.png` and `sdg-cv-preview-desktop.png`.
3. Post-fix full-view and focused comparisons retain the source typography, palette and workspace surfaces. No remaining P0/P1/P2 visual differences were found. The source-to-implementation hero position change is accepted because it accommodates the authorized tabs and career control.

## Interaction and runtime checks

- Opened all four tabs on desktop and mobile; URL tab/career/demo state persists.
- Keyboard arrow navigation updates the selected tab and focus.
- Changed career from Data Analyst to Smart Manufacturing and back; role, goal cards and content update.
- Opened skill filters and goal details, inspected official links and the graph's readable equivalent.
- Selected readings and opened the reading-list preview.
- Selected a fictional project and opened its CV preview; demo fields and confirmation remain disabled.
- Verified native modal focus containment, Escape dismissal, restored trigger focus and scrollable mobile content.
- Mobile document content width was 375 within a 390 CSS-pixel viewport; final desktop content width was 1425 within 1440. No controls are hidden by horizontal page overflow.
- Final browser console warning/error check returned no entries.
- Final frontend verification: **57 tests passed**, TypeScript check passed, production build passed.
- Final backend verification: **31 tests passed**. PostgreSQL revision 002 and RLS/privileges passed temporary-write checks with transaction rollback; no test community/project records were retained.
- Windows API source reload was verified without stopping the website.

## Residual test gaps and follow-up

No dedicated confirmed test-user login was supplied, so personal write flows were covered by component tests and isolated authenticated API tests rather than a live signed-in browser journey. Demo browser testing and actual PostgreSQL policy checks complement those tests. macOS/Linux execution and a full assistive-technology audit were not available.

No P3 polish item blocks this handoff. Moderator tooling, live summaries and actual email delivery are separate product work, documented in `docs/SDG_INTEGRATION.md`.

## Implementation checklist

- [x] Compare source and rendered implementation together, including a focused typography region.
- [x] Correct mobile duplicate context and dialog focus restoration; inspect post-fix states.
- [x] Verify responsive themes, tabs, filters, reading preview and CV preview.
- [x] Run component/API tests, TypeScript checking, production build and database policy verification.
- [x] Save visual evidence and leave the local SDG preview available for review.


## PR #8 local adaptation verification

Latest result: passed. The current-main workspace remains the visual target; this is an extension, not a redesign. The simulator uses the same fonts, indigo/lavender surfaces and button styles, and is collapsed by default. Expanded controls fit the 390px mobile view with stacked buttons. Reading filters stack on mobile and retain current theme tokens. No new imagery or icon family was introduced.

Evidence inspected: `docs/design/pr8-simulator-desktop.png`, `pr8-simulator-mobile.png`, `pr8-reading-mobile-dark.png`, `pr8-cv-preview-mobile.png` and `pr8-fresh-offline-demo.png`. Mobile CSS viewport was 390 x 844, captured as 375 x 811; desktop default CSS viewport was 1280 x 720, captured as 1265 x 712. The browser excludes/rounds part of the viewport. These are functional/responsive captures, not pixel-identical comparisons with the older source images above. The viewport override was reset afterward.

The browser verified simulator apply/reset and focus retention, hypothetical skill labels, reading search/selection/preview, a professional-demo legacy redirect with its career preserved, dark/light layouts, read-only project-to-CV preview, native-dialog dismissal/focus restoration, and the sample CV PDF canvas plus Reviewed/ready state. Page content width remained within the viewport. A clean-install browser tab had no warning/error entries before the intentional API-stop offline test; that intentional test produces the expected failed-network diagnostic and displays a clearly labelled fictional fallback.

A disabled async trigger initially lost keyboard focus while simulating. The trigger now stays focusable with an aria-disabled busy state and a submission guard; browser inspection confirmed focus remains on “Explore these skills” after the update. No actionable visual or interaction issue remained in the inspected states. Latest automated checks passed 35 backend tests, 63 frontend tests, TypeScript and a production build; a clean installation without Supabase credentials was also exercised. Live personal-account browser tests and actual Gemini delivery remain untested without dedicated account/provider configuration.
