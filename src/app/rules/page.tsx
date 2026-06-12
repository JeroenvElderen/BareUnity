import Link from "next/link";
import {
  Ban,
  Camera,
  CheckCircle2,
  HeartHandshake,
  Leaf,
  Lock,
  Mail,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserRoundX,
} from "lucide-react";

import { AppSidebar } from "@/components/sidebar/sidebar";
import layoutStyles from "../page.module.css";
import styles from "./rules.module.css";

const communityRules = [
  {
    number: "01",
    icon: Leaf,
    title: "Naturism only",
    summary:
      "BareUnity exists for genuine naturist and nudist living, not adult entertainment.",
    details: [
      "Posts, comments, profiles, galleries, location recommendations, and messages should reflect non-sexual naturist values: body acceptance, freedom, wellbeing, respectful community, and time in nature.",
      "Context matters. Outdoor recreation, resort life, beaches, hiking, home naturism, body positivity, and thoughtful discussion are welcome when presented naturally and respectfully.",
      "Do not frame nudity as a tease, a performance, a sales hook, a dating pitch, or a sexual invitation. If the main purpose is arousal, it does not belong here.",
    ],
    examples: [
      "Allowed: a trip report from a naturist beach, a respectful full-body naturist photo, questions about first-time etiquette.",
      "Not allowed: captions that sexualize nudity, suggestive posing, fetish framing, or posts seeking erotic attention.",
    ],
  },
  {
    number: "02",
    icon: Ban,
    title: "No pornography or explicit sexual content",
    summary:
      "Pornographic, fetish, and sexually explicit content is strictly prohibited.",
    details: [
      "Do not post explicit sexual acts, sexualized close-ups, fetish content, arousal-focused material, solicitation, erotic roleplay, or links to adult-content pages.",
      "Do not use BareUnity to advertise premium adult platforms, trade explicit images, request private sexual content, or drive traffic to sexual services.",
      "Moderators may remove borderline content when the pose, caption, comments, profile links, or posting history make the content sexual in nature.",
    ],
    examples: [
      "Allowed: non-sexual naturist images in ordinary settings.",
      "Not allowed: pornography, fetish prompts, explicit comments, or any content designed to arouse viewers.",
    ],
  },
  {
    number: "03",
    icon: Camera,
    title: "Full-body naturism or nudism only",
    summary:
      "Naturist images should show the person naturally, not isolated body parts.",
    details: [
      "Posts that show only genitals, buttocks, breasts, or other isolated body parts are not allowed, even if the caption claims the post is naturist.",
      "A natural full-body or clearly contextual photo is preferred. The setting, activity, and caption should make the naturist purpose obvious.",
      "For privacy, faces may be cropped, blurred, turned away, or covered. Privacy edits are fine as long as the image remains non-sexual and not reduced to intimate body parts.",
    ],
    examples: [
      "Allowed: a respectful full-body image at a beach, garden, campsite, spa, home, or trail setting.",
      "Not allowed: genital-only shots, butt-only shots, provocative crops, or repeated body-part posts.",
    ],
  },
  {
    number: "04",
    icon: HeartHandshake,
    title: "Respect every body",
    summary:
      "Body shaming, harassment, rude comments, and discrimination are not tolerated.",
    details: [
      "Treat every member as a whole person. No insults about size, shape, age, disability, scars, hair, skin, gender expression, orientation, race, nationality, or comfort level with nudity.",
      "Do not make unwanted comments about someone’s body, attractiveness, perceived flaws, or private life. Compliments should be respectful, non-sexual, and easy to ignore.",
      "Disagreements are allowed, but personal attacks, dogpiling, mocking, gatekeeping, and hostile debates are not.",
    ],
    examples: [
      "Allowed: sharing safety tips, etiquette reminders, or supportive naturist experiences.",
      "Not allowed: rating people, shaming bodies, making creepy remarks, or using slurs.",
    ],
  },
  {
    number: "05",
    icon: Lock,
    title: "Consent is mandatory",
    summary:
      "Only post images, stories, or identifying details with clear permission.",
    details: [
      "You may post yourself. You may post other adults only if they clearly consented to being photographed and to the image being shared in this community.",
      "If a person is visible in the background, blur or crop them unless you have permission. This is especially important at beaches, resorts, spas, changing areas, events, and private homes.",
      "Do not repost someone else’s naturist content from another platform unless you own it or have direct permission from the person shown.",
    ],
    examples: [
      "Allowed: your own photo or a group photo where every adult agreed to be shared.",
      "Not allowed: hidden-camera images, screenshots from private chats, revenge posting, or outing someone as a naturist.",
    ],
  },
  {
    number: "06",
    icon: UserRoundX,
    title: "No minors in nude content",
    summary:
      "Content involving minors in any form of nudity is strictly prohibited.",
    details: [
      "BareUnity is an adult-only community. Do not post nude or partially nude content involving anyone under 18, even in family naturist, beach, documentary, artistic, or educational contexts.",
      "Do not ask for, describe, sexualize, joke about, or debate access to nude content involving minors. Safety concerns should be reported, not discussed graphically.",
      "If moderators cannot confidently determine that everyone shown is an adult, the content may be removed and the account may be restricted while reviewed.",
    ],
    examples: [
      "Allowed: adult-only naturist discussion that does not include minors in nude imagery.",
      "Not allowed: any nude minor content, links to such content, or attempts to justify posting it.",
    ],
  },
  {
    number: "07",
    icon: Sparkles,
    title: "Stay naturist-themed",
    summary:
      "Posts should connect clearly to naturism, nudism, body positivity, locations, or lifestyle.",
    details: [
      "Good topics include etiquette, first-time questions, naturist travel, beaches, resorts, hiking, wellness, body acceptance, photography consent, legal considerations, and community stories.",
      "Low-effort selfies, unrelated memes, spam, political flame wars, generic dating posts, and content with no naturist angle may be removed.",
      "Location recommendations should be practical, respectful, and safety-minded. Include what visitors should know about access, etiquette, local rules, and privacy.",
    ],
    examples: [
      "Allowed: a review of a naturist campsite or a discussion about feeling comfortable at a first nude swim.",
      "Not allowed: unrelated selfies, ragebait, spam links, or posts that only seek attention.",
    ],
  },
  {
    number: "08",
    icon: ShieldAlert,
    title: "No solicitation, hookups, or dating pressure",
    summary:
      "BareUnity is not for hookups, sexual solicitation, or pressuring members into private contact.",
    details: [
      "Do not post looking-for-sex requests, ask members to meet privately for sexual reasons, send unwanted direct messages, or turn community conversations into dating pitches.",
      "Do not ask for explicit photos, private albums, body checks, verification photos, or off-platform contact in a sexual or coercive way.",
      "Meetups and travel discussions must stay social, safety-focused, and naturist-themed. Respect a clear no, a non-response, or any boundary immediately.",
    ],
    examples: [
      "Allowed: asking for public beach etiquette or group-event advice.",
      "Not allowed: hookup ads, repeated private-message requests, or pressuring someone to reveal more.",
    ],
  },
  {
    number: "09",
    icon: ShieldCheck,
    title: "Protect privacy and safety",
    summary:
      "Do not share personal information or reveal someone’s identity without consent.",
    details: [
      "Never publish someone’s real name, address, workplace, school, phone number, private social accounts, vehicle details, exact home location, or identifying travel plans without permission.",
      "Do not threaten to expose someone, save and redistribute their images, identify people from the background of photos, or encourage harassment across platforms.",
      "When posting location content, avoid exposing private property, secluded visitors, or exact real-time whereabouts in a way that could create risk.",
    ],
    examples: [
      "Allowed: sharing general public destination advice after checking local rules.",
      "Not allowed: doxxing, outing, stalking, or posting identifiable bystanders without consent.",
    ],
  },
  {
    number: "10",
    icon: CheckCircle2,
    title: "Follow platform-wide rules and the law",
    summary:
      "Members must follow BareUnity policies, Reddit-style community expectations, and applicable laws.",
    details: [
      "Content must comply with the platform policies, local law, venue rules, privacy rights, copyright rules, and safety requirements that apply to the place or content involved.",
      "Do not encourage illegal public nudity, trespassing, harassment, non-consensual photography, evading bans, or unsafe travel behavior.",
      "Copyright matters: post content you created, content you are licensed to use, or content you have permission to share with clear credit when appropriate.",
    ],
    examples: [
      "Allowed: discussing local etiquette and reminding people to check current rules before visiting.",
      "Not allowed: instructing people to break laws, sneak photos, trespass, or repost stolen content.",
    ],
  },
  {
    number: "11",
    icon: Mail,
    title: "Respond to moderator messages",
    summary:
      "If moderators flag your profile or activity, you must respond within 48 hours.",
    details: [
      "Moderators may contact you if your content, profile links, comments, or activity appear to mix naturism with sexual content, spam, impersonation, or consent concerns.",
      "A good-faith response helps resolve misunderstandings quickly. Ignoring safety or moderation messages may result in removals, posting restrictions, or a ban.",
      "Do not argue in bad faith, delete evidence to evade review, harass moderators, or create alternate accounts to continue the same behavior.",
    ],
    examples: [
      "Allowed: calmly explaining context, editing a profile link, or asking what needs to change.",
      "Not allowed: refusing to cooperate, retaliating, or using another account to bypass a decision.",
    ],
  },
];

