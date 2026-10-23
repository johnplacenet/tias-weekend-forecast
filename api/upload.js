import {
  MAX_PHOTOS,
  canManageForecast,
  getForecast,
  json,
  readBody,
  readSession,
  saveForecast,
  storeImage
} from "../lib/server.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    json(res, 405, { error: "Use POST." });
    return;
  }
  const session = readSession(req);
  if (!session) {
    json(res, 401, { error: "Sign in to add photos." });
    return;
  }
  try {
    const body = await readBody(req);
    const slug = String(body.slug || "");
    const role = body.role === "sender" ? "sender" : "recipient";
    const forecast = await getForecast(slug);
    if (!forecast) {
      json(res, 404, { error: "Save the forecast before adding photos." });
      return;
    }
    if (!canManageForecast(forecast, session)) {
      json(res, 403, { error: "That forecast belongs to someone else." });
      return;
    }
    const match = String(body.data || "").match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) {
      json(res, 400, { error: "Use a JPG, PNG, or WebP photo." });
      return;
    }
    const buffer = Buffer.from(match[2], "base64");
    if (buffer.length > 2_500_000) {
      json(res, 400, { error: "That photo is over 2.5 MB. Use a smaller one." });
      return;
    }
    const key = role === "sender" ? "senderPhotos" : "recipientPhotos";
    const photos = forecast[key] || [];
    if (photos.length >= MAX_PHOTOS) {
      json(res, 400, { error: `Use up to ${MAX_PHOTOS} photos.` });
      return;
    }
    const url = await storeImage(forecast.slug, role, buffer, match[1]);
    photos.push({ src: url, focus: "center 30%" });
    forecast[key] = photos;
    forecast.updatedAt = new Date().toISOString();
    await saveForecast(forecast);
    json(res, 200, { src: url, count: photos.length });
  } catch (error) {
    json(res, error.status || 500, { error: error.message || "Could not save that photo." });
  }
}
