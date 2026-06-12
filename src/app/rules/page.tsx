import Link from "next/link";
import {
  AlertTriangle,
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

export default function RulesPage() {
  return (
    <main className={layoutStyles.main}>
      <AppSidebar />

      <section className={styles.page} aria-labelledby="rules-heading">
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.kicker}>Community standards</p>
            <h1 id="rules-heading">BareUnity rules for safe naturist sharing</h1>
            <p>
              A detailed, consent-first guide for keeping BareUnity focused on
              respectful naturism, body acceptance, privacy, and practical
              community support.
            </p>
          </div>
          <div className={styles.heroCard}>
            <AlertTriangle size={28} aria-hidden />
            <strong>Simple test before posting</strong>
            <span>
              Would this feel appropriate at a respectful naturist club, beach,
              resort, or group event? If not, rewrite it, crop it differently,
              or do not post it.
            </span>
          </div>
        </section>

        <nav className={styles.ruleNav} aria-label="Rules quick links">
          {communityRules.map((rule) => (
            <Link key={rule.number} href={`#rule-${rule.number}`}>
              {rule.number}. {rule.title}
            </Link>
          ))}
        </nav>

        <section className={styles.rulesGrid}>
          {communityRules.map((rule) => {
            const Icon = rule.icon;

            return (
              <article
                key={rule.number}
                id={`rule-${rule.number}`}
                className={styles.ruleCard}
              >
                <div className={styles.ruleHeader}>
                  <span className={styles.ruleNumber}>{rule.number}</span>
                  <span className={styles.ruleIcon}>
                    <Icon size={22} aria-hidden />
                  </span>
                </div>
                <div className={styles.ruleBody}>
                  <h2>{rule.title}</h2>
                  <p className={styles.summary}>{rule.summary}</p>
                  <ul className={styles.detailsList}>
                    {rule.details.map((detail) => (
                      <li key={detail}>{detail}</li>
                    ))}
                  </ul>
                  <div className={styles.examples}>
                    {rule.examples.map((example) => (
                      <p key={example}>{example}</p>
                    ))}
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        <section className={styles.enforcementPanel}>
          <div>
            <p className={styles.kicker}>Moderation approach</p>
            <h2>How these rules are enforced</h2>
            <p>
              Moderation decisions prioritize consent, privacy, adult safety,
              and keeping naturism clearly separate from sexual content.
            </p>
          </div>
          <ol>
            {enforcementSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      </section>
    </main>
  );
}