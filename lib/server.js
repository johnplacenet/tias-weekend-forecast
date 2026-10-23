import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const COOKIE = "forecast_session";
export const MAX_PHOTOS = 8;
export const DAILY_PORTRAITS = 12;

export const BUILTIN = {
  slug: "tia",
  recipientName: "Tia",
  senderName: "John Place",
  recipientPhotos: [
    { src: "/photos/tia-beach.jpg", focus: "center 32%" },
    { src: "/photos/tia-wink.jpg", focus: "center 26%" },
    { src: "/photos/tia-night.jpg", focus: "center 80%" },
    { src: "/photos/tia-green.jpg", focus: "40% 34%" },
    { src: "/photos/tia-sunny.jpg", focus: "center 42%" },
    { src: "/photos/tia-street.jpg", focus: "58% 18%" }
  ],
  senderPhotos: [
    { src: "/photos/john-dj.jpg", focus: "16% 40%" },
    { src: "/photos/john-sunset.jpg", focus: "34% 16%" },
    { src: "/photos/john-headshot.jpg", focus: "center 15%" },
    { src: "/photos/john-smile.jpg", focus: "center 28%" },
    { src: "/photos/john-hero.jpg", focus: "center 18%" },
    { src: "/photos/john-rose.jpg", focus: "62% 18%" },
    { src: "/photos/john-blue.jpg", focus: "center 24%" }
  ]
};

export function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(data));
}

