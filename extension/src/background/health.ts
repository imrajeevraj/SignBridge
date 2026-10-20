import { isHealthResponse, type BackendStatus } from '../communication/messages';

export const BACKEND_URL: string = import.meta.env.VITE_BACKEND_URL ?? 'http://127.0.0.1:8000';
export async function checkBackend(fetcher: typeof fetch = fetch): Promise<BackendStatus> {
  try {
    const response = await fetcher(`${BACKEND_URL}/health`, {
      signal: AbortSignal.timeout(4000), cache: 'no-store', credentials: 'omit', redirect: 'error',
    });
    if (!response.ok) return { state: 'error', message: `Backend returned HTTP ${response.status}.` };
    const data: unknown = await response.json();
    if (!isHealthResponse(data)) return { state: 'error', message: 'Unexpected health response. Check that the SignBridge Phase 3 backend is running.' };
    return { state: 'online', health: data };
  } catch (error) {
    if (error instanceof SyntaxError) return { state: 'error', message: 'Backend returned invalid JSON.' };
    return { state: 'offline', message: `Cannot reach ${BACKEND_URL}. Start the backend and retry.` };
  }
}
