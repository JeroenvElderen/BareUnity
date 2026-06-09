import { supabase } from "@/lib/supabase";

export async function uploadPostImage(
  file: File,
  userId: string,
) {
  const extension =
    file.name.split(".").pop()?.toLowerCase() ?? "webp";

  const path =
    `posts/${userId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

  const { data, error } = await supabase.storage
    .from("media")
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    throw new Error(error.message);
  }

  const { data: publicUrl } = supabase.storage
    .from("media")
    .getPublicUrl(data.path);

  return publicUrl.publicUrl;
}