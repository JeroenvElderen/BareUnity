import Image from "next/image";
import { AppSidebar } from "@/components/sidebar/sidebar";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const interestRows = [
  ["Dawn trail", "Forest stream"],
  ["Canyon light", "River bend"],
  ["Open field", "Sunset deck"],
];

const timelinePosts = [
  {
    date: "Mar 18",
    title: "Sunrise river circle recap",
    excerpt: "Shared breathwork notes, hydration reminders, and consent check-in prompts from today’s group.",
    image:
      "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1200&q=80",
  },
  {
    date: "Mar 15",
    title: "Retreat packing mini-guide",
    excerpt: "A practical list for first-time naturist retreat guests: layers, shade, and boundaries language cards.",
    image:
      "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1200&q=80",
  },
  {
    date: "Mar 10",
    title: "Photo policy update",
    excerpt: "New camera-free zones added to every event location to protect comfort and privacy.",
    image:
      "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1200&q=80",
  },
];

export default function ProfilePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col md:flex-row">
      <AppSidebar />

      <section className="flex-1 bg-[rgb(var(--bg-deep))/0.55] p-0 md:p-6">
        <Card className="min-h-full rounded-none border-x-0 border-y-0 border-[rgb(var(--border))] bg-[rgb(var(--card))/0.98] shadow-none md:rounded-[1.5rem] md:border md:shadow-[0_10px_35px_rgba(15,29,28,0.08)]">
          <div className="border-b border-[rgb(var(--border))] bg-[rgb(var(--brand-2))] px-5 py-3 text-white md:rounded-t-[1.5rem]">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[1.65rem] font-semibold leading-none">BareUnity</p>
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full bg-white/65" />
                <div className="h-2.5 w-2.5 rounded-full bg-white/55" />
                <div className="h-2.5 w-2.5 rounded-full bg-white/45" />
              </div>
            </div>
          </div>

          <div className="relative h-64 border-b border-[rgb(var(--border))/0.75] bg-[linear-gradient(110deg,rgb(var(--brand))_0%,rgb(var(--accent-soft))_100%)] md:h-80" />

          <CardContent className="space-y-5 p-4 md:p-8">
            <div className="-mt-24 pl-0 md:-mt-28 md:pl-1">
              <Avatar
                alt="Naeem"
                fallback="NA"
                className="h-36 w-36 border-4 border-white bg-[rgb(var(--bg-soft))] text-4xl shadow-lg"
              />
            </div>

            <section className="rounded-3xl border border-[rgb(var(--border))] bg-white p-4 md:p-5">
              <h1 className="text-5xl font-black tracking-tight text-[rgb(var(--text-strong))]">Naeem</h1>
              <p className="mt-1 text-[1.7rem] font-medium text-[rgb(var(--muted))]">Nature mentor · Retreat facilitator</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge className="bg-[rgb(var(--accent-soft))] text-[rgb(var(--text-strong))] hover:bg-[rgb(var(--accent-soft))]">Verified</Badge>
                <Badge variant="outline">Austin</Badge>
              </div>
            </section>

            <section className="rounded-3xl border border-[rgb(var(--border))] bg-white p-4 md:p-5">
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-[rgb(var(--muted))]">Likes & Interests</p>
              <div className="space-y-2.5">
                {interestRows.map((row) => (
                  <div key={row.join("-")} className="grid gap-2.5 sm:grid-cols-2">
                    {row.map((interest) => (
                      <div key={interest} className="rounded-xl bg-[rgb(var(--bg-soft))] px-3 py-2 text-lg font-medium text-[rgb(var(--text))]">
                        {interest}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </section>

            <section className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-6xl font-black tracking-tight text-[rgb(var(--text-strong))]">Naeem</h2>
                <p className="mt-1 text-[2rem] text-[rgb(var(--muted))]">
                  Naturist spaces for body-neutral connection, consent, and calm outdoor rituals.
                </p>
              </div>

              <div className="flex gap-3">
                <Button className="px-8 py-6 text-2xl">Follow</Button>
                <Button variant="outline" className="px-8 py-6 text-2xl">
                  Message
                </Button>
              </div>
            </section>

            <section className="grid gap-3 md:grid-cols-3">
              {[
                { label: "Trust", value: "98%" },
                { label: "Community", value: "14.2k" },
                { label: "Retreats", value: "310" },
              ].map((item) => (
                <article key={item.label} className="rounded-2xl border border-[rgb(var(--border))] bg-white p-4">
                  <p className="text-[1.55rem] text-[rgb(var(--muted))]">{item.label}</p>
                  <p className="text-6xl font-black tracking-tight text-[rgb(var(--text-strong))]">{item.value}</p>
                </article>
              ))}
            </section>

            <section className="rounded-3xl border border-[rgb(var(--border))] bg-white p-4 md:p-5">
              <div className="mb-4 flex flex-wrap gap-2">
                <Badge>Timeline</Badge>
                <Badge variant="outline">Gallery</Badge>
                <Badge variant="outline">Saved</Badge>
              </div>

              <div className="space-y-4">
                {timelinePosts.map((post) => (
                  <article key={post.title} className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))/0.5]">
                    <Image src={post.image} alt={post.title} width={1200} height={520} className="h-52 w-full object-cover" />
                    <div className="p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">{post.date}</p>
                      <h3 className="mt-1 text-2xl font-bold text-[rgb(var(--text-strong))]">{post.title}</h3>
                      <p className="mt-1 text-[1.15rem] text-[rgb(var(--muted))]">{post.excerpt}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}