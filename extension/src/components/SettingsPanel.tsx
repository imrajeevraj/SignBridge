import { useEffect, useState } from 'react';
import { Check, Settings2, Save } from 'lucide-react';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '../settings';

export function SettingsPanel() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void loadSettings().then((value) => { if (active) setSettings(value); })
      .catch(() => { if (active) setError('Could not load preferences. You can save new defaults below.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = settings.theme; }, [settings.theme]);
  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((previous) => ({ ...previous, [key]: value }));
    setNotice('Unsaved changes');
  }
  async function save() {
    setSaving(true); setError(''); setNotice('');
    try { await saveSettings(settings); setNotice('Preferences saved'); }
    catch { setError('Could not save preferences. Please try again.'); }
    finally { setSaving(false); }
  }
  return <section className="panel settings-panel" aria-labelledby="settings-heading">
    <div className="section-heading"><span className="heading-icon"><Settings2 size={18} aria-hidden="true" /></span><h2 id="settings-heading">Your preferences</h2></div>
    <p className="section-description">Make captions feel right for you.</p>
    <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <fieldset disabled={loading || saving}>
        <label className="field-label" htmlFor="caption-language">Caption language</label>
        <select id="caption-language" value={settings.captionLanguage} onChange={(event) => update('captionLanguage', event.target.value === 'hi' ? 'hi' : 'en')}>
          <option value="en">English</option><option value="hi">Hindi</option>
        </select>
        <label className="field-label" htmlFor="caption-size">Caption size</label>
        <select id="caption-size" value={settings.captionSize} onChange={(event) => update('captionSize', event.target.value === 'small' ? 'small' : event.target.value === 'large' ? 'large' : 'medium')}>
          <option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option>
        </select>
        <label className="toggle-row" htmlFor="confidence"><span><strong>Display confidence</strong><small>Show confidence beside future captions</small></span><input type="checkbox" id="confidence" checked={settings.displayConfidence} onChange={(event) => update('displayConfidence', event.target.checked)} /></label>
        <label className="field-label" htmlFor="theme">Appearance</label>
        <select id="theme" value={settings.theme} onChange={(event) => update('theme', event.target.value === 'light' ? 'light' : 'dark')}><option value="dark">Dark</option><option value="light">Light</option></select>
        <p className="settings-note">Caption preferences are saved for future phases. English / Hindi are output preferences; ASL and ISL remain distinct sign languages.</p>
        <button className="button secondary w-full" type="submit"><Save size={15} aria-hidden="true" />{loading ? 'Loading preferences…' : saving ? 'Saving…' : 'Save preferences'}</button>
      </fieldset>
      {notice && <p className="save-notice" role="status"><Check size={14} aria-hidden="true" />{notice}</p>}
      {error && <p className="error-message" role="alert">{error}</p>}
    </form>
  </section>;
}
