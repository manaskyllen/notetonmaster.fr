'use client';

import { useId, useState } from 'react';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';

export interface FileInputProps {
  name: string;
  label: string;
  hint?: string;
  accept?: string;
  /** Max size in bytes; larger files are rejected client-side (the server checks again). */
  maxBytes?: number;
  required?: boolean;
  error?: string;
  className?: string;
}

export function FileInput({
  name,
  label,
  hint,
  accept,
  maxBytes,
  required,
  error,
  className,
}: FileInputProps) {
  const id = useId();
  const [file, setFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const err = localError ?? error;

  return (
    <div className={cn('nm-field', className)}>
      <span className="nm-label">{label}</span>
      <label
        htmlFor={id}
        className={cn(
          'flex min-h-[72px] cursor-pointer items-center gap-3 rounded-md border-[1.5px] border-dashed bg-surface-0 px-4 py-3 focus-within:outline-2 focus-within:outline-offset-3 focus-within:outline-focus',
          err ? 'border-danger' : 'border-border-control',
        )}
      >
        <span className="flex size-11 flex-none items-center justify-center rounded-sm bg-violet-100 text-violet-700">
          <Icon name={file ? 'file' : 'upload'} size={20} />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[15px] font-semibold">
            {file ? file.name : 'Choisir un fichier'}
          </span>
          <span className="text-[13px] text-ink-muted">
            {file ? `${(file.size / 1024 / 1024).toFixed(1).replace('.', ',')} Mo` : hint}
          </span>
        </span>
        <input
          id={id}
          name={name}
          type="file"
          accept={accept}
          required={required}
          aria-invalid={err ? true : undefined}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            if (f && maxBytes && f.size > maxBytes) {
              setLocalError(
                `Fichier trop lourd (${Math.round(maxBytes / 1024 / 1024)} Mo maximum).`,
              );
              e.target.value = '';
              setFile(null);
              return;
            }
            setLocalError(null);
            setFile(f);
          }}
        />
      </label>
      {err && (
        <span role="alert" className="text-[13px] text-danger">
          {err}
        </span>
      )}
    </div>
  );
}
