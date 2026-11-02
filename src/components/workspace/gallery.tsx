'use client';
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import type { WeddingDto } from '@/modules/weddings/contracts';
import {
  MAX_PHOTO_BYTES,
  type GalleryPage,
  type PhotoDto,
} from '@/modules/gallery/contracts';
import { WorkspaceShell } from './workspace-shell';
import { guestResponseData, GuestRequestError } from './guest-request';
import { freshPhotoView } from './gallery-client';
import { GalleryRemovalDialog } from './gallery-removal-dialog';
import { prepareCreate, type CreateAttempt } from '@/lib/api/create-attempt';
import styles from './gallery.module.css';
import form from './workspace.module.css';
type Intent = {
  weddingId: string;
  photo: PhotoDto;
  uploadUrl: string;
  requiredHeaders: Record<string, string>;
  expiresAt: string;
};
const units = (bytes: number) => (bytes / 1024 ** 2).toFixed(1) + ' MiB';
function PhotoCard({
  photo,
  onRemove,
  weddingId,
}: {
  photo: PhotoDto;
  weddingId: string;
  onRemove: (photo: PhotoDto) => void;
}) {
  const [url, setUrl] = useState(''),
    [error, setError] = useState(false),
    [openedUrl, setOpenedUrl] = useState(''),
    [opening, setOpening] = useState(false),
    [openError, setOpenError] = useState(''),
    [revision, setRevision] = useState(0);
  const viewer = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    let cancelled = false;
    if (photo.state === 'ready')
      freshPhotoView(photo.id, weddingId)
        .then((freshUrl) => {
          if (!cancelled) {
            setUrl(freshUrl);
            setError(false);
          }
        })
        .catch(() => {
          if (!cancelled) setError(true);
        });
    return () => {
      cancelled = true;
    };
  }, [photo.id, photo.state, revision, weddingId]);
  async function openPhoto() {
    if (opening) return;
    setOpening(true);
    setOpenError('');
    try {
      const freshUrl = await freshPhotoView(photo.id, weddingId);
      setOpenedUrl(freshUrl);
      viewer.current?.showModal();
    } catch {
      setOpenError(
        'Could not open this photo. Check your connection and try again.',
      );
    } finally {
      setOpening(false);
    }
  }
  return (
    <article className={styles.card}>
      <div className={styles.photo}>
        {url && !error ? (
          // Private images bypass the public Next.js image optimizer/cache.
          <button
            type="button"
            className={styles.openPhoto}
            disabled={opening}
            onClick={() => void openPhoto()}
            aria-label={'Open ' + photo.name}
            aria-busy={opening}
          >
            <Image
              unoptimized
              width={photo.width ?? 800}
              height={photo.height ?? 600}
              src={url}
              alt={photo.name}
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setError(true)}
            />
          </button>
        ) : (
          <div className={styles.placeholder}>
            <span>
              {photo.state === 'ready'
                ? error
                  ? 'Preview unavailable'
                  : 'Loading preview…'
                : photo.state === 'deleting'
                  ? 'Removing photo…'
                  : photo.state === 'rejected'
                    ? 'Photo could not be validated'
                    : photo.state === 'processing'
                      ? 'Verifying photo…'
                      : 'Upload not yet completed'}
            </span>
            {photo.state === 'ready' && error && (
              <button
                type="button"
                className={form.textButton}
                onClick={() => setRevision((v) => v + 1)}
              >
                Retry preview
              </button>
            )}
          </div>
        )}
      </div>
      <div className={styles.caption}>
        <h3>{photo.name}</h3>
        {openError && <p role="alert">{openError}</p>}
        <p>
          {photo.state === 'ready'
            ? units(photo.sizeBytes) +
              ' · ' +
              photo.width +
              ' × ' +
              photo.height
            : (photo.error ??
              'Pending files reserve space until verified or cleaned up.')}
        </p>
        <button
          type="button"
          className={form.textButton}
          disabled={photo.state === 'deleting'}
          onClick={() => onRemove(photo)}
        >
          {photo.state === 'deleting' ? 'Removal queued' : 'Remove'}
        </button>
      </div>
      <dialog
        ref={viewer}
        className={styles.viewer}
        aria-label={'Photo: ' + photo.name}
        onClose={() => setOpenedUrl('')}
      >
        <button
          type="button"
          className={form.textButton}
          onClick={() => viewer.current?.close()}
        >
          Close photo
        </button>
        {openedUrl && (
          <Image
            unoptimized
            src={openedUrl}
            width={photo.width ?? 800}
            height={photo.height ?? 600}
            alt={photo.name}
            referrerPolicy="no-referrer"
            onError={() => {
              setOpenedUrl('');
              setOpenError(
                'Could not load this photo. Close and open it again to retry.',
              );
            }}
          />
        )}
        {openError && <p role="alert">{openError}</p>}
      </dialog>
    </article>
  );
}
export function Gallery({
  wedding,
  name,
  role,
  userId,
  initial,
}: {
  wedding: WeddingDto;
  name: string;
  role: 'admin' | 'manager';
  userId: string;
  initial: GalleryPage | null;
}) {
  const [page, setPage] = useState(initial),
    [error, setError] = useState(
      initial ? '' : 'The gallery is temporarily unavailable. Please retry.',
    ),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [lockedFile, setLockedFile] = useState(false),
    [canVerify, setCanVerify] = useState(false),
    [discarding, setDiscarding] = useState(false),
    [loading, setLoading] = useState(false),
    [file, setFile] = useState<File | null>(null),
    [progress, setProgress] = useState<number | null>(null),
    [stage, setStage] = useState(''),
    [removalError, setRemovalError] = useState(''),
    [removalStale, setRemovalStale] = useState(false),
    [remove, setRemove] = useState<PhotoDto | null>(null);
  const input = useRef<HTMLInputElement>(null),
    dialog = useRef<HTMLDialogElement>(null),
    attempt = useRef<CreateAttempt<{
      fileName: string;
      mimeType: string;
      sizeBytes: number;
    }> | null>(null),
    intent = useRef<Intent | null>(null),
    uploaded = useRef(false),
    working = useRef(false),
    sequence = useRef(0);
  const verify = (data: { weddingId: string }) => {
    if (data.weddingId !== wedding.id)
      throw new Error('Your wedding changed. Reload before continuing.');
  };
  async function refresh(append = false) {
    const request = ++sequence.current;
    setLoading(true);
    try {
      const data: GalleryPage = await guestResponseData(
        fetch(
          '/api/v1/gallery/photos' +
            (append && page?.nextCursor
              ? '?cursor=' + encodeURIComponent(page.nextCursor)
              : ''),
          { cache: 'no-store' },
        ),
      );
      verify(data);
      if (request === sequence.current) {
        setPage((old) => ({
          ...data,
          photos: append && old ? [...old.photos, ...data.photos] : data.photos,
        }));
        setError('');
        return true;
      }
    } catch {
      if (request === sequence.current)
        setError('Could not load photos. Check your connection and retry.');
    } finally {
      if (request === sequence.current) setLoading(false);
    }
    return false;
  }
  async function authorization() {
    const session = await guestResponseData(
      fetch('/api/v1/auth/session', { cache: 'no-store' }),
    );
    if (session.user?.id !== userId || session.user?.weddingId !== wedding.id)
      throw new Error(
        'Your account or wedding changed. Reload before continuing.',
      );
    return {
      'X-CSRF-Token': session.csrfToken,
      'X-Wedding-Context': wedding.id,
    };
  }
  function put(data: Intent, file: File) {
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', data.uploadUrl);
      xhr.timeout = 60000;
      for (const [key, value] of Object.entries(data.requiredHeaders))
        xhr.setRequestHeader(key, value);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable)
          setProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(
              new Error(
                'Photo upload failed. Check your connection or storage setup and retry.',
              ),
            );
      xhr.onerror = xhr.ontimeout = () =>
        reject(
          new Error(
            'Connection interrupted. Your selected file is kept; retry or verify the upload.',
          ),
        );
      xhr.send(file);
    });
  }
  async function upload(verifyOnly = false) {
    if (working.current || !file) return;
    working.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const auth = await authorization();
      if (!intent.current) {
        setStage('Reserving private upload…');
        setLockedFile(true);
        attempt.current = prepareCreate(attempt.current, {
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        });
        const data: Intent = await guestResponseData(
          fetch('/api/v1/gallery/uploads', {
            method: 'POST',
            headers: {
              ...auth,
              'Content-Type': 'application/json',
              'Idempotency-Key': attempt.current.key,
            },
            body: JSON.stringify(attempt.current.body),
          }),
          'save',
        );
        verify(data);
        intent.current = data;
        setCanVerify(true);
      }
      if (!uploaded.current && !verifyOnly) {
        if (Date.parse(intent.current.expiresAt) <= Date.now())
          throw new Error(
            'Upload URL expired. Try Verify upload if the transfer finished, or cancel and choose the file again.',
          );
        setStage('Uploading photo…');
        setProgress(0);
        await put(intent.current, file);
        uploaded.current = true;
      }
      setProgress(null);
      setStage('Validating and preparing private photo…');
      const result = await guestResponseData(
        fetch(
          '/api/v1/gallery/uploads/' + intent.current.photo.id + '/complete',
          { method: 'POST', headers: await authorization() },
        ),
        'save',
      );
      verify(result);
      setFile(null);
      attempt.current = null;
      intent.current = null;
      uploaded.current = false;
      setLockedFile(false);
      setCanVerify(false);
      if (input.current) input.current.value = '';
      setStage('');
      setNotice('Photo added to your private gallery.');
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not complete the upload. Retry with this file.',
      );
      setStage('Upload needs attention');
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  function discard() {
    if (busy) return;
    setFile(null);
    attempt.current = null;
    intent.current = null;
    uploaded.current = false;
    setLockedFile(false);
    setCanVerify(false);
    setStage('');
    setDiscarding(false);
    setProgress(null);
    if (input.current) input.current.value = '';
  }
  async function removeConfirmed() {
    if (!remove || working.current || removalStale) return;
    working.current = true;
    setBusy(true);
    setError('');
    setRemovalError('');
    try {
      const data = await guestResponseData(
        fetch('/api/v1/gallery/photos/' + remove.id, {
          method: 'DELETE',
          headers: {
            ...(await authorization()),
            'If-Match': '"' + remove.version + '"',
          },
        }),
        'save',
      );
      verify(data);
      dialog.current?.close();
      setRemove(null);
      setNotice(
        'Photo hidden from new views. Storage cleanup is queued; existing private URLs expire shortly.',
      );
      await refresh();
    } catch (e) {
      setRemovalStale(e instanceof GuestRequestError && e.status === 412);
      setRemovalError(
        e instanceof GuestRequestError
          ? e.message
          : 'Could not confirm photo removal. Check your connection, then refresh the gallery and review before trying again.',
      );
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  async function refreshRemoval() {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      if (await refresh()) {
        dialog.current?.close();
        setRemove(null);
        setRemovalError('');
        setRemovalStale(false);
        setNotice(
          'Gallery refreshed. Review the current photo before choosing Remove again.',
        );
      } else {
        setRemovalError(
          'Could not refresh the gallery. Check your connection and try again.',
        );
      }
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  return (
    <WorkspaceShell wedding={wedding} name={name} role={role} active="Gallery">
      <div className={styles.container}>
        <header className={styles.heading}>
          <div>
            <p className={form.eyebrow}>Keep the moments that matter</p>
            <h1>Our wedding gallery</h1>
            <p>A private home for your celebration’s photos.</p>
          </div>
          <button
            className={form.textButton}
            disabled={loading || busy}
            onClick={() => void refresh()}
          >
            Refresh gallery
          </button>
        </header>
        {error && (
          <p role="alert" className={form.errorNotice}>
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className={styles.notice}>
            {notice}
          </p>
        )}
        <section className={styles.upload} aria-label="Upload photos">
          <div>
            <h2>Add a moment</h2>
            <p>
              JPEG, PNG or WebP · up to 20 MiB each. Photos are validated and
              location metadata is removed before they appear.
            </p>
            {page && (
              <p className={styles.muted}>
                {page.usage.count} of {page.usage.maxCount} photo slots ·{' '}
                {units(page.usage.bytes)} of {units(page.usage.maxBytes)} used
                or reserved
              </p>
            )}
          </div>
          {!page?.storageReady && (
            <p role="status">
              Private storage setup is required before uploads are available.
            </p>
          )}
          <label className={styles.file}>
            Choose a photo
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy || lockedFile || !page?.storageReady}
              onChange={(e) => {
                const chosen = e.target.files?.[0];
                if (!chosen) return;
                if (
                  !['image/jpeg', 'image/png', 'image/webp'].includes(
                    chosen.type,
                  ) ||
                  chosen.size < 1 ||
                  chosen.size > MAX_PHOTO_BYTES
                ) {
                  setError('Choose a JPEG, PNG or WebP photo up to 20 MiB.');
                  e.target.value = '';
                  return;
                }
                setFile(chosen);
                setError('');
              }}
            />
          </label>
          {file && (
            <>
              <p>
                {file.name} · {units(file.size)}
              </p>
              <div className={styles.actions}>
                <button
                  className={form.primaryButton}
                  disabled={busy}
                  onClick={() => void upload()}
                >
                  {busy
                    ? 'Working…'
                    : lockedFile
                      ? 'Retry upload'
                      : 'Upload photo'}
                </button>
                {canVerify && (
                  <button
                    className={form.textButton}
                    disabled={busy}
                    onClick={() => void upload(true)}
                  >
                    Verify upload
                  </button>
                )}
                <button
                  className={form.textButton}
                  disabled={busy}
                  onClick={() => {
                    if (lockedFile) setDiscarding(true);
                    else discard();
                  }}
                >
                  Cancel upload
                </button>
              </div>
            </>
          )}
          {discarding && (
            <div className={styles.notice}>
              <p>
                Cancel this upload? It may have reached storage. Unfinished
                uploads remain private and are cleaned up later.
              </p>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={form.textButton}
                  onClick={() => setDiscarding(false)}
                >
                  Keep upload
                </button>
                <button
                  type="button"
                  className={form.textButton}
                  onClick={discard}
                >
                  Confirm cancel
                </button>
              </div>
            </div>
          )}
          {stage && (
            <p role="status">
              {stage}
              {progress !== null ? ' ' + progress + '%' : ''}
            </p>
          )}
          {progress !== null && (
            <progress
              max={100}
              value={progress}
              aria-label="Photo upload progress"
            />
          )}
          <p className={styles.muted}>
            Organizer gallery · guest links and QR access will be added in the
            next increment.
          </p>
        </section>
        <section aria-label="Wedding photos">
          {!page || !page.photos.length ? (
            <div className={styles.empty}>
              <span aria-hidden="true">✧</span>
              <h2>Your story starts here</h2>
              <p>
                Add a favourite photo to begin your private wedding collection.
              </p>
            </div>
          ) : (
            <div className={styles.grid}>
              {page.photos.map((photo) => (
                <PhotoCard
                  key={photo.id + ':' + photo.version}
                  photo={photo}
                  weddingId={wedding.id}
                  onRemove={(row) => {
                    setRemove(row);
                    setRemovalError('');
                    setRemovalStale(false);
                    dialog.current?.showModal();
                  }}
                />
              ))}
            </div>
          )}
          {page?.nextCursor && (
            <button
              className={form.textButton}
              disabled={loading || busy}
              onClick={() => void refresh(true)}
            >
              {loading ? 'Loading…' : 'Load more photos'}
            </button>
          )}
        </section>
        <GalleryRemovalDialog
          dialogRef={dialog}
          name={remove?.name}
          error={removalError}
          stale={removalStale}
          busy={busy}
          onKeep={() => {
            dialog.current?.close();
            setRemove(null);
          }}
          onCancel={() => setRemove(null)}
          onRefresh={() => void refreshRemoval()}
          onRemove={() => void removeConfirmed()}
        />
      </div>
    </WorkspaceShell>
  );
}