const enforcementSteps = [
  "Content may be removed without warning when it risks sexualizing naturism, exposing private information, or harming member safety.",
  "Moderators may ask for edits, context, consent confirmation, or profile cleanup before restoring access.",
  "Serious violations can lead to immediate bans, especially minors, non-consensual content, doxxing, harassment, explicit sexual content, or ban evasion.",
  "Appeals should be concise, respectful, and specific. Explain what happened, what you changed, and how future posts will follow the rules.",
];

const heroPrinciples = [
  {
    icon: ShieldCheck,
    title: "Respect",
    description: "Treat every member with kindness",
  },
  {
    icon: Lock,
    title: "Privacy",
    description: "Protect yourself and others",
  },
  {
    icon: Leaf,
    title: "Freedom",
    description: "Enjoy naturism responsibly",
  },
];

const whyRules = [
  "Safe adult naturist environment",
  "Respectful, consent-first community",
  "Positive non-sexual experiences",
  "Global naturist connection",
];

const notAllowed = [
  "Harassment, hate speech, or body shaming",
  "Pornography, fetish, or explicit sexual content",
  "Private information or non-consensual media",
  "Minor nudity, spam, scams, or illegal activity",
];

const quickActions = [
  {
    icon: Camera,
    title: "Gallery",
    description: "Review what good naturist sharing looks like in context.",
    href: "/gallery",
    cta: "Open gallery",
  },
  {
    icon: HeartHandshake,
    title: "Discussion",
    description: "Keep conversations respectful, practical, and non-sexual.",
    href: "/discussion",
    cta: "Join discussion",
  },
  {
    icon: ShieldCheck,
    title: "Verification",
    description: "Build trust before accessing more community features.",
    href: "/verified",
    cta: "Get verified",
  },
  {
    icon: Leaf,
    title: "Explore",
    description: "Check local etiquette and privacy before sharing places.",
    href: "/explore",
    cta: "Explore places",
  },
];

