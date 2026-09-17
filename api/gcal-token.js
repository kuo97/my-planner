// 구글 캘린더 토큰 교환/갱신 — 비밀키는 Vercel 환경변수(GOOGLE_CLIENT_SECRET)에만 존재.
// 프론트(index.html)는 이 함수를 호출하고, 브라우저에는 client_secret 이 절대 내려가지 않는다.
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  const secret = process.env.GOOGLE_CLIENT_SECRET;
  const clientId = process.env.GOOGLE_CLIENT_ID || "603542528567-cmma9t897a1uchcgov1uv0ab7qu75pje.apps.googleusercontent.com";
  if (!secret) return res.status(500).json({ error: "server_not_configured", error_description: "GOOGLE_CLIENT_SECRET 환경변수 없음" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  const params = new URLSearchParams({ client_id: clientId, client_secret: secret });
  if (body.code) {
    params.set("code", body.code);
    params.set("grant_type", "authorization_code");
    params.set("redirect_uri", body.redirect_uri || "https://my-planner-fawn-nine.vercel.app/");
  } else if (body.refresh_token) {
    params.set("refresh_token", body.refresh_token);
    params.set("grant_type", "refresh_token");
  } else {
    return res.status(400).json({ error: "bad_request", error_description: "code 또는 refresh_token 필요" });
  }

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const data = await r.json().catch(() => ({}));
  return res.status(r.status).json(data);
}
