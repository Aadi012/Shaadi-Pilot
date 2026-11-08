'use client';
import { useState } from 'react';
import type { GooglePlace } from '@/modules/vendors/discovery-contracts';
import { vendorRequest } from './vendor-request';
import styles from './vendors.module.css';
import form from './workspace.module.css';
export function GoogleListing({ place }: { place: GooglePlace }) {
  return (
    <div className={styles.provider}>
      <p className={styles.googleAttribution} translate="no">
        Google Maps
      </p>
      <h3>{place.name}</h3>
      {place.address && <p>{place.address}</p>}
      {place.rating !== null && (
        <p>
          Rating {place.rating.toFixed(1)} / 5
          {place.ratingCount !== null
            ? ' · ' + place.ratingCount + ' reviews'
            : ''}
        </p>
      )}
      <div className={styles.actions}>
        <a
          href={place.mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          referrerPolicy="no-referrer"
        >
          View on Google Maps ↗
        </a>
        {place.website && (
          <a
            href={place.website}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
          >
            Website ↗
          </a>
        )}
        {place.phone && (
          <a href={'tel:' + place.phone.replace(/[^+0-9]/g, '')}>
            {place.phone}
          </a>
        )}
      </div>
      {place.attributions.map((a, i) => (
        <p key={i}>
          {a.url ? (
            <a href={a.url} target="_blank" rel="noopener noreferrer">
              {a.name}
            </a>
          ) : (
            a.name
          )}
        </p>
      ))}
    </div>
  );
}
export function GoogleReference({
  vendorId,
  weddingId,
}: {
  vendorId: string;
  weddingId: string;
}) {
  const [place, setPlace] = useState<GooglePlace | null>(null),
    [pending, setPending] = useState(false),
    [error, setError] = useState('');
  async function load() {
    setPending(true);
    setError('');
    setPlace(null);
    try {
      const data = await vendorRequest(
        '/api/v1/vendors/' + vendorId + '/google',
        { cache: 'no-store', headers: { 'X-Wedding-Context': weddingId } },
      );
      if (data.weddingId !== weddingId)
        throw new Error('Your wedding changed. Reload before continuing.');
      setPlace(data.place);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not load this listing. Retry shortly.',
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div>
      <p className={styles.helper}>
        Your saved label and notes are separate from the Google listing.
      </p>
      <button
        type="button"
        className={form.textButton}
        disabled={pending}
        onClick={() => void load()}
      >
        {pending
          ? 'Loading Google listing…'
          : place
            ? 'Refresh Google details'
            : 'Load Google details'}
      </button>
      {place && (
        <button
          type="button"
          className={form.textButton}
          onClick={() => setPlace(null)}
        >
          Hide details
        </button>
      )}
      {error && <p role="alert">{error}</p>}
      {place && <GoogleListing place={place} />}
    </div>
  );
}
