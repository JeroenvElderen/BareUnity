import Link from "next/link";
import SidebarMenu from "@/components/SidebarMenu";
import { Channel, ChannelContentType, getChannels } from "@/lib/channel-data";
import { db } from "@/server/db";

type DbChannel = {
  id: string;
  name: string;
  icon_url: string | null;
  content_type: string | null;
};

function normalizeContentType(raw: string | null): ChannelContentType {
  if (raw === "retreats") return "retreats";
  if (raw === "mindful") return "mindful";
  if (raw === "map" || raw === "naturist-map" || raw === "naturist_map") return "map";
  if (raw === "discussion") return "discussion";
  if (raw === "custom") return "custom";
  return "general";
}

async function readChannels(): Promise<Channel[]> {
  try {
    const rows = await db.channels.findMany({
      where: { is_enabled: true },
      orderBy: [{ featured: "desc" }, { position: "asc" }, { created_at: "desc" }],
      select: {
        id: true,
        name: true,
        icon_url: true,
        content_type: true,
      },
    });

    if (!rows.length) return getChannels();

    return rows.map((row: DbChannel) => ({
      id: row.id,
      name: row.name,
      iconUrl: row.icon_url,
      contentType: normalizeContentType(row.content_type),
    }));
  } catch {
    return getChannels();
  }
}

export default async function ChannelsPage() {
  const channels = await readChannels();

  return (
    <main className="min-h-screen bg-bg p-3 text-text sm:p-6">
      <div className="mx-auto grid min-h-[calc(100vh-1.5rem)] w-full max-w-none grid-cols-1 rounded-[26px] border border-accent/20 bg-linear-to-b from-white/2 to-white/0 shadow-[0_20px_80px_rgba(0,0,0,0.45)] sm:min-h-[calc(100vh-3rem)] lg:grid-cols-[250px_1fr] lg:overflow-hidden">
        <div className="border-b border-accent/20 p-3 lg:border-b-0 lg:border-r lg:p-4">
          <SidebarMenu channels={channels} />
        </div>

        <section className="p-4 sm:p-6">
          <h1 className="mb-2 text-2xl font-bold sm:text-3xl">Channels</h1>
          <p className="mb-6 text-sm text-muted">Explore dedicated spaces for conversations, retreats, mindful living, and more.</p>

          <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
            {channels.map((channel) => (
              <Link
                key={channel.id}
                href={`/channels/${channel.id}`}
                className="rounded-2xl border border-accent/20 bg-card/90 p-5 transition hover:border-accent/70 hover:bg-card-2/70"
              >
                <p className="text-xs uppercase tracking-[0.16em] text-muted">{channel.contentType}</p>
                <h2 className="mt-2 text-xl font-semibold">{channel.name}</h2>
                <p className="mt-3 text-sm text-text/80">Open channel</p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}