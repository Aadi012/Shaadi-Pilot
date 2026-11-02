'use client';
import type { Ref } from 'react';
import styles from './gallery.module.css';
import form from './workspace.module.css';

export function GalleryRemovalDialog({
  dialogRef,
  name,
  error,
  stale,
  busy,
  onKeep,
  onCancel,
  onRefresh,
  onRemove,
}: {
  dialogRef: Ref<HTMLDialogElement>;
  name?: string;
  error: string;
  stale: boolean;
  busy: boolean;
  onKeep: () => void;
  onCancel: () => void;
  onRefresh: () => void;
  onRemove: () => void;
}) {
  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="remove-photo-heading"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onCancel();
      }}
    >
      <h2 id="remove-photo-heading">Remove this photo?</h2>
      <p>{name}</p>
      {error && (
        <p role="alert" className={form.formError}>
          {error}
        </p>
      )}
      <p>
        The photo will disappear from new gallery views. Storage deletion runs
        through recoverable cleanup; previously issued private URLs may work for
        up to a minute.
      </p>
      <div className={styles.actions}>
        {error && (
          <button
            type="button"
            className={form.textButton}
            disabled={busy}
            onClick={onRefresh}
          >
            Refresh gallery and review
          </button>
        )}
        <button
          type="button"
          className={form.textButton}
          disabled={busy}
          onClick={onKeep}
        >
          Keep photo
        </button>
        <button
          type="button"
          className={form.primaryButton}
          disabled={busy || stale}
          onClick={onRemove}
        >
          {busy ? 'Removing…' : 'Remove photo'}
        </button>
      </div>
    </dialog>
  );
}
