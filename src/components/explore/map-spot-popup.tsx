import { Badge } from "@/components/ui/badge";

type MapSpotPopupProps = {
  name: string;
  description: string;
  privacy: string;
};

export function MapSpotPopup({ name, description, privacy }: MapSpotPopupProps) {
  const isPublic = privacy === "Public";

  return (
    <article className="spot-popup-card w-[300px] overflow-hidden rounded-2xl border border-white/50 bg-[rgb(var(--card))/0.96] shadow-2xl backdrop-blur">
      <header className="relative overflow-hidden border-b border-[rgb(var(--border))/0.7] bg-gradient-to-br from-[rgb(var(--brand))/0.22] via-[rgb(var(--accent-soft))/0.34] to-[rgb(var(--bg-soft))/0.55] px-4 pb-3 pt-4">
        <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-white/35 blur-2xl" />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[rgb(var(--muted))]">Discover</p>
            <h4 className="mt-1 text-base font-semibold leading-tight text-[rgb(var(--text-strong))]">{name}</h4>
          </div>

          <Badge className="rounded-full border-0 bg-[rgb(var(--card))/0.75] px-2.5 py-1 text-[10px] font-semibold text-[rgb(var(--text-strong))] shadow-sm">
            <span className="mr-1">{isPublic ? "☀️" : "🌿"}</span>
            {privacy}
          </Badge>
        </div>
      </header>

      <div className="space-y-3 px-4 pb-4 pt-3">
        <p className="line-clamp-4 text-xs leading-relaxed text-[rgb(var(--muted))]">{description}</p>

        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline" className="h-5 rounded-full border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))/0.85] px-2 text-[10px] text-[rgb(var(--muted))]">
            Naturist
          </Badge>
          <Badge variant="outline" className="h-5 rounded-full border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))/0.85] px-2 text-[10px] text-[rgb(var(--muted))]">
            Community
          </Badge>
          <Badge variant="outline" className="h-5 rounded-full border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))/0.85] px-2 text-[10px] text-[rgb(var(--muted))]">
            Safe Spot
          </Badge>
        </div>
      </div>
    </article>
  );
}