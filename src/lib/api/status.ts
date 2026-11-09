// A tiny event channel between the API wrapper and the header's server-status dot. The
// wrapper reports every outcome; the dot listens. No polling: the status is checked once on
// page load, after any call that could not reach the server, and when the user clicks the dot.
export const API_REACHABLE = "irb:api-reachable";
export const API_UNREACHABLE = "irb:api-unreachable";

export function reportReachable() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(API_REACHABLE));
}

export function reportUnreachable() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(API_UNREACHABLE));
}
