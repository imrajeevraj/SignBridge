import { ArrowUpRight, type LucideIcon } from 'lucide-react';

export function FeatureCard({ icon: Icon, title, description, phase, available = false }: {
  icon: LucideIcon; title: string; description: string; phase: string; available?: boolean;
}) {
  return <article className="feature-card">
    <div className="flex items-center justify-between"><Icon size={20} aria-hidden="true" /><span className="planned">{available ? 'Available' : 'Planned'} <ArrowUpRight size={11} aria-hidden="true" /></span></div>
    <h3>{title}</h3><p>{description}</p><span className="feature-phase">{phase}</span>
  </article>;
}
