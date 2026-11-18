'use client';

import { useState, useTransition } from 'react';
import { Switch } from '@/components/ui';
import { updatePreference, type StudentPref } from '@/app/(public)/espace/actions';

export function PrefSwitch({
  pref,
  initial,
  label,
  onChanged,
}: {
  pref: StudentPref;
  initial: boolean;
  label: string;
  onChanged?: (value: boolean) => void;
}) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <Switch
      checked={on}
      label={label}
      disabled={pending}
      onChange={(v) => {
        setOn(v);
        onChanged?.(v);
        start(async () => {
          const r = await updatePreference(pref, v);
          if (!r.ok) {
            setOn(!v);
            onChanged?.(!v);
          }
        });
      }}
    />
  );
}
