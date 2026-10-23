import { clearCookie, json } from "../lib/server.js";

export default function handler(req, res) {
  res.setHeader("set-cookie", clearCookie());
  json(res, 200, { ok: true });
}
