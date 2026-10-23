import {
  BUILTIN,
  json,
  listForecasts,
  readBody,
  readSession,
  saveForecast,
  slugify
} from "../lib/server.js";

function summary(forecast) {
  return {
    slug: forecast.slug,
    recipientName: forecast.recipientName,
    senderName: forecast.senderName,
    recipientCount: (forecast.recipientPhotos || []).length,
    senderCount: (forecast.senderPhotos || []).length,
    link: forecast.slug === "tia" ? "/" : `/f/${forecast.slug}`
  };
}

export default async function handler(req, res) {
  const session = readSession(req);
  if (!session) {
    json(res, 401, { error: "Sign in to make a forecast." });
    return;
  }
  if (req.method === "GET") {
    const forecasts = await listForecasts();
    json(res, 200, { forecasts: forecasts.map(summary) });
    return;
  }
  if (req.method !== "POST") {
    json(res, 405, { error: "Use GET or POST." });
    return;
  }
  try {
    const body = await readBody(req);
    const recipientName = String(body.recipientName || "").trim().replace(/\s+/g, " ").slice(0, 40);
    const senderName = String(body.senderName || "John Place").trim().replace(/\s+/g, " ").slice(0, 40);
    if (!recipientName || !senderName) {
      json(res, 400, { error: "Add both names." });
      return;
    }
    let slug = slugify(body.slug || recipientName);
    const existing = await listForecasts();
    if (slug !== BUILTIN.slug && existing.some((item) => item.slug === slug)) {
      slug = `${slug}-${existing.length + 1}`.slice(0, 48);
    }
    const prior = existing.find((item) => item.slug === slug);
    const forecast = {
      slug,
      recipientName,
      senderName,
      recipientPhotos: prior?.recipientPhotos || [],
      senderPhotos: prior?.senderPhotos || [],
      updatedAt: new Date().toISOString()
    };
    await saveForecast(forecast);
    json(res, 200, summary(forecast));
  } catch (error) {
    json(res, error.status || 500, { error: error.message || "Could not save that forecast." });
  }
}
