import Link from "next/link";
import { AppSidebar } from "@/components/sidebar/sidebar";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import styles from "./page.module.css";

type Story = {
  id: number;
  name: string;
  fallback: string;
  tone: string;
};

type Friend = {
  id: number;
  name: string;
  fallback: string;
  status: "Online" | "Offline";
};

const stories: Story[] = [
  { id: 1, name: "Jenifer Caper", fallback: "JC", tone: "from-violet-600/75 to-indigo-900/90" },
  { id: 2, name: "Della Femanel", fallback: "DF", tone: "from-amber-500/70 to-orange-900/90" },
  { id: 3, name: "Rebecca Tarley", fallback: "RT", tone: "from-cyan-500/70 to-sky-900/90" },
  { id: 4, name: "Garry Brasel", fallback: "GB", tone: "from-fuchsia-500/75 to-violet-950/90" },
];

const friends: Friend[] = [
  { id: 1, name: "Stefania Backer", fallback: "SB", status: "Online" },
  { id: 2, name: "Louis Sheldon", fallback: "LS", status: "Online" },
  { id: 3, name: "Allan Butler", fallback: "AB", status: "Offline" },
  { id: 4, name: "Carl Murphy", fallback: "CM", status: "Offline" },
];

export default function HomePage() {
  return (
    <main className={styles.main}>
      <AppSidebar />
      
      <section className={styles.feedLayout}>
        <div className="mx-auto max-w-[1220px] rounded-[2rem] border border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))] p-4 shadow-sm md:p-6">
          <header className="mb-4 flex items-center justify-between rounded-2xl border border-[rgb(var(--border))] bg-white px-4 py-3">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-[rgb(var(--muted))]">Home feed</p>
              <h1 className="text-lg font-semibold text-[rgb(var(--text-strong))]">Social dashboard</h1>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline">
                Following
              </Button>
              <Button size="sm">Create</Button>
            </div>
          </header>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,2.1fr)_minmax(260px,1fr)]">
            <div className="space-y-4">
              <Card className="border-0 bg-[#edf4ff]">
                <CardHeader className="pb-4">
                  <CardTitle className="text-sm uppercase tracking-[0.12em] text-[rgb(var(--muted))]">Stories</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {stories.map((story) => (
                    <article key={story.id} className="relative overflow-hidden rounded-2xl border border-white/60 bg-white shadow-sm">
                      <div className={`h-48 bg-gradient-to-b ${story.tone}`} />
                      <div className="absolute left-3 top-3">
                        <Avatar alt={story.name} fallback={story.fallback} className="h-10 w-10 border-white" />
                      </div>
                      <p className="absolute bottom-3 left-3 text-sm font-semibold text-white">{story.name}</p>
                    </article>
                  ))}
                </CardContent>
              </Card>

              <Card className="border-0 bg-white">
                <CardHeader className="pb-4">
                  <CardTitle className="text-sm uppercase tracking-[0.12em] text-[rgb(var(--muted))]">New post</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-6 gap-2 text-xs text-[rgb(var(--muted))]">
                    {["Photo", "Video", "Poll", "Audio", "Tag", "Docs"].map((action) => (
                      <Badge key={action} variant="outline" className="justify-center py-1">
                        {action}
                      </Badge>
                    ))}
                  </div>
                  <textarea
                    className="min-h-24 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))] px-3 py-2 text-sm text-[rgb(var(--text))] outline-none focus:ring-2 focus:ring-[rgb(var(--ring))]"
                    placeholder="Share something with your followers..."
                  />
                  <Button className="w-full">Publish</Button>
                </CardContent>
              </Card>

              <Card className="border-0 bg-white">
                <CardContent className="p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar alt="Kimberly Mason" fallback="KM" className="h-11 w-11" />
                      <div>
                        <p className="text-sm font-semibold text-[rgb(var(--text-strong))]">Kimberly Mason</p>
                        <p className="text-xs text-[rgb(var(--muted))]">1 day ago</p>
                      </div>
                    </div>
                    <button type="button" className="text-sm text-[rgb(var(--muted))]">•••</button>
                  </div>
                  <p className="mb-3 text-sm text-[rgb(var(--text))]">This weekend was unforgettable. Thanks my friends &lt;3</p>
                  <div className="h-56 rounded-2xl bg-gradient-to-r from-cyan-400/80 via-sky-400/70 to-indigo-600/80" />
                </CardContent>
              </Card>
            </div>

            <aside className="space-y-4">
              <Card className="border-0 bg-[#eaf3ff]">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm uppercase tracking-[0.12em] text-[rgb(var(--muted))]">Friends</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {friends.map((friend) => (
                    <div key={friend.id} className="flex items-center justify-between rounded-xl border border-[rgb(var(--border))] bg-white px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Avatar alt={friend.name} fallback={friend.fallback} className="h-10 w-10" />
                        <div>
                          <p className="text-sm font-semibold text-[rgb(var(--text-strong))]">{friend.name}</p>
                          <p className="text-xs text-[rgb(var(--muted))]">{friend.status}</p>
                        </div>
                      </div>
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${friend.status === "Online" ? "bg-emerald-500" : "bg-rose-400"}`}
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="border-0 bg-white">
                <CardContent className="p-4">
                  <p className="mb-2 text-xs uppercase tracking-[0.12em] text-[rgb(var(--muted))]">Quick links</p>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href="/gallery">Gallery</Link>
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <Link href="/explore">Explore</Link>
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <Link href="/profile">Profile</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </aside>
          </div>
        </div>
      </section>
    </main>
  );
}
