import DiscussionChannel from "@/components/channels/DiscussionChannel";

export default function DiscussionPage() {
  return (
    <section className="p-4 sm:p-6">
      <h1 className="mb-4 text-2xl font-bold sm:text-3xl">Discussion</h1>
      <DiscussionChannel channelId="discussion" newcomerModeration={false} />
    </section>
  );
}