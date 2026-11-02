import { guestResponseData } from './guest-request';

// Signed views expire quickly: authorize each opening, independently of the
// already-rendered thumbnail. Never reuse or persist its preview URL.
export async function freshPhotoView(photoId: string, weddingId: string) {
  const data = await guestResponseData(
    fetch('/api/v1/gallery/photos/' + photoId + '/view', { cache: 'no-store' }),
  );
  if (data.weddingId !== weddingId)
    throw new Error('Your wedding changed. Reload before opening this photo.');
  return data.url as string;
}
