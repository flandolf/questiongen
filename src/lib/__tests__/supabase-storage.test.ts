import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  hydrateCloudPayloads,
  prepareCloudPayload,
} from '@/lib/supabase-storage';

const storage = vi.hoisted(() => ({
  upload: vi.fn(),
  createSignedUrls: vi.fn(),
}));

vi.mock('@/context/modules/supabase', () => ({
  supabase: {
    storage: {
      from: () => storage,
    },
  },
}));

describe('Supabase image storage', () => {
  beforeEach(() => {
    storage.upload.mockReset().mockResolvedValue({ error: null });
    storage.createSignedUrls.mockReset().mockResolvedValue({
      data: [
        {
          path: 'user-1/image-1.png',
          signedUrl: 'https://example.test/signed-image',
        },
      ],
      error: null,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        blob: () =>
          Promise.resolve(new Blob(['image'], { type: 'image/png' })),
      }),
    );
  });

  it('uploads embedded data URLs and keeps only the private object path remotely', async () => {
    const result = (await prepareCloudPayload(
      {
        uploadedAnswerImage: {
          id: 'image-1',
          dataUrl: 'data:image/png;base64,aW1hZ2U=',
          timestamp: '2026-07-28T00:00:00.000Z',
        },
      },
      'user-1',
    )) as {
      uploadedAnswerImage: {
        dataUrl: string;
        storagePath: string;
      };
    };

    expect(storage.upload).toHaveBeenCalledWith(
      'user-1/image-1.png',
      expect.any(Blob),
      { contentType: 'image/png', upsert: true },
    );
    expect(result.uploadedAnswerImage).toMatchObject({
      dataUrl: '',
      storagePath: 'user-1/image-1.png',
    });
  });

  it('rehydrates private object paths as signed image URLs', async () => {
    const [result] = (await hydrateCloudPayloads([
      {
        uploadedAnswerImage: {
          id: 'image-1',
          dataUrl: '',
          storagePath: 'user-1/image-1.png',
          timestamp: '2026-07-28T00:00:00.000Z',
        },
      },
    ])) as Array<{
      uploadedAnswerImage: { dataUrl: string; downloadUrl: string };
    }>;

    expect(result.uploadedAnswerImage).toMatchObject({
      dataUrl: 'https://example.test/signed-image',
      downloadUrl: 'https://example.test/signed-image',
    });
  });
});