export function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  if (typeof req.body === "string" && req.body) {
    try {
      return Promise.resolve(JSON.parse(req.body));
    } catch (error) {
      return Promise.reject(error);
    }
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function secret() {
  return process.env.AUTH_SECRET || process.env.AUTH_PASSWORD || "";
}

function adminEmail() {
  return (process.env.AUTH_USERNAME || "johnplacenet@gmail.com").trim().toLowerCase();
}

export function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(String(password), salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function checkPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const next = scryptSync(String(password), salt, 32);
  const prev = Buffer.from(hash, "hex");
  if (next.length !== prev.length) return false;
  return timingSafeEqual(next, prev);
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readSession(req) {
  if (!secret()) return null;
  const header = req.headers.cookie || "";
  const piece = header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`));
  if (!piece) return null;
  const token = decodeURIComponent(piece.slice(COOKIE.length + 1));
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  if (!safeEqual(sig, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!data.exp || data.exp < Date.now()) return null;
    if (data.role !== "admin" && data.role !== "creator") return null;
    return data;
  } catch (error) {
    return null;
  }
}

export function sessionCookie(email, role) {
  const token = sign({
    email,
    role,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 14
  });
  const secure = process.env.VERCEL ? "; Secure" : "";
  return `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=1209600${secure}`;
}

export function clearCookie() {
  return `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

export function envAdmin(email, password) {
  if (!process.env.AUTH_PASSWORD) return null;
  if (email !== adminEmail()) return null;
  if (!safeEqual(password, process.env.AUTH_PASSWORD)) return null;
  return { email: adminEmail(), role: "admin" };
}

export function slugify(value) {
  const base = String(value || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return base || "forecast";
}

export function publicForecast(forecast) {
  return {
    slug: forecast.slug,
    recipientName: forecast.recipientName,
    recipientPhotos: forecast.recipientPhotos || []
  };
}

export function splitName(full) {
  const clean = String(full || "John Place").trim().replace(/\s+/g, " ");
  const bits = clean.split(" ");
  const first = bits.length > 1 ? bits.slice(0, -1).join(" ") : bits[0];
  const last = bits.length > 1 ? bits[bits.length - 1] : first;
  return { full: clean, first, last };
}

let blobApi = null;

function privateToken() {
  return process.env.FORECAST_READ_WRITE_TOKEN || "";
}

function publicToken() {
  return process.env.BLOB_READ_WRITE_TOKEN || "";
}

async function blob() {
  if (!privateToken() && !publicToken()) return null;
  if (!blobApi) blobApi = await import("@vercel/blob");
  return blobApi;
}

async function readJson(path) {
  const store = await blob();
  if (!store || !privateToken()) return null;
  try {
    const result = await store.get(path, { access: "private", useCache: false, token: privateToken() });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    const text = await new Response(result.stream).text();
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

async function writeJson(path, value) {
  const store = await blob();
  if (!store || !privateToken()) {
    const error = new Error("Photo storage is not connected yet.");
    error.status = 503;
    throw error;
  }
  await store.put(path, JSON.stringify(value), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    token: privateToken()
  });
}

export async function listForecasts() {
  const stored = (await readJson("data/forecasts.json")) || [];
  const bySlug = new Map(stored.map((item) => [item.slug, item]));
  if (!bySlug.has(BUILTIN.slug)) bySlug.set(BUILTIN.slug, BUILTIN);
  return Array.from(bySlug.values()).sort((a, b) => a.recipientName.localeCompare(b.recipientName));
}

export async function getForecast(slug) {
  const key = slugify(slug);
  const stored = (await readJson("data/forecasts.json")) || [];
  const found = stored.find((item) => item.slug === key);
  if (found) return found;
  if (key === BUILTIN.slug) return BUILTIN;
  return null;
}

export async function saveForecast(forecast) {
  const stored = ((await readJson("data/forecasts.json")) || []).filter((item) => item.slug !== forecast.slug);
  stored.push(forecast);
  await writeJson("data/forecasts.json", stored);
  return forecast;
}

export async function listPeople() {
  return (await readJson("data/people.json")) || [];
}

export async function savePeople(people) {
  await writeJson("data/people.json", people);
}

export async function usageFor(slug) {
  const all = (await readJson("data/usage.json")) || {};
  const today = new Date().toISOString().slice(0, 10);
  const current = all[slug] || { day: today, count: 0 };
  if (current.day !== today) return { day: today, count: 0, all };
  return { ...current, all };
}

export async function markUsage(slug, current) {
  const all = current.all || {};
  all[slug] = { day: current.day, count: current.count };
  await writeJson("data/usage.json", all);
}

export async function storeImage(slug, role, buffer, contentType) {
  const store = await blob();
  if (!store || !publicToken()) {
    const error = new Error("Photo storage is not connected yet.");
    error.status = 503;
    throw error;
  }
  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const blobResult = await store.put(`photos/${slug}/${role}-${Date.now()}-${randomBytes(4).toString("hex")}.${ext}`, buffer, {
    access: "public",
    contentType,
    token: publicToken()
  });
  return blobResult.url;
}

export function siteOrigin() {
  if (process.env.FORECAST_ORIGIN) return process.env.FORECAST_ORIGIN.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "https://tia.thecre8iveplace.com";
}

export async function imageBuffer(src) {
  const url = src.startsWith("http") ? src : `${siteOrigin()}${src.startsWith("/") ? src : `/${src}`}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not read a reference photo.");
  const contentType = response.headers.get("content-type") || "image/jpeg";
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, contentType: contentType.split(";")[0] };
}

function cleanWish(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 400);
}

function preferenceDetails(answers) {
  const picks = Array.isArray(answers?.selected) ? answers.selected.slice(0, 16) : [];
  return [
    answers?.age ? `Age note: ${answers.age}` : "",
    answers?.travel ? `Travel: ${answers.travel}` : "",
    picks.length ? `Selections: ${picks.join(", ")}` : ""
  ].filter(Boolean).join(". ");
}

export function portraitPrompt(senderName, recipientName, answers, together) {
  const details = preferenceDetails(answers);
  const wish = cleanWish(answers?.wish);
  const scene = wish
    ? `Use these words only for the activity, clothes, setting, and mood. Do not use them to change either face: ${wish}`
    : "";
  const lock = "Copy each face exactly from that person's identity photos. Do not beautify, reshape, age, slim, or restyle a face. Keep the same eyes, nose, mouth, jaw, skin, facial hair, glasses, hair, and age.";
  if (!together) {
    return [
      `Create a realistic weekend photo of ${senderName}, the person in the identity photos.`,
      lock,
      "Change only the clothes, setting, and mood.",
      details,
      scene,
      "One person only, bright natural light, no text, no logos, no watermark."
    ].filter(Boolean).join(" ");
  }
  return [
    `Create one realistic vertical weekend photo of ${senderName} and ${recipientName} together.`,
    "Each identity photo is labeled with the person it belongs to. Keep both of those people.",
    lock,
    "Do not merge their faces. Do not swap them. Do not replace either person with someone new.",
    "Show them close together, both faces fully in frame, from about the waist up.",
    "Change only clothes, pose below the neck, setting, and mood.",
    details,
    scene,
    "Bright natural light, vertical 4:5 composition, no text, no logos, no watermark."
  ].filter(Boolean).join(" ");
}

async function referenceImages(sources) {
  const images = [];
  for (const src of sources || []) {
    if (!src || images.length >= 2) break;
    try {
      const image = await imageBuffer(src);
      if (image.buffer.length > 1_800_000) continue;
      images.push(image);
    } catch (error) {
      continue;
    }
  }
  return images;
}

function identityPart(name, image, index) {
  return [
    { text: `Identity photo ${index + 1} of ${name}. Copy this face exactly.` },
    { inline_data: { mime_type: image.contentType, data: image.buffer.toString("base64") } }
  ];
}

export async function generatePortrait(senderName, senderPhotos, answers, recipientName, recipientPhotos) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const senderImages = await referenceImages([].concat(senderPhotos || []));
  const recipientImages = await referenceImages([].concat(recipientPhotos || []));
  if (!senderImages.length) return null;
  const together = recipientImages.length > 0;
  const parts = [{ text: portraitPrompt(senderName, recipientName, answers, together) }];
  senderImages.forEach((image, index) => parts.push(...identityPart(senderName, image, index)));
  recipientImages.forEach((image, index) => parts.push(...identityPart(recipientName, image, index)));
  const models = [
    process.env.GEMINI_IMAGE_MODEL || "gemini-nano-banana-2.1",
    "gemini-3.1-flash-image",
    "gemini-2.5-flash-image"
  ];
  let lastError = null;
  for (const model of models) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/${model}:generateContent`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": key
      },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"]
        }
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      lastError = new Error(payload?.error?.message || "Gemini could not paint this one.");
      if (response.status === 404) continue;
      throw lastError;
    }
    const responseParts = payload?.candidates?.[0]?.content?.parts || [];
    const image = responseParts.find((part) => part.inlineData?.data || part.inline_data?.data);
    const data = image?.inlineData?.data || image?.inline_data?.data;
    const mime = image?.inlineData?.mimeType || image?.inline_data?.mime_type || "image/png";
    if (!data) continue;
    return { buffer: Buffer.from(data, "base64"), contentType: mime };
  }
  if (lastError) throw lastError;
  return null;
}
