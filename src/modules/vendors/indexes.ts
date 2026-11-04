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
