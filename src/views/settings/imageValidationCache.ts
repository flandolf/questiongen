const IMAGE_VALIDATION_CACHE_TTL_MS = 15 * 60_000;
const imageValidationCache = new Map<string, { supportsImages: boolean; fetchedAt: number }>();

function getImageValidationCacheKey(apiKey: string, modelId: string): string {
  return `${apiKey}:${modelId}`;
}

export function getCachedImageValidation(apiKey: string, modelId: string): boolean | null {
  const key = getImageValidationCacheKey(apiKey, modelId);
  const entry = imageValidationCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > IMAGE_VALIDATION_CACHE_TTL_MS) {
    imageValidationCache.delete(key);
    return null;
  }
  return entry.supportsImages;
}

export function setCachedImageValidation(apiKey: string, modelId: string, supportsImages: boolean): void {
  imageValidationCache.set(getImageValidationCacheKey(apiKey, modelId), {
    supportsImages,
    fetchedAt: Date.now(),
  });
}
