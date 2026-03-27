"use client";

import { useEffect, useMemo, useState } from "react";

import { UsernameChangeModal } from "@/components/settings/username-change-modal";
import { AppSidebar } from "@/components/sidebar/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import layoutStyles from "../page.module.css";
import styles from "./settings.module.css";

type OptionState = "On" | "Off" | "Friends" | "Members" | "Private";

type SettingOption = {
  label: string;
  detail: string;
  state: OptionState;
};

type SettingSection = {
  key: string;
  title: string;
  subtitle: string;
  pill: string;
  tone: "calm" | "sun" | "sea" | "earth";
  options: SettingOption[];
};

const settingSections: SettingSection[] = [
  {
    key: "profile",
    title: "Profile & Login",
    subtitle: "Direct controls for username, email, password, and account recovery.",
    pill: "Profile",
    tone: "calm",
    options: [
      { label: "Username", detail: "Change your @handle used in search and mentions.", state: "On" },
      { label: "Primary email", detail: "Update your sign-in email and verification address.", state: "On" },
      { label: "Password reset", detail: "Rotate password and invalidate older credentials.", state: "On" },
      { label: "Passkey sign-in", detail: "Use device biometrics as passwordless login.", state: "On" },
      { label: "Recovery codes", detail: "Generate backup codes for account recovery.", state: "On" },
      { label: "Connected devices", detail: "Review and remove active sessions.", state: "On" },
    ],
  },
  {
    key: "account",
    title: "Account & Identity",
    subtitle: "Core identity presentation and trust controls.",
    pill: "Account",
    tone: "calm",
    options: [
      { label: "Display name visibility", detail: "Show your chosen name in public spaces.", state: "On" },
      { label: "Profile verification badge", detail: "Display trust verification on your profile.", state: "On" },
      { label: "Two-factor authentication", detail: "Require a second login verification step.", state: "On" },
      { label: "Login alerts", detail: "Get notified when your account is accessed from a new device.", state: "On" },
      { label: "Session management", detail: "Allow remote logout from other active devices.", state: "On" },
    ],
  },
  {
    key: "boundaries",
    title: "Boundaries & Consent",
    subtitle: "High-impact consent settings for safer naturist interactions.",
    pill: "Consent",
    tone: "sun",
    options: [
      { label: "Block DMs from non-connections", detail: "Only connected members can message you.", state: "On" },
      { label: "Meetup invite approval", detail: "Manually approve each event invitation.", state: "On" },
      { label: "Boundary card in new chats", detail: "Auto-share your comfort preferences in first contact.", state: "On" },
      { label: "Voice/video call permission", detail: "Only friends can request live calls.", state: "Friends" },
      { label: "Tag approval", detail: "Require approval before you are tagged in posts.", state: "On" },
    ],
  },
  {
    key: "privacy",
    title: "Privacy",
    subtitle: "Visibility controls that directly affect your personal exposure.",
    pill: "Privacy",
    tone: "sea",
    options: [
      { label: "Profile visibility", detail: "Who can view your full profile page.", state: "Members" },
      { label: "Location precision", detail: "Share only broad region instead of exact location.", state: "Private" },
      { label: "Online status", detail: "Show when you are currently online.", state: "Off" },
      { label: "Read receipts", detail: "Let others know you have seen their messages.", state: "Off" },
      { label: "Saved posts visibility", detail: "Allow others to see your saved items.", state: "Private" },
      { label: "Search indexing", detail: "Allow profile snippets in public search engines.", state: "Off" },
    ],
  },
  {
    key: "safety",
    title: "Safety & Moderation",
    subtitle: "Controls that reduce risk and improve moderation response.",
    pill: "Safety",
    tone: "sun",
    options: [
      { label: "Sensitive media blur", detail: "Blur sensitive media previews by default.", state: "On" },
      { label: "Harassment phrase detection", detail: "Auto-flag abusive language in interactions.", state: "On" },
      { label: "Keyword blocklist", detail: "Hide comments containing blocked words.", state: "On" },
      { label: "Trusted circles only", detail: "Limit interaction to verified/trusted members.", state: "Friends" },
      { label: "Emergency support shortcut", detail: "Show quick-report and support actions in chats.", state: "On" },
    ],
  },
  {
    key: "notifications",
    title: "Notifications",
    subtitle: "Only key alerts that materially affect your account and plans.",
    pill: "Alerts",
    tone: "calm",
    options: [
      { label: "Security alerts", detail: "Immediate alerts for account-risk events.", state: "On" },
      { label: "Direct message mentions", detail: "Get notified when someone directly mentions you.", state: "On" },
      { label: "Booking changes", detail: "Alerts for booking updates and schedule changes.", state: "On" },
      { label: "Event reminders", detail: "Reminder before events and check-ins.", state: "On" },
      { label: "Weekly digest", detail: "Single summary instead of frequent feed alerts.", state: "Members" },
    ],
  },
  {
    key: "discovery",
    title: "Feed & Discovery",
    subtitle: "Preferences that strongly affect what content you see.",
    pill: "Discovery",
    tone: "earth",
    options: [
      { label: "Wellness-first ranking", detail: "Prioritize educational and wellness naturist content.", state: "On" },
      { label: "Family-safe mode", detail: "Filter content to keep feed family-appropriate.", state: "On" },
      { label: "Hide sponsored posts", detail: "Reduce promotional content in your main feed.", state: "On" },
      { label: "Nearby circles", detail: "Recommend local communities and trusted hosts.", state: "Members" },
      { label: "Retreat recommendations", detail: "Show relevant naturist retreats and events.", state: "On" },
    ],
  },
];

