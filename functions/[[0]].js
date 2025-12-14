export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  /* =========================
     1. REFERER PROTECTION
     ========================= */

  const referer = request.headers.get("Referer");

  // Không có referer → redirect
  if (!referer) {
    return Response.redirect(
      "https://www.youtube.com/watch?v=Kq9_r9l8MpI",
      302
    );
  }

  let refererHost;
  try {
    refererHost = new URL(referer).hostname;
  } catch {
    return new Response("Invalid referer", { status: 403 });
  }

  const ALLOWED_ROOT_DOMAIN = "ssplay.net";

  const isAllowedReferer =
    refererHost === ALLOWED_ROOT_DOMAIN ||
    refererHost.endsWith("." + ALLOWED_ROOT_DOMAIN);

  if (!isAllowedReferer) {
    return new Response("Hotlink denied", { status: 403 });
  }

  /* =========================
     2. VALIDATE HOSTNAME
     ========================= */

  const hostMatch = url.hostname.match(
    /^scontent-x([a-z0-9]{2})-fbcdn\.ssplay\.net$/i
  );

  if (!hostMatch) {
    return new Response("Invalid host", { status: 403 });
  }

  const shardId = hostMatch[1];

  /* =========================
     3. PATH & EXTENSION
     ========================= */

  const pathname = url.pathname.replace(/^\/+/, "");

  if (!pathname) {
    return new Response("Not found", { status: 404 });
  }

  const allowedExtensions = [".png", ".m3u8", ".html"];
  const lowerPath = pathname.toLowerCase();

  const isAllowedExt = allowedExtensions.some(ext =>
    lowerPath.endsWith(ext)
  );

  if (!isAllowedExt) {
    return new Response("File type not allowed", { status: 403 });
  }

  /* =========================
     4. PREVIEW ID
     ========================= */

  const dashIndex = pathname.indexOf("-");
  if (dashIndex === -1) {
    return new Response("Invalid filename", { status: 400 });
  }

  const previewId = pathname.substring(0, dashIndex);

  if (!/^[a-z0-9]+$/i.test(previewId)) {
    return new Response("Invalid preview id", { status: 400 });
  }

  /* =========================
     5. BUILD ORIGIN URL
     ========================= */

  const originUrl =
    `https://${previewId}.scontent-x${shardId}-fbcdn.pages.dev/${pathname}`;

  /* =========================
     6. FETCH ORIGIN
     ========================= */

  const originResponse = await fetch(originUrl, {
    headers: {
      "User-Agent": "ssPlay.Net-Proxy-Hot-Protect"
    }
  });

  if (!originResponse.ok) {
    return new Response("File not found", {
      status: originResponse.status
    });
  }

  /* =========================
     7. RESPONSE
     ========================= */

  const headers = new Headers(originResponse.headers);

  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("X-Content-Type-Options", "nosniff");

  return new Response(originResponse.body, {
    status: originResponse.status,
    headers
  });
}
