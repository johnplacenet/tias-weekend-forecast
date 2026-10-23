import Stripe from "stripe";
import { grantCredits, json, paymentsLive } from "../lib/server.js";

export const config = { api: { bodyParser: false } };

function rawBody(req) {
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  if (typeof req.body === "string") return Promise.resolve(Buffer.from(req.body));
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function fulfill(checkout) {
  if (!checkout || checkout.payment_status === "unpaid") return;
  const email = checkout.metadata?.email || checkout.client_reference_id || "";
  const credits = Number(checkout.metadata?.credits || 0);
  if (!email || credits < 1) return;
  await grantCredits(email, credits, checkout.id);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    json(res, 405, { error: "Use POST." });
    return;
  }
  if (!paymentsLive() || !process.env.STRIPE_WEBHOOK_SECRET) {
    json(res, 503, { error: "Payments are not connected yet." });
    return;
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2026-09-30.endive" });
  let event;
  try {
    const payload = await rawBody(req);
    event = stripe.webhooks.constructEvent(payload, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    json(res, 400, { error: "The payment notice could not be verified." });
    return;
  }
  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      await fulfill(event.data.object);
    }
    json(res, 200, { received: true });
  } catch (error) {
    json(res, 500, { error: "The dates could not be added." });
  }
}
