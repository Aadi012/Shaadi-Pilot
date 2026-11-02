import { galleryHandler } from '@/modules/gallery/http.server';
export const runtime = 'nodejs';
export const maxDuration = 60;
export const POST = galleryHandler('complete');
