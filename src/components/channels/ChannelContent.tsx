import GeneralNatureChannel from "@/components/channels/GeneralNatureChannel";
import MindfulLivingChannel from "@/components/channels/MindfulLivingChannel";
import RetreatsChannel from "@/components/channels/RetreatsChannel";
import { ChannelContentType } from "@/lib/channel-data";

type ChannelContentProps = {
  channelId: string;
  contentType: ChannelContentType;
};

export default function ChannelContent({ channelId, contentType }: ChannelContentProps) {
  if (contentType === "retreats" || channelId === "retreats") return <RetreatsChannel />;
  if (contentType === "mindful" || channelId === "mindful-living") return <MindfulLivingChannel />;
  if (contentType === "general" || channelId === "general-nature") return <GeneralNatureChannel />;

  return (
    <section className="rounded-3xl border border-accent/20 bg-card/40 p-6 text-sm text-muted">
      This channel does not have a component configured yet.
    </section>
  );
}
