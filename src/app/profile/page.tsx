import { MediaGallery } from "@/components/profile/media-gallery";
import { ProfileSection } from "@/components/profile/profile-section";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Stat = { label: string; value: string; delta: string };

type Post = {
  title: string;
  category: string;
  excerpt: string;
  reads: string;
  comments: number;
};

const stats: Stat[] = [
  { label: "Circle Members", value: "12.8k", delta: "+12%" },
  { label: "Retreat Check-ins", value: "286", delta: "+34" },
  { label: "Nature Journals", value: "47", delta: "+4" },
  { label: "Response Time", value: "2h", delta: "-40m" },
];

const principles = [
  "Body positivity",
  "Respectful community",
  "Outdoor wellness",
  "Consent-first culture",
];

const skills = [
  { label: "Retreat Hosting", progress: 92 },
  { label: "Community Moderation", progress: 88 },
  { label: "Photography", progress: 76 },
];

const posts: Post[] = [
  {
    title: "What to pack for your first naturist beach morning",
    category: "Guide",
    excerpt:
      "A grounded checklist for comfort, hydration, shade, and respectful etiquette on day one.",
    reads: "3.2k",
    comments: 42,
  },
  {
    title: "Creating safer circles through clear consent rituals",
    category: "Community",
    excerpt:
      "How our weekly meetups open with expectations, language, and support boundaries.",
    reads: "2.1k",
    comments: 27,
  },
  {
    title: "Calm movement routines for sunrise gatherings",
    category: "Wellness",
    excerpt:
      "A simple 15-minute flow for connection, breath, and gentle mobility in natural spaces.",
    reads: "4.8k",
    comments: 59,
  },
];

export default function ProfileExamplesPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 p-6 md:p-10">
      <Card className="overflow-hidden border border-[rgb(var(--border))] bg-white/95 shadow-lg">
        <div className="relative h-44 bg-gradient-to-r from-[rgb(var(--brand-2))] via-[rgb(var(--brand))] to-[rgb(var(--accent-soft))]">
          <div className="absolute right-8 top-6 hidden gap-2 md:flex">
            <Button variant="secondary" size="sm">
              Share profile
            </Button>
            <Button variant="outline" size="sm" className="bg-white/90">
              Edit cover
            </Button>
          </div>
        </div>

        <CardContent className="relative -mt-12 space-y-6 p-6">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="flex items-center gap-4">
              <Avatar
                alt="Jordan Kim"
                fallback="JK"
                className="h-24 w-24 border-4 border-white shadow"
              />
              <div>
                <h1 className="text-3xl font-bold text-[rgb(var(--text-strong))]">
                  Jordan Kim
                </h1>
                <p className="text-sm text-[rgb(var(--muted))]">
                  Naturist community host · Austin, TX · Open to collaborations
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge>Verified host</Badge>
                  <Badge variant="secondary">Retreat mentor</Badge>
                  <Badge variant="outline">Available this month</Badge>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline">Message</Button>
              <Button>Follow</Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {principles.map((principle) => (
              <Badge key={principle} variant="outline">
                {principle}
              </Badge>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))] p-4"
              >
                <p className="text-xs uppercase tracking-wide text-[rgb(var(--muted))]">
                  {stat.label}
                </p>
                <p className="text-2xl font-bold text-[rgb(var(--text-strong))]">
                  {stat.value}
                </p>
                <p className="text-xs font-medium text-[rgb(var(--success))]">
                  {stat.delta} this month
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-6 lg:grid-cols-[1.3fr,2fr]">
        <div className="space-y-6">
          <ProfileSection
            title="About"
            description="Grounded in respectful naturism, education, and outdoor wellbeing."
          >
            <div className="space-y-5">
              <p className="text-sm leading-6 text-[rgb(var(--muted))]">
                I organize consent-forward naturist meetups where people can
                reconnect with nature, body acceptance, and mindful community.
                My page shares practical resources for newcomers and hosts alike.
              </p>

              <div className="space-y-3">
                {skills.map((skill) => (
                  <div key={skill.label} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-[rgb(var(--text-strong))]">
                        {skill.label}
                      </span>
                      <span className="text-[rgb(var(--muted))]">{skill.progress}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-[rgb(var(--bg-soft))]">
                      <div
                        className="h-2 rounded-full bg-[rgb(var(--brand))]"
                        style={{ width: `${skill.progress}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </ProfileSection>

          <MediaGallery />
        </div>

        <ProfileSection
          title="Recent posts"
          description="Fresh writing and updates from retreats, workshops, and community circles."
        >
          <div className="space-y-4">
            {posts.map((post) => (
              <article
                key={post.title}
                className="rounded-xl border border-[rgb(var(--border))] p-4 transition-colors hover:bg-[rgb(var(--bg-soft))]"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <Badge variant="outline">{post.category}</Badge>
                  <span className="text-xs text-[rgb(var(--muted))]">
                    {post.reads} reads · {post.comments} comments
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-[rgb(var(--text-strong))]">
                  {post.title}
                </h3>
                <p className="mt-1 text-sm text-[rgb(var(--muted))]">
                  {post.excerpt}
                </p>
              </article>
            ))}

            <div className="flex justify-end">
              <Button variant="outline">View all posts</Button>
            </div>
          </div>
        </ProfileSection>
      </section>
    </main>
  );
}