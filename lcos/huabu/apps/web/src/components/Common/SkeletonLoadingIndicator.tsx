import { cn } from './cn';

// The existing skeleton is independent of the optional brand/Lottie renderer.
export function SkeletonLoadingIndicator({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn('skeleton-lines', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton-line" />
      ))}
    </div>
  );
}
