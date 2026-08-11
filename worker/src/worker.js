const TIER_SKUS = ["basic", "premium", "deluxe"];

async function verifyShopifyHmac(rawBody, hmacHeader, secret) {
  if (!hmacHeader) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const computed = btoa(String.fromCharCode(...new Uint8Array(signature)));
  if (computed.length !== hmacHeader.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ hmacHeader.charCodeAt(i);
  return diff === 0;
}

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

async function handleWebhook(request, env) {
  const hmacHeader = request.headers.get("X-Shopify-Hmac-Sha256");
  const rawBody = await request.text();

  const valid = await verifyShopifyHmac(rawBody, hmacHeader, env.SHOPIFY_WEBHOOK_SECRET);
  if (!valid) return new Response("Invalid signature", { status: 401 });

  const order = JSON.parse(rawBody);
  const orderId = String(order.id);
  const lineItems = Array.isArray(order.line_items) ? order.line_items : [];

  const paidTier = lineItems
    .map((item) => (item.sku || "").trim().toLowerCase())
    .find((sku) => TIER_SKUS.includes(sku));

  if (!paidTier) {
    // Order paid, but no line item matches a known tier SKU — nothing to unlock.
    return new Response("OK (no matching tier)", { status: 200 });
  }

  await env.UNLOCKS.put(
    "order:" + orderId,
    JSON.stringify({ tier: paidTier, paidAt: new Date().toISOString() }),
    { expirationTtl: 60 * 60 * 24 * 365 } // 1 year
  );

  return new Response("OK", { status: 200 });
}

async function handleCheckUnlock(request, env) {
  const url = new URL(request.url);
  const orderId = url.searchParams.get("order");
  const headers = { ...corsHeaders(env), "Content-Type": "application/json" };

  if (!orderId) {
    return new Response(JSON.stringify({ unlocked: false, error: "missing order" }), { status: 400, headers });
  }

  const record = await env.UNLOCKS.get("order:" + orderId);
  if (!record) {
    return new Response(JSON.stringify({ unlocked: false }), { status: 200, headers });
  }

  const { tier, paidAt } = JSON.parse(record);
  return new Response(JSON.stringify({ unlocked: true, tier, paidAt }), { status: 200, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(env) });
    }
    if (request.method === "POST" && url.pathname === "/webhook/orders-paid") {
      return handleWebhook(request, env);
    }
    if (request.method === "GET" && url.pathname === "/api/check-unlock") {
      return handleCheckUnlock(request, env);
    }
    return new Response("Not found", { status: 404 });
  },
};
