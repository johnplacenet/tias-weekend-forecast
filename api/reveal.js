import {
  DAILY_PORTRAITS,
  generatePortrait,
  getForecast,
  json,
  markUsage,
  readBody,
  storeImage,
  usageFor
} from "../lib/server.js";

export const config = { maxDuration: 60 };

function pickPhotos(photos, count) {
  const pool = (photos || []).filter((photo) => photo && photo.src);
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    const held = pool[index];
    pool[index] = pool[swap];
    pool[swap] = held;
  }
  return pool.slice(0, count);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    json(res, 405, { error: "Use POST." });
    return;
  }
  try {
    const body = await readBody(req);
    const forecast = await getForecast(body.slug || "tia");
    if (!forecast) {
      json(res, 404, { error: "That forecast is not ready." });
      return;
    }
    const senderPhotos = pickPhotos(forecast.senderPhotos, 2);
    const recipientPhotos = pickPhotos(forecast.recipientPhotos, 2);
    const fallback = senderPhotos[0] || null;
    const usage = await usageFor(forecast.slug).catch(() => ({ day: "", count: DAILY_PORTRAITS, all: null }));
    let photo = fallback ? { src: fallback.src, focus: fallback.focus || "center 30%", generated: false } : null;
    if (fallback && usage.count < DAILY_PORTRAITS) {
      try {
        const portrait = await generatePortrait(
          forecast.senderName,
          senderPhotos.map((item) => item.src),
          body.answers || {},
          forecast.recipientName,
          recipientPhotos.map((item) => item.src)
        );
        if (portrait) {
          let src = `data:${portrait.contentType};base64,${portrait.buffer.toString("base64")}`;
          try {
            src = await storeImage(forecast.slug, "portrait", portrait.buffer, portrait.contentType);
          } catch (error) {
            src = `data:${portrait.contentType};base64,${portrait.buffer.toString("base64")}`;
          }
          photo = {
            src,
            focus: "center 35%",
            generated: true,
            alt: recipientPhotos.length ? `${forecast.senderName} and ${forecast.recipientName}` : forecast.senderName
          };
          usage.count += 1;
          if (usage.all) await markUsage(forecast.slug, usage).catch(() => {});
        }
      } catch (error) {
        photo = { src: fallback.src, focus: fallback.focus || "center 30%", generated: false };
      }
    }
    json(res, 200, {
      senderName: forecast.senderName,
      photo: photo ? {
        src: photo.src,
        focus: photo.focus || "center 30%",
        generated: Boolean(photo.generated),
        alt: photo.alt || ""
      } : null
    });
  } catch (error) {
    json(res, 400, { error: "The forecast could not be painted." });
  }
}
