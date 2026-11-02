export const galleryIndexes = [
  {
    collection: 'photos',
    key: { weddingId: 1, state: 1, _id: -1 },
    name: 'photo_gallery_v1',
  },
  {
    collection: 'photos',
    key: { state: 1, cleanupAfter: 1 },
    name: 'photo_cleanup_v1',
  },
  {
    collection: 'photos',
    key: { stagingKey: 1 },
    name: 'photo_staging_v1',
    unique: true,
  },
] as const;
