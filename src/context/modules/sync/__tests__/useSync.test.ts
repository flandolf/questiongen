import { describe, expect, it } from 'vitest';

import { mergeById } from '@/context/modules/sync/useSync';

describe('Supabase record merging', () => {
  it('turns Firebase-era local-only records into pending Supabase uploads', () => {
    expect(
      mergeById(
        [{ id: 'local-1', lastModified: 10, isUploaded: true }],
        [],
        new Set(),
      ),
    ).toEqual([{ id: 'local-1', lastModified: 10, isUploaded: false }]);
  });

  it('keeps tombstone deletions authoritative', () => {
    expect(
      mergeById(
        [{ id: 'deleted-1', lastModified: 10, isUploaded: false }],
        [],
        new Set(['deleted-1']),
      ),
    ).toEqual([]);
  });

  it('keeps a newer local edit pending over an older remote copy', () => {
    expect(
      mergeById(
        [{ id: 'shared', lastModified: 20, isUploaded: false }],
        [{ id: 'shared', lastModified: 10, isUploaded: true }],
        new Set(),
      ),
    ).toEqual([{ id: 'shared', lastModified: 20, isUploaded: false }]);
  });
});
