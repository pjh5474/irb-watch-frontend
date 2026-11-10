import { reportReachable, reportUnreachable } from "@/lib/api/status";
import { createClient } from "@/lib/supabase/client";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// Fetch wrapper for the FastAPI server (browser side). Adds the Bearer token. A 401 (no valid
// login) signs the user out and sends them to the login page. A 403 is NOT a sign-out: the
// server uses it for "not allowed" reasons a screen should show (an admin-only action, a
// feature switched off for the account type, a deleted account), so it is thrown as an
// ApiError with the server's reason like every other status (decision 2026-11-10).
async function send(path: string, init: RequestInit = {}): Promise<Response> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  let response: Response;
  try {
    response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    // No HTTP answer at all: server down, network lost, or the browser blocked the call
    // (for example CORS). Status 0 lets screens say "cannot reach the server".
    reportUnreachable();
    throw new ApiError(0, "cannot reach the server");
  }
  reportReachable();

  if (response.status === 401) {
    await supabase.auth.signOut();
    const locale = window.location.pathname.split("/")[1] || "ko";
    // Full reload on purpose: it drops all cached client state of the ended session.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/${locale}/login?reason=session`);
    throw new ApiError(response.status, "signed out");
  }
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      // body was not JSON
    }
    throw new ApiError(response.status, detail);
  }
  return response;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await send(path, init);
  if (response.status === 204) return undefined as T; // no body (for example a DELETE)
  return (await response.json()) as T;
}

/** The file name from a Content-Disposition header (RFC 5987 filename* first). */
export function filenameFrom(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      // a broken encoding falls through to the plain name
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1].trim() : fallback;
}

/** A file answer (for example a DOCX export): its bytes and the name the server gave it. */
export async function apiFetchFile(
  path: string,
  init: RequestInit = {},
  fallbackName = "download",
): Promise<{ blob: Blob; filename: string }> {
  const response = await send(path, init);
  const blob = await response.blob();
  return { blob, filename: filenameFrom(response.headers.get("Content-Disposition"), fallbackName) };
}

/** Hands a downloaded file to the browser as a normal download. */
export function saveFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
