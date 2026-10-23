import {
  accountSlug,
  canManageForecast,
  json,
  listForecasts,
  readBody,
  readSession,
  saveForecast,
  slugify
} from "../lib/server.js";

function summary(forecast) {
  const account = accountSlug(forecast);
  return {
    account,
    slug: forecast.slug,
    recipientName: forecast.recipientName,
    senderName: forecast.senderName,
    recipientCount: (forecast.recipientPhotos || []).length,
    senderCount: (forecast.senderPhotos || []).length,
    link: `/f/${account}/${forecast.slug}`
  };
}

function openSlug(base, existing, account) {
  let slug = base;
  let count = 2;
  while (existing.some((item) => item.slug === slug && accountSlug(item) === account)) {
    slug = `${base}-${count}`.slice(0, 48);
    count += 1;
  }
  return slug;
}

export default async function handler(req, res) {
  const session = readSession(req);
  if (!session) {
    json(res, 401, { error: "Sign in to make a forecast." });
    return;
  }
  if (req.method === "GET") {
    const forecasts = await listForecasts();
    const visible = forecasts.filter((item) => canManageForecast(item, session));
    json(res, 200, { forecasts: visible.map(summary) });
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
    const account = accountSlug(session.email);
    let slug = slugify(body.slug || recipientName);
    const existing = await listForecasts();
    let prior = existing.find((item) => item.slug === slug && accountSlug(item) === account && canManageForecast(item, session));
    if (!prior) slug = openSlug(slug, existing, account);
    const forecast = {
      slug,
      account,
      owner: prior?.owner || session.email,
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
