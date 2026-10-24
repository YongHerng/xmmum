"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ThemeToggle } from "../theme-toggle";
import { supabase } from "@/lib/api";
import { useLandingMotion } from "./use-landing-motion";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  Compass,
  FileText,
  GraduationCap,
  Leaf,
  LogOut,
  Menu,
  Network,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import { Brand } from "../brand";
import { Button } from "../ui/button";
import { ProductPreview } from "../product-preview";
import { ScrollReveal as Reveal } from "../scroll-reveal";
import { demoPreview } from "@/lib/demo-preview";
import styles from "./landing.module.css";

const mainSections = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#platform", label: "The platform" },
  { href: "#demo-stories", label: "Explore demos" },
];

function Navigation() {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const client = useQueryClient();
  const [logoutError, setLogoutError] = useState("");
  async function logout() {
    setLogoutError("");
    try {
      const result = await supabase?.auth.signOut({ scope: "local" });
      if (result?.error) throw result.error;
      client.clear();
      router.replace("/auth/login");
    } catch {
      setLogoutError("Could not log out. Please try again.");
    }
  }
  const [open, setOpen] = useState(false);
  const close = () => dialog.current?.close();
  return (
    <>
      <div className={styles.navShell}>
        <nav className={styles.nav} aria-label="Main navigation">
          <Brand />
          <div className={styles.navLinks}>
            {mainSections.map(({ href, label }) => (
              <Link key={href} href={href} className={styles.navLink}>
                <span>{label}</span>
                <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            ))}
          </div>
          <div className={styles.navActions}>
            <ThemeToggle />
            <Button asChild size="sm" className={styles.workspaceLink}>
              <Link href="/app/dashboard">
                <span>Open workspace</span>
                <span className={styles.workspaceArrow} aria-hidden="true">
                  <ArrowUpRight size={17} />
                </span>
              </Link>
            </Button>
            <span className={styles.actionDivider} aria-hidden="true" />
            <button
              className={`icon-button ${styles.logout}`}
              aria-label="Log out"
              title="Log out"
              onClick={logout}
            >
              <LogOut size={18} />
            </button>
            <button
              className={`icon-button ${styles.menu}`}
              aria-label="Open menu"
              aria-controls="public-mobile-menu"
              aria-expanded={open}
              onClick={() => {
                dialog.current?.showModal();
                setOpen(true);
              }}
            >
              <Menu size={22} />
            </button>
          </div>
        </nav>
      </div>
      {logoutError && (
        <p className={styles.logoutError} role="alert">
          {logoutError}
        </p>
      )}
      <dialog
        id="public-mobile-menu"
        ref={dialog}
        className={styles.mobileDialog}
        aria-label="Main navigation"
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        onKeyDown={(e) => {
          if (e.key !== "Tab") return;
          const items = Array.from(
            e.currentTarget.querySelectorAll<HTMLElement>(
              "a[href],button:not([disabled])",
            ),
          );
          const first = items[0],
            last = items[items.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }}
      >
        <div className={styles.dialogHead}>
          <Brand />
          <button
            className="icon-button"
            aria-label="Close menu"
            onClick={close}
          >
            <X size={22} />
          </button>
        </div>
        <div className={styles.mobileLinks}>
          {mainSections.map(({ href, label }) => (
            <Link key={href} href={href} onClick={close}>
              {label}
              <ArrowUpRight aria-hidden="true" />
            </Link>
          ))}
          <Button asChild>
            <Link href="/app/dashboard" onClick={close}>
              Open workspace <ArrowRight size={18} />
            </Link>
          </Button>
          <button className={styles.mobileLogout} onClick={logout}>
            <LogOut size={18} /> Log out
          </button>
        </div>
      </dialog>
    </>
  );
}

function Showcase() {
  return (
    <div className={styles.showcase}>
      <div className={styles.previewMotion} data-showcase-panel>
        <ProductPreview />
      </div>
      <p className={styles.previewCaption}>
        <ShieldCheck size={15} /> {demoPreview.label} <span>·</span> Read-only
        preview
      </p>
    </div>
  );
}

const journey = [
  {
    icon: Compass,
    href: "/app/questionnaire",
    action: "Discover your preferences",
    title: "Discover yourself",
    text: "Your interests, preferences, and what matters most.",
  },
  {
    icon: FileText,
    href: "/app/cv",
    action: "Bring your CV into focus",
    title: "Know your strengths",
    text: "Bring your experience and skills into focus.",
  },
  {
    icon: Network,
    href: "/app/results?demo=student",
    action: "Explore career matches",
    title: "Explore careers",
    text: "Understand your matches and possible futures.",
  },
  {
    icon: GraduationCap,
    href: "/app/pathway?demo=student",
    action: "Find your next step",
    title: "Build your pathway",
    text: "Find practical learning that fits your life.",
  },
  {
    icon: Leaf,
    href: "/app/sdg?demo=student",
    action: "See the connections",
    title: "Connect to purpose",
    text: "Explore your potential for meaningful impact.",
  },
];
const faqs = [
  [
    "Where do I start after logging in?",
    "Explore the platform here, then use Open workspace to build your own profile and career pathway. You can also explore Aisha’s or Daniel’s fictional, read-only stories while signed in.",
  ],
  [
    "What happens to my CV?",
    "Your original PDF or DOCX is discarded after parsing. You review and correct the extracted information before saving; only the structured details you confirm are retained. You can also enter your experience manually.",
  ],
  [
    "Does it work without an AI key?",
    "You can edit your profile and CV, explore curated career information, and use learning pathways without AI. AI extraction, CV assessments, writing suggestions, and live vacancy analysis require an available configured provider.",
  ],
  [
    "Are these predictions about my future?",
    "No. Career matches indicate personal fit based on your reported skills and preferences. Scenarios are prototype estimates using documented assumptions, not live labour-market predictions or employment guarantees. SDG mappings show potential alignment, not measured impact or UN certification.",
  ],
];

export function Landing() {
  const root = useRef<HTMLDivElement>(null);
  useLandingMotion(root);
  return (
    <div ref={root} className={styles.landing}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Navigation />
      <main id="main-content">
        <section className={styles.hero}>
          <div>
            <div className={styles.eyebrow} data-hero-support>
              <Sparkles size={14} /> A LITTLE CLARITY FOR WHAT’S NEXT
            </div>
            <h1 aria-label="Your future. Full of possibility.">
              <span className={styles.headlineLine} aria-hidden="true">
                <span data-hero-word>Suit Up</span>
              </span>
              <span
                className={`${styles.headlineLine} ${styles.headlineAccent}`}
                aria-hidden="true"
              >
                <span data-hero-word>Before Rainy Day</span>
              </span>
            </h1>
            <p className={styles.heroDescription} data-hero-support>
              Understand your strengths. Explore where your skills can take you.
              <br className={styles.desktopBreak} /> Build a career that grows
              with the world.
            </p>
            <div className={styles.heroActions} data-hero-support>
              <Button asChild>
                <Link href="/app/dashboard">
                  Open my workspace <ArrowUpRight size={19} />
                </Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/demo/student">
                  Explore the demo <ArrowRight size={18} />
                </Link>
              </Button>
            </div>
            <div className={styles.heroProof} data-hero-support>
              <span>
                <ShieldCheck size={14} /> Your data, your control
              </span>
              <span>
                <Check size={14} /> No AI key needed to explore
              </span>
            </div>
          </div>
        </section>
        <Showcase />
        <div className={styles.facts}>
          <div data-fact>
            <strong>
              {demoPreview.facts.careers}
              <span>careers to explore</span>
            </strong>
            <p>Curated role and skill mappings</p>
          </div>
          <div data-fact>
            <strong>
              {demoPreview.facts.scenarios}
              <span>ways to view the future</span>
            </strong>
            <p>Moderate and Rapid AI Adoption</p>
          </div>
          <div data-fact>
            <strong>
              {demoPreview.facts.pathwayTypes}
              <span>routes to your next chapter</span>
            </strong>
            <p>Fastest Transition and Lowest-Cost</p>
          </div>
        </div>

        <section id="how-it-works" className={styles.journeySection}>
          <Reveal className={styles.sectionIntro}>
            <div>
              <span className="section-label">
                YOUR NEXT CHAPTER, CONNECTED
              </span>
              <h2 data-heading-reveal>
                Big possibilities.
                <br />
                <span>Small, practical steps.</span>
              </h2>
            </div>
            <p>
              You don’t need to have it all figured out.
              <br />
              Just a place to start, and a clearer way forward.
            </p>
          </Reveal>
          <ol className={styles.journey}>
            {journey.map(({ icon: Icon, title, text, href, action }, i) => (
              <li
                key={title}
                data-journey-card
                style={{ "--chapter": i } as React.CSSProperties}
              >
                <div className={styles.journeyTop}>
                  <span>0{i + 1}</span>
                  <Icon size={23} />
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
                <Link href={href} className={styles.chapterLink}>
                  {action}
                  <ArrowUpRight size={20} />
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <section id="platform" className={styles.platformSection}>
          <Reveal className={styles.platformIntro}>
            <span className="section-label"></span>
            <h2 data-heading-reveal>
              A future you can
              <br />
              <span>understand, and shape.</span>
            </h2>
            <p></p>
          </Reveal>
          <div className={styles.bento}>
            <div
              data-feature-card
              className={`${styles.feature} ${styles.matchFeature}`}
            >
              <div className={styles.featureCopy}>
                <span className="section-label">
                  <Compass size={15} /> YOUR DIRECTION
                </span>
                <h3>
                  More than a match.
                  <br />
                  The thinking behind it.
                </h3>
                <p>
                  See how your skills and preferences connect to a career—and
                  what you could build next.
                </p>
              </div>
              <div className={styles.matchRows}>
                {demoPreview.matches.map((m, i) => (
                  <div key={m.title}>
                    <span className={styles.rank}>0{i + 1}</span>
                    <strong>{m.title}</strong>
                    <span className={styles.matchValue}>
                      {m.score}
                      <small>% fit</small>
                    </span>
                  </div>
                ))}
                <p>Fictional profile · Curated demo data</p>
              </div>
              <Link
                className={styles.featureLink}
                href="/app/results?demo=student"
              >
                Explore career intelligence <ArrowUpRight size={19} />
              </Link>
            </div>
            <div
              data-feature-card
              className={`${styles.feature} ${styles.scenarioFeature}`}
            >
              <div className={styles.featureCopy}>
                <span className="section-label">
                  <TrendingUp size={15} /> A CHANGING WORLD
                </span>
                <h3>
                  Different futures.
                  <br />
                  Clear assumptions.
                </h3>
                <p>
                  Compare Moderate and Rapid AI Adoption. Your personal fit
                  stays separate from market outlook.
                </p>
              </div>
              <div className={styles.scenarioPreview}>
                <span>
                  01 <strong>Moderate adoption</strong>
                  <ArrowUpRight size={16} />
                </span>
                <span>
                  02 <strong>Rapid adoption</strong>
                  <ArrowUpRight size={16} />
                </span>
                <p>Prototype scenario estimate</p>
              </div>
              <Link
                className={styles.featureLink}
                href="/app/results?demo=student"
              >
                Compare the scenarios <ArrowUpRight size={19} />
              </Link>
            </div>
            <div
              data-feature-card
              className={`${styles.feature} ${styles.learnFeature}`}
            >
              <div className={styles.featureCopy}>
                <span className="section-label">
                  <BookOpen size={15} /> YOUR PACE, YOUR PATH
                </span>
                <h3>
                  Make learning
                  <br />
                  work for your life.
                </h3>
                <p>
                  Compare the fastest transition with the lowest-cost route.
                  Real resource links. Practical next steps.
                </p>
              </div>
              <div className={styles.routePreview}>
                <div>
                  <span className="icon-tile violet">
                    <GraduationCap size={22} />
                  </span>
                  <strong>
                    Fastest
                    <br />
                    Transition
                  </strong>
                </div>
                <div>
                  <span className="icon-tile teal">
                    <BookOpen size={22} />
                  </span>
                  <strong>
                    Lowest-Cost
                    <br />
                    Transition
                  </strong>
                </div>
              </div>
              <Link
                className={styles.featureLink}
                href="/app/pathway?demo=student"
              >
                Find your pathway <ArrowUpRight size={19} />
              </Link>
            </div>
            <div
              data-feature-card
              className={`${styles.feature} ${styles.impactFeature}`}
            >
              <div className={styles.featureCopy}>
                <span className="section-label">
                  <Leaf size={15} /> PURPOSE IN THE PICTURE
                </span>
                <h3>
                  Your skills.
                  <br />A wider kind of impact.
                </h3>
                <p>
                  Connect your capabilities to a career, a work activity, and
                  relevant Sustainable Development Goals.
                </p>
              </div>
              <div className={styles.impactPreview}>
                <span>Skills</span>
                <ArrowRight size={17} />
                <span>Career</span>
                <ArrowRight size={17} />
                <span>Purpose</span>
              </div>
              <p className={styles.alignment}>
                Potential alignment, not measured impact.
              </p>
              <Link className={styles.featureLink} href="/app/sdg?demo=student">
                See the connections <ArrowUpRight size={19} />
              </Link>
            </div>
          </div>
        </section>

        <section id="demo-stories" className={styles.demoSection}>
          <Reveal className={styles.sectionIntro}>
            <div>
              <span className="section-label"></span>
              <h2 data-heading-reveal>
                Two people.
                <br />
                <span>A world of possibility.</span>
              </h2>
            </div>
            <p>
              See how it comes together.
              <br />
              Fictional profiles. Real ways to explore.
            </p>
          </Reveal>
          <div className={styles.personas}>
            <Reveal>
              <Link
                href="/demo/student"
                className={styles.persona}
                data-persona
              >
                <div className={styles.personaTop}>
                  <GraduationCap size={32} />
                  <span>01 / THE STUDENT</span>
                  <ArrowUpRight size={25} />
                </div>
                <h3>Meet Aisha.</h3>
                <p>From computer science to a career with purpose.</p>
                <div className={styles.personaTags}>
                  <span>Data & analytics</span>
                  <span>Sustainability</span>
                </div>
                <div className={styles.personaFoot}>
                  <span>Explore her journey</span>
                  <ArrowRight size={21} />
                </div>
              </Link>
            </Reveal>
            <Reveal>
              <Link
                href="/demo/professional"
                className={`${styles.persona} ${styles.professional}`}
                data-persona
              >
                <div className={styles.personaTop}>
                  <BriefcaseBusiness size={30} />
                  <span>02 / THE PROFESSIONAL</span>
                  <ArrowUpRight size={25} />
                </div>
                <h3>Meet Daniel.</h3>
                <p>Turning hands-on expertise into digital opportunity.</p>
                <div className={styles.personaTags}>
                  <span>Manufacturing</span>
                  <span>Technology</span>
                </div>
                <div className={styles.personaFoot}>
                  <span>Explore his journey</span>
                  <ArrowRight size={21} />
                </div>
              </Link>
            </Reveal>
          </div>
          <p className={styles.demoNote}>
            Fictional profiles · Curated demo data · Read-only
          </p>
        </section>

        <section id="questions" className={styles.faqSection}>
          <Reveal>
            <span className="section-label">A LITTLE MORE CLARITY</span>
            <h2 data-heading-reveal>
              Good questions.
              <br />
              <span>Honest answers.</span>
            </h2>
            <p>Because understanding how it works matters.</p>
          </Reveal>
          <Reveal className={styles.faqs}>
            {faqs.map(([q, a]) => (
              <details key={q}>
                <summary>
                  {q}
                  <ChevronDown size={20} />
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </Reveal>
        </section>
        <section className={styles.cta}>
          <Reveal>
            <span className={styles.ctaEyebrow}>
              <Sparkles size={18} /> THE FUTURE ISN’T WRITTEN YET
            </span>
            <h2 data-heading-reveal>
              Your next chapter
              <br />
              starts with <span>you.</span>
            </h2>
            <p>Start where you are. Build what comes next.</p>
            <div className={styles.heroActions}>
              <Button asChild>
                <Link href="/app/dashboard">
                  Go to my workspace <ArrowUpRight size={20} />
                </Link>
              </Button>
              <Link href="/demo/student" className={styles.ctaDemo}>
                Try a demo first <ArrowRight size={17} />
              </Link>
            </div>
          </Reveal>
        </section>
      </main>
      <footer className={styles.footer}>
        <div>
          <Brand />
          <p>Made for human possibility.</p>
        </div>
        <div className={styles.footerLinks}>
          <Link href="#questions">Privacy & questions</Link>
          <Link href="/demo/student">
            Explore the demo <ArrowUpRight size={14} />
          </Link>
          <Link href="/app/dashboard">Open workspace</Link>
        </div>
        <small>
          Local prototype · Evidence, assumptions, and limitations made visible.
        </small>
      </footer>
    </div>
  );
}
