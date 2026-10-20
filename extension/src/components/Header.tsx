import { ArrowUpRight, Hand } from 'lucide-react';
import { isExtension } from '../settings';

export function Header({ version, onError }: { version: string; onError: (message: string) => void }) {
  const openDashboard = () => {
    if (isExtension()) void chrome.runtime.openOptionsPage().catch(() => onError('Could not open the dashboard. Use the extension’s Options menu.'));
  };
  return <header className="header flex items-center justify-between gap-4">
    <a className="brand flex items-center gap-3" href="#main" aria-label="SignBridge AI home">
      <span className="brand-icon"><Hand size={25} strokeWidth={1.7} aria-hidden="true" /></span>
      <span><strong>SignBridge<span className="accent"> AI</span></strong><small>A voice for every gesture.</small></span>
    </a>
    <div className="flex items-center gap-3">
      <span className="version">v{version}</span>
      {isExtension() && <button className="icon-button" onClick={openDashboard} aria-label="Open full dashboard" title="Open full dashboard"><ArrowUpRight size={19} /></button>}
    </div>
  </header>;
}
