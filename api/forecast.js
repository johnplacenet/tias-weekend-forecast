import { getForecast, json, publicForecast, slugify } from "../lib/server.js";

export default async function handler(req, res) {
  const url = new URL(req.url, "https://tia.thecre8iveplace.com");
  const slug = slugify(url.searchParams.get("slug") || "tia");
  const forecast = await getForecast(slug);
  if (!forecast) {
    json(res, 404, { error: "That forecast is not ready." });
    return;
  }
  json(res, 200, publicForecast(forecast));
}
