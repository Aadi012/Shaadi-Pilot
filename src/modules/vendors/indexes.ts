export const vendorIndexes = [
  {
    collection: 'vendors',
    key: { weddingId: 1, archivedAt: 1, _id: -1 },
    name: 'vendor_list_v1',
  },
  {
    collection: 'vendors',
    key: { weddingId: 1, archivedAt: 1, category: 1, _id: -1 },
    name: 'vendor_category_v1',
  },
] as const;
export const vendorPlaceIndexes = [
  {
    collection: 'vendors',
    key: { weddingId: 1, googlePlaceId: 1 },
    name: 'vendor_google_place_active_v1',
    unique: true,
    partialFilterExpression: {
      googlePlaceId: { $type: 'string' },
      archivedAt: null,
    },
  },
] as const;
