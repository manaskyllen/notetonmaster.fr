'use client';

import { useState, useTransition } from 'react';
import { Button, Notice } from '@/components/ui';

/**
 * Single-use links are consumed by a button press, not by the GET request,
 * so that mail scanners that open links do not burn them.
 */
export function TokenConfirm({
  label,
  action,
}: {
  label: string;
  action: () => Promise<{ error: string } | void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      {error && <Notice tone="danger">{error}</Notice>}
      <Button
        size="l"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await action();
            if (r && 'error' in r) setError(r.error);
          })
        }
      >
        {pending ? 'Un instant…' : label}
      </Button>
    </div>
  );
}
