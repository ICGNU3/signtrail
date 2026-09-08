import app from "vinext/server/app-router-entry";
import { handleApiRequest } from "./api.js";

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "frame-src 'self'",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self' mailto:",
  "media-src 'none'",
  "manifest-src 'self'"
].join("; ");

function secureApplicationResponse(response) {
  const headers = new Headers(response.headers);
  headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set("X-Frame-Options", "SAMEORIGIN");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const apiResponse = await handleApiRequest(request, env, ctx);
    if (apiResponse) return apiResponse;
    let response;
    if (app && typeof app.fetch === "function") response = await app.fetch(request, env, ctx);
    else if (typeof app === "function") response = await app(request, env, ctx);
    else response = new Response("SignTrail application handler is unavailable.", { status: 500 });
    return secureApplicationResponse(response);
  }
};
