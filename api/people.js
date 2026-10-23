import {
  hashPassword,
  json,
  listPeople,
  readBody,
  readSession,
  savePeople
} from "../lib/server.js";

const ROLES = new Set(["admin", "creator"]);

export default async function handler(req, res) {
  const session = readSession(req);
  if (!session) {
    json(res, 401, { error: "Sign in first." });
    return;
  }
  if (session.role !== "admin") {
    json(res, 403, { error: "Only an admin can add people." });
    return;
  }
  if (req.method === "GET") {
    const people = await listPeople();
    json(res, 200, {
      people: people.map((person) => ({ email: person.email, role: person.role }))
    });
    return;
  }
  if (req.method !== "POST") {
    json(res, 405, { error: "Use GET or POST." });
    return;
  }
  try {
    const body = await readBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const role = String(body.role || "creator");
    const password = String(body.password || "");
    if (!email.includes("@") || password.length < 8 || !ROLES.has(role)) {
      json(res, 400, { error: "Use a real email, a role, and a password of at least 8 characters." });
      return;
    }
    const people = await listPeople();
    const next = people.filter((person) => person.email !== email);
    next.push({ email, role, passwordHash: hashPassword(password) });
    await savePeople(next);
    json(res, 200, { email, role });
  } catch (error) {
    json(res, error.status || 500, { error: error.message || "Could not add that person." });
  }
}
