import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { UserError } from "./errors";

// Product images live on disk in UPLOAD_DIR (include it in backups) and are
// served by app/uploads/products/[file]/route.ts to logged-in users.

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const TYPES = {
  "image/jpeg": { ext: "jpg", magic: [0xff, 0xd8, 0xff] },
  "image/png": { ext: "png", magic: [0x89, 0x50, 0x4e, 0x47] },
  "image/webp": { ext: "webp", magic: [0x52, 0x49, 0x46, 0x46] },
} as const;

const FILE_NAME = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;
const URL_PREFIX = "/uploads/products/";

function productsDir() {
  return path.resolve(process.env.UPLOAD_DIR ?? "uploads", "products");
}

export async function saveProductImage(file: File): Promise<string> {
  const type = TYPES[file.type as keyof typeof TYPES];
  if (!type) throw new UserError("Use a JPG, PNG or WebP image");
  if (file.size > MAX_IMAGE_BYTES) throw new UserError("The image must be 2 MB or smaller");

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!type.magic.every((byte, index) => bytes[index] === byte)) {
    throw new UserError("This file is not a valid image");
  }

  const name = `${randomUUID()}.${type.ext}`;
  await mkdir(productsDir(), { recursive: true });
  await writeFile(path.join(productsDir(), name), bytes);
  return `${URL_PREFIX}${name}`;
}

export async function deleteProductImage(url: string | null) {
  const name = url?.startsWith(URL_PREFIX) ? url.slice(URL_PREFIX.length) : null;
  if (!name || !FILE_NAME.test(name)) return;
  await unlink(path.join(productsDir(), name)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}

export async function readProductImage(name: string) {
  if (!FILE_NAME.test(name)) return null;
  const ext = name.split(".").pop()!;
  const contentType = Object.entries(TYPES).find(([, type]) => type.ext === ext)![0];
  try {
    return { body: await readFile(path.join(productsDir(), name)), contentType };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
