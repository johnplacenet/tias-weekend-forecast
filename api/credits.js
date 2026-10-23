import { PACKS, creditBalance, grantCredits, json, paymentsLive, readBody, readSession } from "../lib/server.js";

export default async function handler(req, res) {
  const session = readSession(req);
  if (!session) {
    json(res, 401, { error: "Sign in to see your dates." });
    return;
  }
  if (req.method === "GET") {
    json(res, 200, {
      balance: await creditBalance(session.email),
      payments: paymentsLive(),
      packs: PACKS.map((pack) => ({ id: pack.id, label: pack.label, price: pack.price, credits: pack.credits }))
    });
    return;
  }
  if (req.method !== "POST") {
    json(res, 405, { error: "Use GET or POST." });
    return;
  }
  if (session.role !== "admin") {
    json(res, 403, { error: "Only an admin can give dates." });
    return;
  }
  try {
    const body = await readBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const count = Math.floor(Number(body.count) || 0);
    if (!email.includes("@") || count < 1 || count > 50) {
      json(res, 400, { error: "Add an email and between 1 and 50 dates." });
      return;
    }
    const balance = await grantCredits(email, count, "");
    json(res, 200, { email, balance });
  } catch (error) {
    json(res, 500, { error: "Those dates could not be added." });
  }
}
