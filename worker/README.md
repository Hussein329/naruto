# HabitWell unlock verifier

A small Cloudflare Worker that turns "Shopify says this order is paid" into
"unlock this tier" — without trusting anything the browser claims on its own.

## How it fits together

1. Customer clicks **Buy** on the site → goes to Shopify checkout.
2. Shopify's `orders/paid` webhook calls `POST /webhook/orders-paid` on this
   Worker. The Worker verifies Shopify's signature, reads the paid line
   item's SKU (`basic` / `premium` / `deluxe`), and stores
   `order ID → tier` in KV.
3. Shopify's Order status page script (added in Shopify admin) redirects the
   customer back to the site with `?order=<id>`.
4. The site calls `GET /api/check-unlock?order=<id>` on this Worker. Only if
   the Worker confirms that order was really paid does the page unlock.

## One-time setup

Requires a free Cloudflare account and `npm install -g wrangler` (or `npx wrangler`).

```bash
cd worker
wrangler login

# 1. Create the KV namespace that stores paid orders
wrangler kv namespace create UNLOCKS
# → paste the returned "id" into wrangler.toml

# 2. Set secrets (never commit these)
wrangler secret put SHOPIFY_WEBHOOK_SECRET   # from step 4 below
wrangler secret put ALLOWED_ORIGIN            # e.g. https://yourname.github.io

# 3. Deploy
wrangler deploy
# → note the printed URL, e.g. https://habitwell-unlock.yoursubdomain.workers.dev
```

## In Shopify admin

1. **Products**: when creating Basic/Premium/Deluxe, set each product's
   variant **SKU** to exactly `basic`, `premium`, or `deluxe`.
2. **Webhook**: Settings → Notifications → Webhooks → Create webhook.
   - Event: `Order payment` (`orders/paid`)
   - Format: JSON
   - URL: `https://<your-worker-url>/webhook/orders-paid`
   - Copy the signing secret shown once — that's `SHOPIFY_WEBHOOK_SECRET` above.
3. **Order status page redirect**: Settings → Checkout → Order status page →
   Additional scripts. Paste:

   ```html
   <script>
     (function () {
       var orderId = {{ checkout.order_id | json }};
       var siteUrl = "https://YOUR-SITE-URL"; // e.g. https://yourname.github.io/naruto
       if (orderId) {
         window.location.href = siteUrl + "/?order=" + orderId + "#app";
       }
     })();
   </script>
   ```

## Then, in `index.html`

Set `HABITWELL_API` (search for it near the Shopify config block) to your
deployed Worker URL. Until that's set, the site falls back to the
lighter-weight `?unlocked=` redirect with a console warning — good enough to
develop against, not enough to trust for real money.
