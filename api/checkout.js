import Stripe from "stripe";
import { PACKS, json, paymentsLive, readBody, readSession } from "../lib/server.js";

function requestOrigin(req) {
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "");
  const proto = String(req.headers["x-forwarded-proto"] || "https");
  if (host && !host.endsWith("vercel.app")) return `${proto}://${host.split(",")[0].trim()}`;
  return "https://date.thecre8iveplace.com";
}

const INTEGRATION = "perfect-date-credits-krmqbwzt";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    json(res, 405, { error: "Use POST." });
    return;
  }
  const session = readSession(req);
  if (!session) {
    json(res, 401, { error: "Sign in to buy dates." });
    return;
  }
  if (!paymentsLive()) {
    json(res, 503, { error: "Card payments are not connected yet." });
    return;
  }
  try {
    const body = await readBody(req);
    const pack = PACKS.find((item) => item.id === body.pack);
    if (!pack) {
      json(res, 400, { error: "Choose 1, 5, or 10 dates." });
      return;
    }
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2026-09-30.endive" });
    const origin = requestOrigin(req);
    const checkout = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: session.email,
      client_reference_id: session.email,
      metadata: {
        email: session.email,
        pack: pack.id,
        credits: String(pack.credits)
      },
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: pack.amount,
          product_data: {
            name: `${pack.label} on The Perfect Date`,
            description: "Each date is one person you can send a link to."
          }
        }
      }],
      success_url: `${origin}/studio?credits=bought`,
      cancel_url: `${origin}/studio?credits=cancel`,
      integration_identifier: INTEGRATION
    });
    json(res, 200, { url: checkout.url });
  } catch (error) {
    json(res, 500, { error: "The payment page could not be opened." });
  }
}
