export default function DashboardLoading() {
  return (
    <section className="p-4 sm:p-6">
      <div className="mb-4 h-9 w-48 animate-pulse rounded-lg bg-card/60" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-2xl border border-accent/20 bg-card/50" />
        ))}
      </div>
    </section>
  );
}