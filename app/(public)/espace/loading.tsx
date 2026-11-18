import { LoadingPage, Skeleton } from '@/components/ui/Skeleton';

export default function EspaceLoading() {
  return (
    <LoadingPage label="Chargement de ton espace…">
      <Skeleton className="h-12 w-72 max-w-full" />
      <div className="grid grid-cols-4 gap-3.5 max-[1000px]:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[132px] rounded-[24px]" />
        ))}
      </div>
      <Skeleton className="h-[220px] rounded-[24px]" />
    </LoadingPage>
  );
}