export default function RulesPage() {
  return (
    <main className={layoutStyles.main}>
      <AppSidebar />

      <section className={styles.page} aria-labelledby="rules-heading">
        <header className={styles.header}>
          <div className={styles.headerCopy}>
            <p className={styles.kicker}>Community standard</p>
            <h1 id="rules-heading">Rules &amp; Guidelines</h1>
            <p className={styles.lede}>
              The member standard for keeping BareUnity adult-only,
              consent-first, respectful, and clearly naturist.
            </p>
          </div>

          <div className={styles.statusPanel} aria-label="Rules summary">
            <div>
              <strong>{communityRules.length}</strong>
              <span>rules</span>
            </div>
            <div>
              <strong>18+</strong>
              <span>adult only</span>
            </div>
            <div>
              <strong>48h</strong>
              <span>moderator replies</span>
            </div>
          </div>
        </header>

        <div className={styles.bodyGrid}>
          <aside className={styles.navColumn} aria-label="Rules navigation">
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <ShieldCheck size={20} aria-hidden />
                <h2>Read First</h2>
              </div>
              <p>
                Naturism is welcome here when it is non-sexual, consent-based,
                and respectful of privacy.
              </p>
            </section>

            <nav className={styles.ruleNav} aria-label="Community rules">
              {communityRules.map((rule) => (
                <a key={rule.number} href={`#rule-${rule.number}`}>
                  <span>{rule.number}</span>
                  {rule.title}
                </a>
              ))}
            </nav>

            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <Mail size={20} aria-hidden />
                <h2>Need Help?</h2>
              </div>
              <p>
                Questions, safety concerns, and moderation requests can go to
                the BareUnity support address.
              </p>
              <Link
                className={styles.panelAction}
                href="mailto:jeroen@bareunity.com"
              >
                Contact support
              </Link>
            </section>
          </aside>

          <div className={styles.mainColumn}>
            <section
              className={styles.principles}
              aria-label="Community values"
            >
              {heroPrinciples.map((principle) => {
                const Icon = principle.icon;

                return (
                  <article
                    key={principle.title}
                    className={styles.principleItem}
                  >
                    <Icon size={22} aria-hidden />
                    <div>
                      <strong>{principle.title}</strong>
                      <span>{principle.description}</span>
                    </div>
                  </article>
                );
              })}
            </section>

            <section
              className={styles.rulesColumn}
              aria-labelledby="community-rules-heading"
            >
              <div className={styles.sectionHeader}>
                <p className={styles.kicker}>Rulebook</p>
                <h2 id="community-rules-heading">Our Community Rules</h2>
                <p>
                  Open any rule for the full guidance and examples. The top
                  line is the standard moderators apply first.
                </p>
              </div>

              <div className={styles.rulesList}>
                {communityRules.map((rule) => {
                  const Icon = rule.icon;

                  return (
                    <article
                      key={rule.number}
                      id={`rule-${rule.number}`}
                      className={styles.ruleCard}
                    >
                      <span className={styles.ruleNumber}>{rule.number}</span>
                      <div className={styles.ruleCopy}>
                        <div className={styles.ruleTitleRow}>
                          <span className={styles.ruleIcon}>
                            <Icon size={20} aria-hidden />
                          </span>
                          <h3>{rule.title}</h3>
                        </div>
                        <p>{rule.summary}</p>
                        <details className={styles.ruleDetails}>
                          <summary>View guidance</summary>
                          <ul>
                            {rule.details.map((detail) => (
                              <li key={detail}>{detail}</li>
                            ))}
                          </ul>
                          <div className={styles.examples}>
                            {rule.examples.map((example) => (
                              <p key={example}>{example}</p>
                            ))}
                          </div>
                        </details>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <section
              className={styles.supportGrid}
              aria-label="Rules support information"
            >
              <InfoCard
                icon={HeartHandshake}
                title="Why We Have Rules"
                description="Our rules exist to protect our members and create an inclusive environment where everyone can enjoy naturism with peace of mind."
                items={whyRules}
                tone="positive"
              />

              <InfoCard
                icon={Ban}
                title="What We Don’t Allow"
                items={notAllowed}
                tone="danger"
              />

              <section className={styles.reminderCard}>
                <span className={styles.reminderIcon}>
                  <Leaf size={22} aria-hidden />
                </span>
                <h2>Community Reminder</h2>
                <p>
                  We are a community built on freedom, respect, and nature.
                  Let’s keep BareUnity a place we’re proud of.
                </p>
                <Link className={styles.textLink} href="/policies">
                  Read platform policies
                </Link>
              </section>
            </section>

            <section
              className={styles.enforcementPanel}
              aria-labelledby="moderation-heading"
            >
              <div>
                <p className={styles.kicker}>Moderation approach</p>
                <h2 id="moderation-heading">How these rules are enforced</h2>
              </div>
              <ol>
                {enforcementSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </section>

            <section
              className={styles.quickActions}
              aria-label="Helpful next steps"
            >
              {quickActions.map((action) => {
                const Icon = action.icon;

                return (
                  <article
                    key={action.title}
                    className={styles.quickActionCard}
                  >
                    <Icon size={22} aria-hidden />
                    <div>
                      <h2>{action.title}</h2>
                      <p>{action.description}</p>
                      <Link href={action.href}>{action.cta}</Link>
                    </div>
                  </article>
                );
              })}
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}

type InfoCardProps = {
  icon: typeof ShieldCheck;
  title: string;
  description?: string;
  items: string[];
  tone: "positive" | "danger";
};

function InfoCard({ icon: Icon, title, description, items, tone }: InfoCardProps) {
  return (
    <section className={styles.infoCard} data-tone={tone}>
      <span className={styles.infoIcon}>
        <Icon size={22} aria-hidden />
      </span>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      <ul>
        {items.map((item) => (
          <li key={item}>
            {tone === "danger" ? <Ban size={16} aria-hidden /> : <CheckCircle2 size={16} aria-hidden />}
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
