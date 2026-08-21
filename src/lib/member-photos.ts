import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";

export const memberPhotoBucket = "member-photos";
export const memberPhotoMaxBytes = 5 * 1024 * 1024;
export const memberPhotoError = "Photo must be JPG, PNG, or WEBP and smaller than 5 MB.";

const signatures = {
  jpeg: (bytes: Uint8Array) => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  png: (bytes: Uint8Array) => bytes.length >= 8 && [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((value, index) => bytes[index] === value),
  webp: (bytes: Uint8Array) => bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP",
};

export async function validateMemberPhoto(value: FormDataEntryValue | null) {
  if (!(value instanceof File) || value.size === 0) return null;
  if (value.size > memberPhotoMaxBytes) throw new Error("INVALID_MEMBER_PHOTO");
  const bytes = new Uint8Array(await value.slice(0, 16).arrayBuffer());
  const detected = signatures.jpeg(bytes) ? { extension: "jpg", contentType: "image/jpeg" }
    : signatures.png(bytes) ? { extension: "png", contentType: "image/png" }
    : signatures.webp(bytes) ? { extension: "webp", contentType: "image/webp" } : null;
  if (!detected || !["image/jpeg", "image/png", "image/webp"].includes(value.type)) throw new Error("INVALID_MEMBER_PHOTO");
  return { file: value, ...detected };
}

export function memberPhotoPath(gymId: string, memberId: string, extension: string) {
  return `${gymId}/members/${memberId}/${randomUUID()}.${extension}`;
}

export function isMemberPhotoPathForGym(path: string, gymId: string) {
  return path.startsWith(`${gymId}/members/`) && !path.includes("..") && !path.startsWith("/");
}

export async function uploadMemberPhoto(gymId: string, memberId: string, value: FormDataEntryValue | null) {
  const photo = await validateMemberPhoto(value);
  if (!photo) return null;
  const path = memberPhotoPath(gymId, memberId, photo.extension);
  const supabase = await createClient();
  const { error } = await supabase.storage.from(memberPhotoBucket).upload(path, photo.file, {
    contentType: photo.contentType, cacheControl: "3600", upsert: false,
  });
  if (error) throw new Error("MEMBER_PHOTO_UPLOAD_FAILED");
  return path;
}

export async function removeMemberPhoto(path: string | null, gymId: string) {
  if (!path || !isMemberPhotoPathForGym(path, gymId)) return;
  const supabase = await createClient();
  const { error } = await supabase.storage.from(memberPhotoBucket).remove([path]);
  if (error) throw new Error("MEMBER_PHOTO_REMOVE_FAILED");
}

export async function signedMemberPhotoUrl(path: string | null, gymId: string) {
  if (!path || !isMemberPhotoPathForGym(path, gymId)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(memberPhotoBucket).createSignedUrl(path, 15 * 60, {
    transform: { width: 320, height: 320, resize: "cover" },
  });
  return error ? null : data.signedUrl;
}

export async function signedMemberPhotoUrls(paths: (string | null)[], gymId: string) {
  const supabase = await createClient();
  return Promise.all(paths.map(async path => {
    if (!path || !isMemberPhotoPathForGym(path, gymId)) return null;
    const { data, error } = await supabase.storage.from(memberPhotoBucket).createSignedUrl(path, 15 * 60, {
      transform: { width: 160, height: 160, resize: "cover" },
    });
    return error ? null : data.signedUrl;
  }));
}
