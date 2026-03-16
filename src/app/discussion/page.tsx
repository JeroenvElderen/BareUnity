import SidebarMenu from "@/components/SidebarMenu";
import DiscussionChannel from "@/components/channels/DiscussionChannel";
import { getChannels } from "@/lib/channel-data";

export default function DiscussionPage() {
  const channels = getChannels();

  return (
    <main className="min-h-screen bg-bg p-3 text-text sm:p-6">
      <div className="mx-auto grid min-h-[calc(100vh-1.5rem)] w-full max-w-none grid-cols-1 rounded-[26px] border border-accent/20 bg-linear-to-b from-white/2 to-white/0 shadow-[0_20px_80px_rgba(0,0,0,0.45)] sm:min-h-[calc(100vh-3rem)] lg:grid-cols-[250px_1fr] lg:overflow-hidden">
        <div className="border-b border-accent/20 p-3 lg:border-b-0 lg:border-r lg:p-4">
          <SidebarMenu channels={channels} />
        </div>

        <section className="p-4 sm:p-6">
          <h1 className="mb-4 text-2xl font-bold sm:text-3xl">Discussion</h1>
          <DiscussionChannel channelId="discussion" newcomerModeration={false} />
        </section>
      </div>
    </main>
  );
}