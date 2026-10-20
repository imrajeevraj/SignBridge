import type { LucideIcon } from 'lucide-react';

export function StatusCard({ icon: Icon, label, value, tone = 'neutral' }: {
  icon: LucideIcon; label: string; value: string; tone?: 'neutral' | 'online' | 'offline' | 'error' | 'loading';
}) {
  return <div className="status-card">
    <Icon size={18} className="muted" aria-hidden="true" />
    <span className="status-label">{label}</span>
    <strong className={`status-value tone-${tone}`}><span className="status-dot" />{value}</strong>
  </div>;
}
