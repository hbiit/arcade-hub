// Talks to start.ng through its hidden connect page or HTTP API.
const START_NG = 'https://start.ng';
const START_NG_API = 'https://api.start.ng';
let framePromise: Promise<HTMLIFrameElement> | null = null;

export interface StartNgUser {
  id: number | string;
  name: string;
  account?: string;
  style?: {
    body?: string;
    primaryColor?: string;
    secondaryColor?: string;
    skinColor?: string;
    hairColor?: string;
    hair?: string;
    hat?: string;
    accessory?: string;
  };
  face?: string;
}

export function connectFrame(): Promise<HTMLIFrameElement> {
  if (!framePromise && typeof document !== 'undefined') {
    framePromise = new Promise((resolve, reject) => {
      const el = document.createElement('iframe');
      el.src = `${START_NG}/connect`;
      el.hidden = true;
      el.onload = () => resolve(el);
      el.onerror = reject;
      document.body.append(el);
    });
  }
  return framePromise || Promise.reject(new Error('Document not ready'));
}

export async function askStartNg<T = any>(message: Record<string, any>, replyType: string, timeoutMs = 4000): Promise<T | null> {
  try {
    const el = await connectFrame();
    return new Promise((resolve) => {
      const requestId = Math.random().toString(36).slice(2);
      const timer = setTimeout(() => {
        window.removeEventListener('message', onMessage);
        resolve(null);
      }, timeoutMs);

      function onMessage(e: MessageEvent) {
        if (e.origin !== START_NG || e.source !== el.contentWindow) return;
        if (e.data?.type === replyType && e.data.requestId === requestId) {
          clearTimeout(timer);
          window.removeEventListener('message', onMessage);
          resolve(e.data);
        }
      }

      window.addEventListener('message', onMessage);
      el.contentWindow?.postMessage({ ...message, requestId }, START_NG);
    });
  } catch {
    return null;
  }
}

export function getGameSession(): string | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash.slice(1);
  const params = new URLSearchParams(hash);
  const sessionFromHash = params.get('startng_session');
  if (sessionFromHash) {
    sessionStorage.setItem('startng_session', sessionFromHash);
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  return sessionStorage.getItem('startng_session');
}

export function triggerStartNgSignIn(): void {
  if (typeof window === 'undefined') return;
  const returnTo = encodeURIComponent(window.location.origin + window.location.pathname);
  window.location.href = `${START_NG}/?return_to=${returnTo}`;
}

export async function fetchStartNgPlayer(): Promise<{ user: StartNgUser | null; isGuest: boolean }> {
  try {
    const reply = await askStartNg<{ user?: StartNgUser; guest?: StartNgUser }>({ type: 'startng:whoami' }, 'startng:user');
    if (reply?.user) {
      return { user: reply.user, isGuest: false };
    }
    if (reply?.guest) {
      return { user: reply.guest, isGuest: true };
    }
  } catch {
    // Connect frame not reachable (e.g. localhost testing)
  }

  // Fallback to HTTP API if session token is available
  const session = getGameSession();
  if (session) {
    try {
      const gameName = window.location.hostname.split('.')[0] || 'arcade-hub';
      const res = await fetch(`${START_NG_API}/games/${gameName}/player`, {
        headers: { Authorization: `Bearer ${session}` }
      });
      if (res.ok) {
        const user = await res.json();
        return { user, isGuest: false };
      }
    } catch {
      // Offline or network error
    }
  }

  return { user: null, isGuest: true };
}

export async function saveStartNgScore(score: number, wins: number): Promise<boolean> {
  try {
    const res = await askStartNg({ type: 'startng:score', stats: { score, wins } }, 'startng:scoreSaved');
    if (res && (res as any).ok) return true;
  } catch {
    // fallback
  }

  const session = getGameSession();
  if (session) {
    try {
      const gameName = window.location.hostname.split('.')[0] || 'arcade-hub';
      const res = await fetch(`${START_NG_API}/games/${gameName}/scores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session}` },
        body: JSON.stringify({ stats: { score, wins } })
      });
      return res.ok;
    } catch {
      //
    }
  }
  return false;
}
