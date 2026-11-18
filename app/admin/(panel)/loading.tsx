import { LoadingPage, Skeleton } from '@/components/ui/Skeleton';

export default function AdminLoading() {
  return (
    <LoadingPage label="Chargement…">
      <Skeleton className="h-10 w-64 max-w-full" />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[110px] rounded-[20px]" />
        ))}
      </div>
      <Skeleton className="h-[320px] rounded-[20px]" />
    </LoadingPage>
  );
}
