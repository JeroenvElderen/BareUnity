import { Badge } from "@/components/ui/badge";

type MapSpotPopupProps = {
  name: string;
  description: string;
  privacy: string;
};

export function MapSpotPopup({ name, description, privacy }: MapSpotPopupProps) {
  const isPublic = privacy === "Public";

  return (
    <article className="spot-popup-card w-[316px] overflow-hidden rounded-3xl border border-white/55 bg-[rgb(var(--card))/0.97] text-[rgb(var(--text))] shadow-2xl backdrop-blur-md">
      <header className="relative overflow-hidden border-b border-[rgb(var(--border))/0.7] bg-[linear-gradient(145deg,rgb(var(--brand))/0.2_0%,rgb(var(--accent-soft))/0.38_52%,rgb(var(--bg-soft))/0.7_100%)] px-5 pb-4 pt-4">
        <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/40 blur-2xl" />
        <div className="pointer-events-none absolute -left-8 bottom-0 h-16 w-16 rounded-full bg-[rgb(var(--brand))/0.28] blur-xl" />
        
        <div className="relative flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[rgb(var(--muted))]">Explore spot</p>
            <h4 className="text-[1.05rem] font-semibold leading-tight text-[rgb(var(--text-strong))]">{name}</h4>
          </div>

          <Badge className="rounded-full border border-white/65 bg-white/78 px-2.5 py-1 text-[10px] font-semibold text-[rgb(var(--text-strong))] shadow-sm">
            <span className="mr-1">{isPublic ? "☀️" : "🌿"}</span>
            {privacy}
          </Badge>
        </div>
      </header>

      <div className="space-y-3.5 px-5 pb-5 pt-4">
        <p className="line-clamp-4 text-xs leading-relaxed text-[rgb(var(--muted))]">{description}</p>

        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline" className="h-5 rounded-full border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))/0.85] px-2 text-[10px] font-medium text-[rgb(var(--muted))]">
            Naturist
          </Badge>
          <Badge variant="outline" className="h-5 rounded-full border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))/0.85] px-2 text-[10px] font-medium text-[rgb(var(--muted))]">
            Community
          </Badge>
          <Badge variant="outline" className="h-5 rounded-full border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))/0.85] px-2 text-[10px] font-medium text-[rgb(var(--muted))]">
            Safe Spot
          </Badge>
        </div>
      </div>
    </article>
  );
}