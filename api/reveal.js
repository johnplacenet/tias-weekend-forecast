import {
  DAILY_PORTRAITS,
  generatePortrait,
  getForecast,
  json,
  publicContact,
  markUsage,
  readBody,
  storeImage,
  usageFor
} from "../lib/server.js";

export const config = { maxDuration: 60 };

function identityPhotos(photos, count) {
  return (photos || []).filter((photo) => photo && photo.src).slice(0, count);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    json(res, 405, { error: "Use POST." });
    return;
  }
  try {
    const body = await readBody(req);
    const forecast = await getForecast(body.slug || "tia", body.account || "");
    if (!forecast) {
      json(res, 404, { error: "That forecast is not ready." });
      return;
    }
    const senderPhotos = identityPhotos(forecast.senderPhotos, 2);
    const recipientPhotos = identityPhotos(forecast.recipientPhotos, 2);
    const fallback = senderPhotos[0] || null;
    const usageKey = `${forecast.account || "date"}/${forecast.slug}`;
    const usage = await usageFor(usageKey).catch(() => ({ day: "", count: DAILY_PORTRAITS, all: null }));
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
            src = await storeImage(`${forecast.account || "date"}/${forecast.slug}`, "portrait", portrait.buffer, portrait.contentType);
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
          if (usage.all) await markUsage(usageKey, usage).catch(() => {});
        }
      } catch (error) {
        photo = { src: fallback.src, focus: fallback.focus || "center 30%", generated: false };
      }
    }
    json(res, 200, {
      senderName: forecast.senderName,
      recipientGender: forecast.recipientGender === "man" ? "man" : "woman",
      contact: publicContact(forecast),
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
