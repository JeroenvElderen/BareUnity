"use client";

import Topbar from "@/components/Topbar";
import Sidebar from "@/components/Sidebar";

const samplePosts = [
  {
    id: "p1",
    image: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=80&w=1200&auto=format&fit=crop",
    text: "Morning hike and sunbathing spot check. Quiet, warm, and respectful vibes all around.",
  },
  {
    id: "p2",
    image: "https://images.unsplash.com/photo-1501854140801-50d01698950b?q=80&w=1200&auto=format&fit=crop",
    text: "Weekend retreat location preview. Open fields + tree cover + private paths.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen text-text">
      <Topbar />
      <div className="mx-auto max-w-[1500px]">
        <div className="flex">
          <Sidebar />
          <main className="flex-1 px-4 py-6 md:px-8">
            <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[1fr_340px]">
              <section className="space-y-4">
                {samplePosts.map((post) => (
                  <article key={post.id} className="overflow-hidden rounded-3xl border border-accent/20 bg-card/60">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={post.image} alt="Sample naturist post" className="h-56 w-full object-cover" />
                    <p className="p-4 text-sm text-muted">{post.text}</p>
                  </article>
                ))}
              </section>

              <aside className="rounded-3xl border border-accent/20 bg-card/55 p-4">
                <div className="h-72 rounded-2xl bg-cover bg-center" style={{ backgroundImage: "url(https://images.unsplash.com/photo-1472396961693-142e6e269027?q=80&w=900&auto=format&fit=crop)" }} />
                <p className="mt-3 text-sm text-muted">Temporary map/spotlight panel for upcoming naturist meetups.</p>
              </aside>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
