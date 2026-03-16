import { notFound } from "next/navigation";
import SidebarMenu from "@/components/SidebarMenu";
import ChannelContent from "@/components/channels/ChannelContent";
import { Channel, ChannelContentType, getChannelById, getChannels } from "@/lib/channel-data";
import { db } from "@/server/db";

type DbChannel = {
  id: string;
  name: string;
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

async function readChannelsList(): Promise<Channel[]> {
  try {
    const rows = await db.channels.findMany({
      where: { is_enabled: true },
      orderBy: [{ featured: "desc" }, { position: "asc" }, { created_at: "desc" }],
      select: {
        id: true,
        name: true,
        content_type: true,
      },
    });

    if (!rows.length) return getChannels();

    return rows.map((row: DbChannel) => ({
      id: row.id,
      name: row.name,
      iconUrl: null,
      contentType: normalizeContentType(row.content_type),
    }));
  } catch {
    return getChannels();
  }
}

async function readChannel(channelId: string) {
  try {
    const row = await db.channels.findFirst({
      where: {
        id: channelId,
        is_enabled: true,
      },
      select: {
        id: true,
        name: true,
        content_type: true,
      },
    });

    if (!row) return getChannelById(channelId);

    const channel = row as DbChannel;
    return {
      id: channel.id,
      name: channel.name,
      iconUrl: null,
      contentType: normalizeContentType(channel.content_type),
    };
  } catch {
    return getChannelById(channelId);
  }
}

export default async function ChannelPage({ params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = await params;
  const [channel, channels] = await Promise.all([readChannel(channelId), readChannelsList()]);

  if (!channel) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-bg p-3 text-text sm:p-6">
      <div className="mx-auto grid min-h-[calc(100vh-1.5rem)] w-full max-w-none grid-cols-1 rounded-[26px] border border-accent/20 bg-linear-to-b from-white/2 to-white/0 shadow-[0_20px_80px_rgba(0,0,0,0.45)] sm:min-h-[calc(100vh-3rem)] lg:grid-cols-[250px_1fr] lg:overflow-hidden">
        <div className="border-b border-accent/20 p-3 lg:border-b-0 lg:border-r lg:p-4">
          <SidebarMenu channels={channels} />
        </div>

        <section className="p-4 sm:p-6">
          <h1 className="mb-4 text-2xl font-bold sm:text-3xl">{channel.name}</h1>
          <div className="rounded-[18px] border border-accent/20 bg-card/90 p-3.5">
            <ChannelContent channelId={channel.id} channelName={channel.name} contentType={channel.contentType} />
          </div>
        </section>
      </div>
    </main>
  );
}
