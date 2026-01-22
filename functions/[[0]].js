const ALLOWED_ROOT_DOMAIN = "anisrc.top";
const HOST_RE = /^x([0-9]{2})\.anisrc\.top$/i;

export async function onRequest(context) {
  const { request } = context;
  const cache = caches.default;

  const cached = await cache.match(request);
  if (cached) return cached;

  const url = new URL(request.url);
  const pathname = url.pathname.replace(/^\/+/, "");
  const lower = pathname.toLowerCase();

  /* =========================
     REFERER CHECK
     ========================= */

  const referer = request.headers.get("Referer");
  if (!referer) {
    return Response.redirect(
      "https://www.youtube.com/watch?v=Kq9_r9l8MpI",
      302
    );
  }

  let refHost;
  try {
    refHost = new URL(referer).hostname;
  } catch {
    return new Response("Invalid referer", { status: 403 });
  }

  if (
    refHost !== ALLOWED_ROOT_DOMAIN &&
    !refHost.endsWith("." + ALLOWED_ROOT_DOMAIN)
  ) {
    return new Response("Hotlink denied", { status: 403 });
  }

  /* =========================
     HOST CHECK
     ========================= */

  if (!HOST_RE.test(url.hostname)) {
    return new Response("Invalid host", { status: 403 });
  }

  /* =========================
     INDEX REDIRECT
     ========================= */

  if (lower === "index.html") {
    return Response.redirect("https://anisrc.top/", 302);
  }

  /* =========================
     SHARD ID (từ pathname)
     ========================= */

  const parts = pathname.split("-");
  const shardNum = parseInt(parts[parts.length - 1], 10);
  if (isNaN(shardNum)) {
    return new Response("Invalid shard", { status: 403 });
  }

  const shardId =
    shardNum >= 1 && shardNum <= 9
      ? shardNum.toString().padStart(2, "0")
      : shardNum.toString();

  let videoId;

  /* =========================
     M3U8
     ========================= */

  if (lower.endsWith(".m3u8")) {
    videoId = pathname.slice(0, -5);
  }

  /* =========================
     PNG (index + indexXXXXX)
     ========================= */

  else if (lower.endsWith(".png")) {
    const match = pathname.match(/^(tv-\d+-\d+-\d+)-index/i);
    if (!match) {
      return new Response("Invalid preview image", { status: 403 });
    }
    videoId = match[1];
  }

  else {
    return new Response("File not allowed", { status: 403 });
  }

  /* =========================
     ORIGIN URL
     ========================= */

  const originUrl =
    `https://${videoId}.x${shardId}-anisrc-top.pages.dev/${pathname}`;

  const originRes = await fetch(originUrl);
  if (!originRes.ok) {
    return new Response("File not found", {
      status: originRes.status
    });
  }

  const res = new Response(originRes.body, originRes);
  res.headers.set(
    "Cache-Control",
    "public, max-age=31536000, immutable"
  );
  res.headers.set("X-Content-Type-Options", "nosniff");

  await cache.put(request, res.clone());
  return res;
}
