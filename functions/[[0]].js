const ALLOWED_ROOT_DOMAIN = "anisrc.top";
const HOST_RE = /^x([0-9]{2})\.anisrc\.top$/i;

export async function onRequest(context) {
  const { request } = context;
  const cache = caches.default;

  /* =========================
     0. WORKER CACHE
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
    return new Response("404: NOT_FOUND", { status: 404 });
  }

  const isPng = lower.endsWith(".png");
  const isM3u8 = lower.endsWith(".m3u8");

  /* =========================
     2. REFERER CHECK
     ========================= */

  const referer = request.headers.get("Referer");

  // PNG (HLS internal request) thường không có referer
  if (!referer && !isPng) {
    return new Response("403: NO_REFERER", { status: 403 });
  }

  if (referer) {
    let refHost;
    try {
      refHost = new URL(referer).hostname;
    } catch {
      return new Response("403: INVALID_REFERER", { status: 403 });
    }

    if (
      refHost !== ALLOWED_ROOT_DOMAIN &&
      !refHost.endsWith("." + ALLOWED_ROOT_DOMAIN)
    ) {
      return new Response("403: HOTLINK_DENIED", { status: 403 });
    }
  }

  /* =========================
     3. HOST CHECK
     ========================= */

  if (!HOST_RE.test(url.hostname)) {
    return new Response("403: INVALID_HOST", { status: 403 });
  }

  /* =========================
     4. INDEX REDIRECT
     ========================= */

  if (lower === "index.html") {
    return Response.redirect("https://anisrc.top/", 302);
  }

  /* =========================
     5. EXTRACT SHARD ID (from filename)
     ========================= */

  const parts = pathname.split("-");
  const shardNum = parseInt(parts[parts.length - 1], 10);

  if (isNaN(shardNum)) {
    return new Response("403: INVALID_SHARD", { status: 403 });
  }

  const shardId =
    shardNum >= 1 && shardNum <= 9
      ? shardNum.toString().padStart(2, "0")
      : shardNum.toString();

  /* =========================
     6. DETERMINE VIDEO ID
     ========================= */

  let videoId;

  // m3u8
  if (isM3u8) {
    videoId = pathname.slice(0, -5);
  }

  // png (index + indexXXXXX)
  else if (isPng) {
    const match = pathname.match(/^(tv-\d+-\d+-\d+)-index/i);
    if (!match) {
      return new Response("403: INVALID_PNG_NAME", { status: 403 });
    }
    videoId = match[1];
  }

  else {
    return new Response("403: FILE_NOT_ALLOWED", { status: 403 });
  }

  /* =========================
     7. ORIGIN URL
     ========================= */

  const originUrl =
    `https://${videoId}.x${shardId}-anisrc-top.pages.dev/${pathname}`;

  /* =========================
     8. FETCH ORIGIN
     ========================= */

  const originRes = await fetch(originUrl);
  if (!originRes.ok) {
    return new Response(
      `404: ORIGIN_NOT_FOUND (${originRes.status})`,
      { status: originRes.status }
    );
  }

  /* =========================
     9. RESPONSE + CACHE
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
