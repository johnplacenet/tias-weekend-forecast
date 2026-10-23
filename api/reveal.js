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

function pickPhoto(photos) {
  if (!photos.length) return null;
  return photos[Math.floor(Math.random() * photos.length)];
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
    const fallback = pickPhoto(forecast.senderPhotos || []);
    const partner = pickPhoto(forecast.recipientPhotos || []);
    const usage = await usageFor(forecast.slug).catch(() => ({ day: "", count: DAILY_PORTRAITS, all: null }));
    let photo = fallback ? { src: fallback.src, focus: fallback.focus || "center 30%", generated: false } : null;
    if (fallback && usage.count < DAILY_PORTRAITS) {
      try {
        const portrait = await generatePortrait(
          forecast.senderName,
          fallback.src,
          body.answers || {},
          forecast.recipientName,
          partner?.src || ""
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
            alt: partner ? `${forecast.senderName} and ${forecast.recipientName}` : forecast.senderName
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
