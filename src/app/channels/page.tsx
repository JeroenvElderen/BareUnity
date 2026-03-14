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
    <main className="min-h-screen bg-[radial-gradient(circle_at_0%_0%,rgba(124,92,255,0.2),transparent_35%),radial-gradient(circle_at_100%_10%,rgba(45,212,191,0.12),transparent_25%),#0a0b10] p-3 text-[#eef2ff] sm:p-6">
      <div className="mx-auto grid min-h-[calc(100vh-1.5rem)] w-full max-w-none grid-cols-1 overflow-hidden rounded-[26px] border border-[#242941] bg-linear-to-b from-white/2 to-white/0 shadow-[0_20px_80px_rgba(0,0,0,0.45)] sm:min-h-[calc(100vh-3rem)] lg:grid-cols-[250px_1fr]">
        <div className="border-b border-[#242941] p-3 lg:border-b-0 lg:border-r lg:p-4">
          <SidebarMenu channels={channels} />
        </div>

        <section className="p-6">
          <h1 className="mb-2 text-3xl font-bold">Channels</h1>
          <p className="mb-6 text-sm text-[#8e97b8]">Explore dedicated spaces for conversations, retreats, mindful living, and more.</p>

          <div className="grid gap-4 md:grid-cols-2">
            {channels.map((channel) => (
              <Link
                key={channel.id}
                href={`/channels/${channel.id}`}
                className="rounded-2xl border border-[#242941] bg-[#121522] p-5 transition hover:border-[#7c5cff] hover:bg-[#171c2d]"
              >
                <p className="text-xs uppercase tracking-[0.16em] text-[#8e97b8]">{channel.contentType}</p>
                <h2 className="mt-2 text-xl font-semibold">{channel.name}</h2>
                <p className="mt-3 text-sm text-[#b8c0e8]">Open channel</p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}