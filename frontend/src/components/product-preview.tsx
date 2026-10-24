import { ArrowUpRight, Check, CheckCircle2, Compass, FileText, GraduationCap, LayoutDashboard, Leaf, Sparkles } from 'lucide-react';
import { demoPreview } from '@/lib/demo-preview';
import { ScoreRing } from './product-cards';
import styles from './product-preview.module.css';

/** A real, semantic product UI preview, not an image or a live account. */
export function ProductPreview({ compact = false }: { compact?: boolean }) {
  const top = demoPreview.matches[0];
  return <div className={`${styles.stage} ${compact ? styles.compact : ''}`} aria-label="Fictional career dashboard preview">
    <div className={styles.frame}>
      <header className={styles.header}><span><Compass size={18} /> Aisha’s workspace</span><span className={styles.readOnly}>Read-only preview</span></header>
      <div className={styles.body}>
        <aside className={styles.rail} aria-hidden="true"><LayoutDashboard /><Compass /><FileText /><GraduationCap /><Leaf /></aside>
        <div className={styles.content}>
          <div className={styles.greeting}><span className="eyebrow">YOUR FUTURE, IN FOCUS</span><h3>A little clearer.<br />A little closer, Aisha.</h3><p>Small steps. New possibilities.</p></div>
          <div className={styles.grid}>
            <section className={styles.match}><div className={styles.cardHeading}><span><Compass size={17} /> Your strongest match</span><ArrowUpRight size={17} /></div><h4>{top.title}</h4><div className={styles.fit}><strong>{top.score}<small>%</small></strong><span>personal fit<br /><small>Skills + preferences</small></span></div><div className="chip-row">{top.skills.map(s => <span className="chip" key={s}><Check size={11} />{s}</span>)}</div><p className={styles.note}>A starting point, not a verdict.</p></section>
            <section className={styles.skills}><span className={styles.cardHeading}><Sparkles size={17} /> Skills you bring</span>{['Python', 'Data analysis', 'Communication'].map(s => <div className={styles.skillRow} key={s}><span>{s}</span><CheckCircle2 size={16} /></div>)}<div className={styles.purpose}><Leaf size={21} /><span>Your skills.<br /><strong>A wider kind of impact.</strong></span></div></section>
          </div>
          <p className={styles.caption}>{demoPreview.label}</p>
        </div>
      </div>
    </div>
    <section className={`${styles.floatCard} ${styles.cv}`}><div className={styles.cardHeading}><FileText size={17} /> Your CV, clearer.</div><ScoreRing value={demoPreview.cvScore} size={100} /><strong>A foundation to build on.</strong><p>CV quality · not an ATS score</p></section>
    <section className={`${styles.floatCard} ${styles.learning}`}><div className={styles.cardHeading}><GraduationCap size={19} /> Your next chapter</div><h4>{demoPreview.plan.title}</h4><p>Learning towards {demoPreview.plan.role}</p><div className={styles.planMeta}><strong>{demoPreview.plan.weeks}<small>estimated weeks</small></strong><strong>MYR {demoPreview.plan.cost}<small>learning content</small></strong></div><div className={styles.planStep}><CheckCircle2 size={17} /><span>{demoPreview.plan.steps[0]}</span></div><div className={styles.planStep}><span className={styles.stepNumber}>2</span><span>{demoPreview.plan.steps[1]}</span></div><p className={styles.note}>Example progress · 1 of 2 steps</p></section>
  </div>;
}
