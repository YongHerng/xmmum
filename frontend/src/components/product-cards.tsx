import type { LucideIcon } from 'lucide-react';

export function MetricCard({ icon: Icon, label, value, suffix, note, color }: {
  icon: LucideIcon; label: string; value: string; suffix?: string; note: string; color: string;
}) {
  return <section className="metric card">
    <div><span className={`metric-icon ${color}`}><Icon size={20} aria-hidden="true" /></span><span className="metric-label">{label}</span></div>
    <p className="metric-value">{value}<span>{suffix}</span></p>
    <small>{note}</small>
  </section>;
}

export function ScoreRing({ value, size = 124 }: { value: number; size?: number }) {
  const score = Math.max(0, Math.min(100, value));
  return <div className="score-ring" style={{ width: size, height: size }} role="img" aria-label={`Score ${score} out of 100`}>
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r="51" fill="none" stroke="var(--lavender)" strokeWidth="7" />
      <circle cx="60" cy="60" r="51" fill="none" stroke="var(--indigo)" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${score * 3.204} 320.4`} transform="rotate(-90 60 60)" />
    </svg>
    <span><strong>{score}</strong><small>out of 100</small></span>
  </div>;
}
