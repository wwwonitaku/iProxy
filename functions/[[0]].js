const ALLOWED_ROOT_DOMAIN = "anisrc.top";
const HOST_RE = /^x([0-9]{2})\.anisrc\.top$/i;

export async function onRequest(context) {
  const { request } = context;

  /* =========================
     0. WORKER CACHE (EARLY RETURN)
     ========================= */

  const cache = caches.default;
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  /* =========================
     1. PARSE URL
     ========================= */

  const url = new URL(request.url);

  /* =========================
     2. REFERER PROTECTION
     ========================= */

  const referer = request.headers.get("Referer");
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

  if (
    refererHost !== ALLOWED_ROOT_DOMAIN &&
    !refererHost.endsWith("." + ALLOWED_ROOT_DOMAIN)
  ) {
    return new Response("Hotlink denied", { status: 403 });
  }

  /* =========================
     3. VALIDATE HOSTNAME
     ========================= */

  if (!HOST_RE.test(url.hostname)) {
    return new Response("Invalid host", { status: 403 });
  }

  /* =========================
     4. PATHNAME
     ========================= */

  const pathname = url.pathname.replace(/^\/+/, "");
  if (!pathname) {
    return new Response("Not found", { status: 404 });
  }

  const lower = pathname.toLowerCase();

  /* =========================
     5. INDEX.HTML → REDIRECT HOME
     ========================= */

  if (lower === "index.html") {
    return Response.redirect("https://anisrc.top/", 302);
  }

  /* =========================
     6. EXTRACT SHARD ID
     ========================= */

  const parts = pathname.split("-");
  const lastPart = parts[parts.length - 1];
  const shardNum = parseInt(lastPart, 10);

  if (isNaN(shardNum)) {
    return new Response("Invalid shard", { status: 403 });
  }

  const shardId =
    shardNum >= 1 && shardNum <= 9
      ? shardNum.toString().padStart(2, "0")
      : shardNum.toString();

  /* =========================
     7. ALLOWED FILES (.m3u8 | .png)
     ========================= */

  if (!lower.endsWith(".m3u8") && !lower.endsWith(".png")) {
    return new Response("File not allowed", { status: 403 });
  }

  const dotIndex = pathname.lastIndexOf(".");
  if (dotIndex === -1) {
    return new Response("Invalid filename", { status: 403 });
  }

  const baseName = pathname.slice(0, dotIndex);

  // PNG phải có dấu "-"
  if (lower.endsWith(".png") && !baseName.includes("-")) {
    return new Response("Invalid image name", { status: 403 });
  }

  const originUrl =
    `https://${baseName}.x${shardId}-anisrc-top.pages.dev/${pathname}`;

  /* =========================
     8. FETCH ORIGIN
     ========================= */

  const originResponse = await fetch(originUrl);
  if (!originResponse.ok) {
    return new Response("File not found", {
      status: originResponse.status
    });
  }

  /* =========================
     9. RESPONSE + CACHE
     ========================= */

  const response = new Response(originResponse.body, originResponse);

  response.headers.set(
    "Cache-Control",
    "public, max-age=31536000, immutable"
  );
  response.headers.set("X-Content-Type-Options", "nosniff");

  await cache.put(request, response.clone());

  return response;
}
