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

// Fetch wrapper for the FastAPI server (browser side). Adds the Bearer token. Any 401/403
// signs the user out and sends them to the login page (decision: auth failure). Other
// statuses are thrown as ApiError so screens can map 404/409/429/503 to messages.
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
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

  if (response.status === 401 || response.status === 403) {
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
  return (await response.json()) as T;
}