function getToneClass(tone: SettingSection["tone"]) {
  switch (tone) {
    case "sun":
      return styles.toneSun;
    case "sea":
      return styles.toneSea;
    case "earth":
      return styles.toneEarth;
    default:
      return styles.toneCalm;
  }
}

function getStateClass(state: OptionState) {
  if (state === "On") return styles.stateOn;
  if (state === "Off") return styles.stateOff;
  if (state === "Private") return styles.statePrivate;
  return styles.stateLimited;
}

export default function SettingsPage() {
  const [activeSectionKey, setActiveSectionKey] = useState(settingSections[0]?.key ?? "profile");
  const [isUsernameModalOpen, setIsUsernameModalOpen] = useState(false);
  const [isSavingUsername, setIsSavingUsername] = useState(false);
  const [currentUsername, setCurrentUsername] = useState("member");
  const [usernameUpdateError, setUsernameUpdateError] = useState<string | null>(null);
  const [usernameUpdateStatus, setUsernameUpdateStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let isMounted = true;

    void supabase.auth.getUser().then(async ({ data }) => {
      if (!isMounted || !data.user) return;

      const { data: profileData } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", data.user.id)
        .maybeSingle();

      const username = profileData?.username?.trim();
      if (!username || !isMounted) return;
      setCurrentUsername(username);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const activeSection = useMemo(
    () => settingSections.find((section) => section.key === activeSectionKey) ?? settingSections[0],
    [activeSectionKey],
  );

  const totalOptions = settingSections.reduce((acc, section) => acc + section.options.length, 0);
  const handleUsernameSave = async (nextUsername: string) => {
    const normalizedNext = nextUsername.trim();
    if (!normalizedNext) return;

    setIsSavingUsername(true);
    setUsernameUpdateError(null);
    setUsernameUpdateStatus(null);

    if (!isSupabaseConfigured) {
      setCurrentUsername(normalizedNext);
      setIsSavingUsername(false);
      setIsUsernameModalOpen(false);
      setUsernameUpdateStatus("Username updated locally.");
      return;
    }

    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      setIsSavingUsername(false);
      setUsernameUpdateError("You need to be signed in to update your username.");
      return;
    }

    const { error } = await supabase.from("profiles").update({ username: normalizedNext }).eq("id", data.user.id);

    setIsSavingUsername(false);

    if (error) {
      setUsernameUpdateError(error.message || "Could not update username right now.");
      return;
    }

    setCurrentUsername(normalizedNext);
    setIsUsernameModalOpen(false);
    setUsernameUpdateStatus(`Username changed to @${normalizedNext}.`);
  };

  if (!activeSection) return null;

  return (
    <main className={`${layoutStyles.main} w-full max-w-full`}>
      <AppSidebar />

      <section className={styles.pageSection}>
        <div className={styles.contentWrap}>
          <header className={styles.header}>
            <p className={styles.eyebrow}>Account workshop</p>
            <h1>Settings & Preferences</h1>
            <p className={styles.subhead}>
              Focused settings only: these options are the highest-impact controls for privacy, consent, safety, and
              account trust.
            </p>
            <div className={styles.headerPills}>
              <span className={styles.headerPill}>{totalOptions} high-impact options</span>
              <span className={styles.headerPill}>{settingSections.length} focused subjects</span>
            </div>
          </header>

          <nav className={styles.subjectNav} aria-label="Settings subjects">
            {settingSections.map((section) => (
              <button
                key={section.key}
                type="button"
                className={`${styles.subjectChip} ${activeSection.key === section.key ? styles.subjectChipActive : ""}`}
                onClick={() => setActiveSectionKey(section.key)}
              >
                <span>{section.title}</span>
                <Badge variant="outline">{section.options.length}</Badge>
              </button>
            ))}
          </nav>

          <label className={styles.subjectSelectWrap}>
            <span>Jump to subject</span>
            <select
              className={styles.subjectSelect}
              value={activeSection.key}
              onChange={(event) => setActiveSectionKey(event.target.value)}
            >
              {settingSections.map((section) => (
                <option key={section.key} value={section.key}>
                  {section.title}
                </option>
              ))}
            </select>
          </label>

          <Card className={`${styles.card} ${getToneClass(activeSection.tone)}`}>
            <CardContent className={styles.cardContent}>
              <div className={styles.sectionHeading}>
                <div>
                  <p className={styles.sectionPill}>{activeSection.pill}</p>
                  <h2>{activeSection.title}</h2>
                </div>
                <Badge variant="outline">{activeSection.options.length} options</Badge>
              </div>
              <p className={styles.sectionSubtitle}>{activeSection.subtitle}</p>
              {usernameUpdateStatus ? <p className={styles.statusNote}>{usernameUpdateStatus}</p> : null}

              <div className={styles.optionList}>
                {activeSection.options.map((option) => {
                  const isUsernameOption = activeSection.key === "profile" && option.label === "Username";

                  if (isUsernameOption) {
                    return (
                      <button
                        key={option.label}
                        type="button"
                        className={`${styles.optionItem} ${styles.optionItemButton}`}
                        onClick={() => {
                          setUsernameUpdateStatus(null);
                          setUsernameUpdateError(null);
                          setIsUsernameModalOpen(true);
                        }}
                      >
                        <div>
                          <h3>{option.label}</h3>
                          <p>{option.detail}</p>
                        </div>
                        <span className={`${styles.statePill} ${styles.stateOn}`}>Edit</span>
                      </button>
                    );
                  }

                  return (
                    <article key={option.label} className={styles.optionItem}>
                      <div>
                        <h3>{option.label}</h3>
                        <p>{option.detail}</p>
                      </div>
                      <button type="button" className={`${styles.statePill} ${getStateClass(option.state)}`}>
                        {option.state}
                      </button>
                    </article>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
      <UsernameChangeModal
        key={`${currentUsername}-${isUsernameModalOpen ? "open" : "closed"}`}
        isOpen={isUsernameModalOpen}
        currentUsername={currentUsername}
        isSaving={isSavingUsername}
        errorMessage={usernameUpdateError}
        onCancel={() => {
          setUsernameUpdateError(null);
          setIsUsernameModalOpen(false);
        }}
        onSave={(nextUsername) => {
          void handleUsernameSave(nextUsername);
        }}
      />
    </main>
  );
}