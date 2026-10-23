import { json, readSession } from "../lib/server.js";

export default function handler(req, res) {
  const session = readSession(req);
  if (!session) {
    json(res, 200, { signedIn: false });
    return;
  }
  json(res, 200, { signedIn: true, email: session.email, role: session.role });
}
