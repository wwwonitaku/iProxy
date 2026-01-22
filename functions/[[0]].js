const ALLOWED_ROOT_DOMAIN = "anisrc.top";
const HOST_RE = /^x([0-9]{2})\.anisrc\.top$/i;

export async function onRequest(context) {
  const { request } = context;
  const cache = caches.default;

  /* =========================
     0. CACHE
     ========================= */

  const cached = await cache.match(request);
  if (cached) return cached;

  /* =========================
     1. PARSE URL
     ========================= */

  const url = new URL(request.url);
  const pathname = url.pathname.replace(/^\/+/, "");
  const lower = pathname.toLowerCase();

  if (!pathname) {
    return new Response("Not found", { status: 404 });
  }

  const isM3u8 = lower.endsWith(".m3u8");
  const isPng  = lower.endsWith(".png");

  /* =========================
     2. REFERER PROTECTION
     ========================= */

  const referer = request.headers.get("Referer");

  // m3u8 phải có referer, png thì không bắt buộc (HLS internal)
  if (!referer && isM3u8) {
    return new Response("Forbidden", { status: 403 });
  }

  if (referer) {
    let refHost;
    try {
      refHost = new URL(referer).hostname;
    } catch {
      return new Response("Forbidden", { status: 403 });
    }

    if (
      refHost !== ALLOWED_ROOT_DOMAIN &&
      !refHost.endsWith("." + ALLOWED_ROOT_DOMAIN)
    ) {
      return new Response("Forbidden", { status: 403 });
    }
  }

  /* =========================
     3. HOST → SHARD
     ========================= */

  const hostMatch = url.hostname.match(HOST_RE);
  if (!hostMatch) {
    return new Response("Forbidden", { status: 403 });
  }

  const shardId = hostMatch[1]; // "01"

  /* =========================
     4. INDEX REDIRECT
     ========================= */

  if (lower === "index.html") {
    return Response.redirect("https://anisrc.top/", 302);
  }

  /* =========================
     5. VIDEO ID
     ========================= */

  let videoId;

  if (isM3u8) {
    videoId = pathname.slice(0, -5);
  } 
  else if (isPng) {
    const match = pathname.match(/^(tv-\d+-\d+-\d+)-index/i);
    if (!match) {
      return new Response("Forbidden", { status: 403 });
    }
    videoId = match[1];
  } 
  else {
    return new Response("Forbidden", { status: 403 });
  }

  /* =========================
     6. ORIGIN URL
     ========================= */

  const originUrl =
    `https://${videoId}.x${shardId}-anisrc-top.pages.dev/${pathname}`;

  /* =========================
     7. FETCH ORIGIN
     ========================= */

  const originRes = await fetch(originUrl);
  if (!originRes.ok) {
    return new Response("Not found", { status: 404 });
  }

  /* =========================
     8. RESPONSE + CACHE
     ========================= */

  const res = new Response(originRes.body, originRes);

  res.headers.set(
    "Cache-Control",
    "public, max-age=31536000, immutable"
  );
  res.headers.set("X-Content-Type-Options", "nosniff");

  await cache.put(request, res.clone());
  return res;
}
