import { cn } from '@/lib/cn';
import { StatusPill, type Status } from './StatusPill';

export interface DataTableColumn<Row> {
  key: string;
  label: React.ReactNode;
  align?: 'left' | 'right';
  type?: 'text' | 'status' | 'code';
  render?: (row: Row) => React.ReactNode;
  className?: string;
}

export interface DataTableProps<Row extends { id: string }> {
  columns: DataTableColumn<Row>[];
  rows: Row[];
  caption: string;
  empty?: React.ReactNode;
  className?: string;
  rowClassName?: (row: Row) => string | undefined;
}

export function DataTable<Row extends { id: string }>({
  columns,
  rows,
  caption,
  empty,
  className,
  rowClassName,
}: DataTableProps<Row>) {
  return (
    <div className={cn('overflow-x-auto rounded-lg border border-border bg-surface-0', className)}>
      <table className="w-full border-collapse text-[14px] text-ink">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  'border-b border-border bg-surface-0 px-4 py-3 text-left text-[12px] font-bold tracking-[0.05em] whitespace-nowrap text-ink-muted uppercase',
                  c.align === 'right' && 'text-right',
                )}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && empty ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-ink-muted">
                {empty}
              </td>
            </tr>
          ) : null}
          {rows.map((r) => (
            <tr key={r.id} className={cn('nm-row-hover group', rowClassName?.(r))}>
              {columns.map((c) => {
                const raw = (r as unknown as Record<string, unknown>)[c.key];
                let v: React.ReactNode = c.render ? c.render(r) : (raw as React.ReactNode);
                if (!c.render && c.type === 'status') v = <StatusPill status={raw as Status} />;
                if (!c.render && c.type === 'code') v = <Code>{raw as string}</Code>;
                return (
                  <td
                    key={c.key}
                    className={cn(
                      'border-b border-border px-4 py-3 align-middle group-last:border-b-0 group-hover:bg-surface-50',
                      c.align === 'right' && 'text-right tabular-nums',
                      c.className,
                    )}
                  >
                    {v}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Monospace identifier (Mon Master, RNCP, UAI). */
export function Code({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('font-mono text-code text-ink-muted', className)}>{children}</span>;
}
