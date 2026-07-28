import { supabase } from '@/context/modules/supabase';

const BUCKET = 'answer-images';

type ImageRecord = Record<string, unknown> & {
  id: string;
  dataUrl: string;
  storagePath?: string;
};

function isImageRecord(value: unknown): value is ImageRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const image = value as Record<string, unknown>;
  return typeof image.id === 'string' && typeof image.dataUrl === 'string';
}

function imageExtension(contentType: string): string {
  return (
    {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'image/svg+xml': 'svg',
    }[contentType] ?? 'bin'
  );
}

async function uploadDataUrl(
  userId: string,
  image: ImageRecord,
): Promise<string> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const blob = await fetch(image.dataUrl).then((response) => response.blob());
  const storagePath = `${userId}/${image.id}.${imageExtension(blob.type)}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, blob, { contentType: blob.type, upsert: true });
  if (error) throw error;
  return storagePath;
}

export async function prepareCloudPayload(
  payload: unknown,
  userId: string,
): Promise<unknown> {
  const copy = structuredClone(payload);

  async function walk(value: unknown): Promise<void> {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      await Promise.all(value.map(walk));
      return;
    }

    if (isImageRecord(value) && value.dataUrl.startsWith('data:image/')) {
      const path = value.storagePath?.startsWith(`${userId}/`)
        ? value.storagePath
        : await uploadDataUrl(userId, value);
      value.storagePath = path;
      value.dataUrl = '';
      delete value.downloadUrl;
    }

    await Promise.all(Object.values(value).map(walk));
  }

  await walk(copy);
  return copy;
}

export async function hydrateCloudPayloads(
  payloads: unknown[],
): Promise<unknown[]> {
  if (!supabase) return payloads;
  const copies = payloads.map((payload) => structuredClone(payload));
  const images: ImageRecord[] = [];

  function collect(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    if (isImageRecord(value) && value.storagePath) images.push(value);
    Object.values(value).forEach(collect);
  }

  copies.forEach(collect);
  const paths = [...new Set(images.map((image) => image.storagePath!))];
  if (paths.length === 0) return copies;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, 60 * 60 * 24 * 7);
  if (error) throw error;

  const urls = new Map(
    data
      .filter((item) => item.signedUrl)
      .map((item) => [item.path, item.signedUrl]),
  );
  for (const image of images) {
    const url = urls.get(image.storagePath!);
    if (url) {
      image.dataUrl = url;
      image.downloadUrl = url;
    }
  }
  return copies;
}
