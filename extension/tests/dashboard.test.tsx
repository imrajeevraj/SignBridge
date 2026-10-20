import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { getBackendStatus, getStatus } from '../src/communication/client';
import { SETTINGS_KEY } from '../src/settings';
import type { BackendStatus } from '../src/communication/messages';

vi.mock('../src/communication/client', () => ({ getBackendStatus: vi.fn(), getStatus: vi.fn() }));
beforeEach(() => {
  vi.mocked(getBackendStatus).mockResolvedValue({ state: 'offline', message: 'Backend is unavailable.' });
  vi.mocked(getStatus).mockResolvedValue({ version: '0.2.0', phase: 3, recognition: 'managed_in_webcam_studio', model: 'reported_by_backend', camera: 'managed_in_webcam_studio' });
});

describe('dashboard', () => {
  it('renders truthful status and keeps all recognition modes disabled', async () => {
    render(<App />);
    await screen.findByText('Offline');
    expect(screen.getAllByText('See studio')).toHaveLength(2);
    expect(screen.getByText('Unavailable')).toBeTruthy();
    expect(screen.getAllByText('See studio')).toHaveLength(2);
    for (const name of ['Start Recognition', 'Stop Recognition']) {
      const control = screen.getByRole('button', { name }) as HTMLButtonElement;
      expect(control.disabled).toBe(true);
      fireEvent.click(control);
    }
    expect(screen.getByRole('radio', { name: /Webcam Mode/ }).matches(':disabled')).toBe(true);
    expect(screen.getByRole('radio', { name: /Meeting Tab Mode/ }).matches(':disabled')).toBe(true);
    expect(screen.getAllByText('See studio')).toHaveLength(2);
  });
  it('saves preferences and restores them after remount', async () => {
    const user = userEvent.setup();
    const view = render(<App />);
    await waitFor(() => expect(screen.getByLabelText('Caption language').matches(':disabled')).toBe(false));
    await user.selectOptions(screen.getByLabelText('Caption language'), 'hi');
    await user.selectOptions(screen.getByLabelText('Caption size'), 'large');
    await user.click(screen.getByRole('checkbox'));
    await user.selectOptions(screen.getByLabelText('Appearance'), 'light');
    await user.click(screen.getByRole('button', { name: 'Save preferences' }));
    await screen.findByText('Preferences saved');
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}')).toEqual({ captionLanguage: 'hi', captionSize: 'large', displayConfidence: true, theme: 'light' });
    view.unmount(); render(<App />);
    await waitFor(() => expect((screen.getByLabelText('Caption language') as HTMLSelectElement).value).toBe('hi'));
    expect(document.documentElement.dataset.theme).toBe('light');
  });
  it('shows loading, a real success, and an error when retry fails', async () => {
    let resolve: (value: BackendStatus) => void = () => undefined;
    vi.mocked(getBackendStatus).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    render(<App />);
    expect(screen.getByText('Checking…')).toBeTruthy();
    expect((screen.getByLabelText('Check backend connection') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => resolve({ state: 'online', health: { status: 'ok', service: 'SignBridge AI Backend', phase: 3, model_status: 'not_loaded', model_state: 'MODEL_NOT_INSTALLED' } }));
    await screen.findByText('Online');
    vi.mocked(getBackendStatus).mockRejectedValueOnce(new Error('Worker disconnected.'));
    fireEvent.click(screen.getByLabelText('Check backend connection'));
    await screen.findByText('Worker disconnected.');
    expect(screen.getByText('Error')).toBeTruthy();
  });
  it('shows settings persistence errors', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByLabelText('Caption language').matches(':disabled')).toBe(false));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota exceeded'); });
    fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));
    await screen.findByText('Could not save preferences. Please try again.');
    expect(screen.queryByText('Preferences saved')).toBeNull();
  });
});
