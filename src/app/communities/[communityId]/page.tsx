import { redirect } from "next/navigation";

export default async function LegacyCommunityDetailPage({ params }: { params: Promise<{ communityId: string }> }) {
  const { communityId } = await params;
  redirect(`/channels/${communityId}`);
}
