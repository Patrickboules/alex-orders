/** Quiet placeholder while a page's data streams in. */
export function PageSkeleton({ wide = false }: { wide?: boolean }) {
  return (
    <div
      className={`mx-auto px-4 pt-8 ${wide ? "max-w-5xl" : "max-w-2xl"}`}
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="h-7 w-1/2 rounded bg-wash-2" />
      <div className="mt-3 h-4 w-1/3 rounded bg-wash" />
      <div className="mt-10 space-y-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex justify-between gap-6 border-b border-line py-3">
            <div className="h-4 flex-1 rounded bg-wash" />
            <div className="h-4 w-16 rounded bg-wash" />
          </div>
        ))}
      </div>
    </div>
  );
}
