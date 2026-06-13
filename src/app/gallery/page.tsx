import { redirect } from "next/navigation";

type GalleryIndexPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function GalleryIndexPage({
  searchParams,
}: GalleryIndexPageProps) {
  const resolvedSearchParams = await searchParams;
  const targetParams = new URLSearchParams();
  const imagePath = resolvedSearchParams.imagePath;

  if (typeof imagePath === "string" && imagePath.length > 0) {
    targetParams.set("imagePath", imagePath);
  }

  const queryString = targetParams.toString();
  redirect(`/gallery/general${queryString ? `?${queryString}` : ""}`);
}
