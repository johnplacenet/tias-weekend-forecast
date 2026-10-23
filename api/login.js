import { envAdmin, json, listPeople, readBody, sessionCookie, checkPassword } from "../lib/server.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    json(res, 405, { error: "Use POST." });
    return;
  }
  try {
    const body = await readBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const admin = envAdmin(email, password);
    if (admin) {
      res.setHeader("set-cookie", sessionCookie(admin.email, admin.role));
      json(res, 200, { email: admin.email, role: admin.role });
      return;
    }
    const people = await listPeople().catch(() => []);
    const person = people.find((item) => item.email === email);
    if (!person || !checkPassword(password, person.passwordHash)) {
      json(res, 401, { error: "That email and password did not match." });
      return;
    }
    res.setHeader("set-cookie", sessionCookie(person.email, person.role));
    json(res, 200, { email: person.email, role: person.role });
  } catch (error) {
    json(res, 400, { error: "Sign-in needs an email and a password." });
  }
}
