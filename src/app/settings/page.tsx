"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";

import { PasswordResetModal } from "@/components/settings/password-reset-modal";
import { PrimaryEmailModal } from "@/components/settings/primary-email-modal";
import { RecoveryKeysModal } from "@/components/settings/recovery-keys-modal";
import { SettingsOptionCard } from "@/components/settings/settings-option-card";
import { UsernameChangeModal } from "@/components/settings/username-change-modal";
import { AppSidebar } from "@/components/sidebar/sidebar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  buildUserScopedCacheKey,
  readCachedValue,
  writeCachedValue,
} from "@/lib/client-cache";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import layoutStyles from "../page.module.css";
import styles from "./settings.module.css";

type OptionState = "No-one" | "Friends only" | "Everyone";
type BooleanState = "No" | "Yes";

type SettingOption =
  | {
      key: string;
      label: string;
      detail: string;
      state: OptionState;
      control?: "visibility";
    }
  | {
      key: string;
      label: string;
      detail: string;
      state: BooleanState;
      control: "boolean";
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
    subtitle:
      "Direct controls for username, email, password, and account recovery.",
    pill: "Profile",
    tone: "calm",
    options: [
      {
        key: "Username",
        label: "Username",
        detail: "Change your @handle used in search and mentions.",
        state: "Everyone",
      },
      {
        key: "Primary email",
        label: "Primary email",
        detail: "Update your sign-in email and verification address.",
        state: "Everyone",
      },
      {
        key: "Password reset",
        label: "Password reset",
        detail: "Rotate password and invalidate older credentials.",
        state: "Everyone",
      },
      {
        key: "Recovery keys",
        label: "Recovery keys",
        detail: "Generate backup keys for account recovery.",
        state: "Everyone",
      },
      {
        key: "Connected devices",
        label: "Connected devices",
        detail: "Review and remove active sessions.",
        state: "Everyone",
      },
    ],
  },
  {
    key: "account",
    title: "Account & Identity",
    subtitle: "Core identity presentation and trust controls.",
    pill: "Account",
    tone: "calm",
    options: [
      {
        key: "Display name visibility",
        label: "Display name visibility",
        detail: "Show your chosen name in public spaces.",
        state: "Everyone",
      },
      {
        key: "Profile verification badge",
        label: "Profile verification badge",
        detail: "Display trust verification on your profile.",
        state: "Everyone",
      },
      {
        key: "Two-factor authentication",
        label: "Two-factor authentication",
        detail: "Require a second login verification step.",
        state: "Everyone",
      },
      {
        key: "Login alerts",
        label: "Login alerts",
        detail: "Get notified when your account is accessed from a new device.",
        state: "Everyone",
      },
      {
        key: "Session management",
        label: "Session management",
        detail: "Allow remote logout from other active devices.",
        state: "Everyone",
      },
    ],
  },
  {
    key: "boundaries",
    title: "Boundaries & Consent",
    subtitle: "High-impact consent settings for safer naturist interactions.",
    pill: "Consent",
    tone: "sun",
    options: [
      {
        key: "Block DMs from non-connections",
        label: "Block DMs from non-connections",
        detail: "Only connected members can message you.",
        state: "Everyone",
      },
      {
        key: "Meetup invite approval",
        label: "Meetup invite approval",
        detail: "Manually approve each event invitation.",
        state: "Everyone",
      },
      {
        key: "Boundary card in new chats",
        label: "Boundary card in new chats",
        detail: "Auto-share your comfort preferences in first contact.",
        state: "Everyone",
      },
      {
        key: "Voice/video call permission",
        label: "Voice/video call permission",
        detail: "Only friends can request live calls.",
        state: "Friends only",
      },
      {
        key: "Tag approval",
        label: "Tag approval",
        detail: "Require approval before you are tagged in posts.",
        state: "Everyone",
      },
    ],
  },
  {
    key: "privacy",
    title: "Privacy",
    subtitle:
      "Visibility controls that directly affect your personal exposure.",
    pill: "Privacy",
    tone: "sea",
    options: [
      {
        key: "Profile visibility",
        label: "Profile visibility",
        detail: "Who can view your full profile page.",
        state: "Everyone",
      },
      {
        key: "Location precision",
        label: "Location precision",
        detail: "Share only broad region instead of exact location.",
        state: "No-one",
      },
      {
        key: "Online status",
        label: "Online status",
        detail: "Show when you are currently online.",
        state: "No-one",
      },
      {
        key: "Read receipts",
        label: "Read receipts",
        detail: "Let others know you have seen their messages.",
        state: "No-one",
      },
      {
        key: "Saved posts visibility",
        label: "Saved posts visibility",
        detail: "Allow others to see your saved items.",
        state: "No-one",
      },
      {
        key: "Search indexing",
        label: "Search indexing",
        detail: "Allow profile snippets in public search engines.",
        state: "No-one",
      },
    ],
  },
  {
    key: "safety",
    title: "Safety & Moderation",
    subtitle: "Controls that reduce risk and improve moderation response.",
    pill: "Safety",
    tone: "sun",
    options: [
      {
        key: "Sensitive media blur",
        label: "Sensitive media blur",
        detail: "Blur sensitive media previews by default.",
        state: "Everyone",
      },
      {
        key: "Harassment phrase detection",
        label: "Harassment phrase detection",
        detail: "Auto-flag abusive language in interactions.",
        state: "Everyone",
      },
      {
        key: "Keyword blocklist",
        label: "Keyword blocklist",
        detail: "Hide comments containing blocked words.",
        state: "Everyone",
      },
      {
        key: "Trusted circles only",
        label: "Trusted circles only",
        detail: "Limit interaction to verified/trusted members.",
        state: "Friends only",
      },
      {
        key: "Emergency support shortcut",
        label: "Emergency support shortcut",
        detail: "Show quick-report and support actions in chats.",
        state: "Everyone",
      },
    ],
  },
  {
    key: "notifications",
    title: "Notifications",
    subtitle: "Only key alerts that materially affect your account and plans.",
    pill: "Alerts",
    tone: "calm",
    options: [
      {
        key: "Security alerts",
        label: "Security alerts",
        detail: "Immediate alerts for account-risk events.",
        state: "Everyone",
      },
      {
        key: "Direct message mentions",
        label: "Direct message mentions",
        detail: "Get notified when someone directly mentions you.",
        state: "Everyone",
      },
      {
        key: "Booking changes",
        label: "Booking changes",
        detail: "Alerts for booking updates and schedule changes.",
        state: "Everyone",
      },
      {
        key: "Event reminders",
        label: "Event reminders",
        detail: "Reminder before events and check-ins.",
        state: "Everyone",
      },
      {
        key: "Weekly digest",
        label: "Weekly digest",
        detail: "Single summary instead of frequent feed alerts.",
        state: "Everyone",
      },
    ],
  },
  {
    key: "discovery",
    title: "Feed & Discovery",
    subtitle: "Preferences that strongly affect what content you see.",
    pill: "Discovery",
    tone: "earth",
    options: [
      {
        key: "Wellness-first ranking",
        label: "Wellness-first ranking",
        detail: "Prioritize educational and wellness naturist content.",
        state: "Everyone",
      },
      {
        key: "Family-safe mode",
        label: "Family-safe mode",
        detail: "Filter content to keep feed family-appropriate.",
        state: "Everyone",
      },
      {
        key: "Hide sponsored posts",
        label: "Hide sponsored posts",
        detail: "Reduce promotional content in your main feed.",
        state: "Everyone",
      },
      {
        key: "Nearby circles",
        label: "Nearby circles",
        detail: "Recommend local communities and trusted hosts.",
        state: "Everyone",
      },
      {
        key: "Retreat recommendations",
        label: "Retreat recommendations",
        detail: "Show relevant naturist retreats and events.",
        state: "Everyone",
      },
      {
        key: "Post images in gallery",
        label: "Add post images to gallery",
        detail:
          "Choose whether images attached to your feed posts can appear in the public Gallery.",
        state: "Yes",
        control: "boolean",
      },
    ],
  },
];

const PROFILE_SECURITY_CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 12;

type ProfileSecurityCache = {
  username: string;
  email: string;
  recoveryKeys: string[];
  addPostImagesToGallery: boolean;
  optionStates: Record<string, OptionState>;
};

type VerificationApplicationDefaults = {
  legalName: string;
  displayName: string;
  dateOfBirth: string;
  country: string;
  membershipType: string;
};

type VerificationApplicationSnapshot = {
  eligible: boolean;
  status: string;
  defaults: VerificationApplicationDefaults;
};

type VerificationApplicationForm = VerificationApplicationDefaults & {
  idType: string;
  motivation: string;
  idDocument: File | null;
  isAdultConfirmed: boolean;
  isConsentConfirmed: boolean;
  isPolicyConfirmed: boolean;
  isPhotoRuleConfirmed: boolean;
};

const emptyVerificationApplicationForm: VerificationApplicationForm = {
  legalName: "",
  displayName: "",
  dateOfBirth: "",
  country: "",
  membershipType: "",
  idType: "",
  motivation: "",
  idDocument: null,
  isAdultConfirmed: false,
  isConsentConfirmed: false,
  isPolicyConfirmed: false,
  isPhotoRuleConfirmed: false,
};

function buildDefaultOptionStates() {
  const seeded: Record<string, OptionState> = {};
  for (const section of settingSections) {
    for (const option of section.options) {
      if (option.control === "boolean") continue;
      seeded[`${section.key}.${option.key}`] = option.state;
    }
  }
  return seeded;
}

function normalizeOptionStates(value: unknown) {
  const defaults = buildDefaultOptionStates();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return defaults;
  }

  for (const [key, state] of Object.entries(value)) {
    if (
      state === "No-one" ||
      state === "Friends only" ||
      state === "Everyone"
    ) {
      defaults[key] = state;
    }
  }

  return defaults;
}

function getCachedProfileSecurity(cacheKey: string) {
  return readCachedValue<ProfileSecurityCache>(
    cacheKey,
    PROFILE_SECURITY_CACHE_MAX_AGE_MS,
  );
}

function getOptionCardVariant(
  index: number,
): "frame" | "split" | "glow" | "band" {
  const pattern = index % 4;
  if (pattern === 2) return "glow";
  if (pattern === 3) return "band";
  return "frame";
}

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
  if (state === "Everyone") return styles.stateOn;
  if (state === "No-one") return styles.statePrivate;
  return styles.stateLimited;
}

export default function SettingsPage() {
  const [profileSecurityCacheKey] = useState(() =>
    buildUserScopedCacheKey("settings:profile-security"),
  );
  const cachedProfileSecurity = getCachedProfileSecurity(
    profileSecurityCacheKey,
  );
  const [activeSectionKey, setActiveSectionKey] = useState(
    settingSections[0]?.key ?? "profile",
  );
  const [isUsernameModalOpen, setIsUsernameModalOpen] = useState(false);
  const [isSavingUsername, setIsSavingUsername] = useState(false);
  const [currentUsername, setCurrentUsername] = useState(
    cachedProfileSecurity?.username ?? "member",
  );
  const [currentEmail, setCurrentEmail] = useState(
    cachedProfileSecurity?.email ?? "member@example.com",
  );
  const [usernameUpdateError, setUsernameUpdateError] = useState<string | null>(
    null,
  );
  const [usernameUpdateStatus, setUsernameUpdateStatus] = useState<
    string | null
  >(null);
  const [isPrimaryEmailModalOpen, setIsPrimaryEmailModalOpen] = useState(false);
  const [isSavingPrimaryEmail, setIsSavingPrimaryEmail] = useState(false);
  const [primaryEmailUpdateError, setPrimaryEmailUpdateError] = useState<
    string | null
  >(null);
  const [primaryEmailUpdateStatus, setPrimaryEmailUpdateStatus] = useState<
    string | null
  >(null);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [passwordUpdateError, setPasswordUpdateError] = useState<string | null>(
    null,
  );
  const [passwordUpdateStatus, setPasswordUpdateStatus] = useState<
    string | null
  >(null);
  const [isRecoveryKeysModalOpen, setIsRecoveryKeysModalOpen] = useState(false);
  const [isSavingRecoveryKeys, setIsSavingRecoveryKeys] = useState(false);
  const [recoveryKeys, setRecoveryKeys] = useState<string[]>(
    cachedProfileSecurity?.recoveryKeys ?? [],
  );
  const [recoveryKeysError, setRecoveryKeysError] = useState<string | null>(
    null,
  );
  const [recoveryKeysStatus, setRecoveryKeysStatus] = useState<string | null>(
    null,
  );
  const [addPostImagesToGallery, setAddPostImagesToGallery] = useState(
    cachedProfileSecurity?.addPostImagesToGallery ?? true,
  );
  const [galleryPreferenceStatus, setGalleryPreferenceStatus] = useState<
    string | null
  >(null);
  const [galleryPreferenceError, setGalleryPreferenceError] = useState<
    string | null
  >(null);
  const [optionStates, setOptionStates] = useState<Record<string, OptionState>>(
    () => normalizeOptionStates(cachedProfileSecurity?.optionStates),
  );
  const [verificationSnapshot, setVerificationSnapshot] =
    useState<VerificationApplicationSnapshot | null>(null);
  const [verificationForm, setVerificationForm] =
    useState<VerificationApplicationForm>(emptyVerificationApplicationForm);
  const [isSubmittingVerification, setIsSubmittingVerification] =
    useState(false);
  const [verificationStatusMessage, setVerificationStatusMessage] = useState<
    string | null
  >(null);
  const [verificationErrorMessage, setVerificationErrorMessage] = useState<
    string | null
  >(null);

  const handleOptionVisibilityChange = async (
    sectionKey: string,
    optionKey: string,
    value: OptionState,
  ) => {
    const settingKey = `${sectionKey}.${optionKey}`;
    const nextStates = { ...optionStates, [settingKey]: value };
    setOptionStates(nextStates);
    setGalleryPreferenceStatus(null);
    setGalleryPreferenceError(null);
    persistProfileSecurityCache({ optionStates: nextStates });

    if (!isSupabaseConfigured) {
      setGalleryPreferenceStatus("Setting saved locally.");
      return;
    }

    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      setGalleryPreferenceError("You need to be signed in to update settings.");
      return;
    }

    const { error } = await supabase.from("profile_settings").upsert(
      {
        user_id: data.user.id,
        setting_control_states: nextStates,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    if (error) {
      setGalleryPreferenceError(
        error.message || "Could not update setting right now.",
      );
      return;
    }

    setGalleryPreferenceStatus("Setting saved.");
  };

  const persistProfileSecurityCache = (
    nextValues: Partial<ProfileSecurityCache>,
  ) => {
    writeCachedValue<ProfileSecurityCache>(profileSecurityCacheKey, {
      username: nextValues.username ?? currentUsername,
      email: nextValues.email ?? currentEmail,
      recoveryKeys: nextValues.recoveryKeys ?? recoveryKeys,
      addPostImagesToGallery:
        nextValues.addPostImagesToGallery ?? addPostImagesToGallery,
      optionStates: nextValues.optionStates ?? optionStates,
    });
  };

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let isMounted = true;

    const loadSnapshot = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const [profileResult, settingsResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("username")
          .eq("id", user.id)
          .maybeSingle<{ username: string | null }>(),
        supabase
          .from("profile_settings")
          .select(
            "recovery_keys, add_post_images_to_gallery, setting_control_states",
          )
          .eq("user_id", user.id)
          .maybeSingle<{
            recovery_keys: string[] | null;
            add_post_images_to_gallery: boolean | null;
            setting_control_states: Record<string, OptionState> | null;
          }>(),
      ]);

      if (profileResult.error) return;
      if (settingsResult.error) return;

      const snapshot: ProfileSecurityCache = {
        username: profileResult.data?.username?.trim() || "member",
        email: user.email?.trim() || "member@example.com",
        recoveryKeys: Array.isArray(settingsResult.data?.recovery_keys)
          ? settingsResult.data.recovery_keys
          : [],
        addPostImagesToGallery:
          settingsResult.data?.add_post_images_to_gallery ?? true,
        optionStates: normalizeOptionStates(
          settingsResult.data?.setting_control_states,
        ),
      };

      if (!isMounted) return;

      setCurrentUsername(snapshot.username || "member");
      setCurrentEmail(snapshot.email || "member@example.com");
      setRecoveryKeys(
        Array.isArray(snapshot.recoveryKeys) ? snapshot.recoveryKeys : [],
      );
      setAddPostImagesToGallery(snapshot.addPostImagesToGallery);
      setOptionStates(snapshot.optionStates);

      writeCachedValue<ProfileSecurityCache>(profileSecurityCacheKey, {
        username: snapshot.username || "member",
        email: snapshot.email || "member@example.com",
        recoveryKeys: Array.isArray(snapshot.recoveryKeys)
          ? snapshot.recoveryKeys
          : [],
        addPostImagesToGallery: snapshot.addPostImagesToGallery,
        optionStates: snapshot.optionStates,
      });

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken || !isMounted) return;

      const verificationResponse = await fetch("/api/verification/apply", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!verificationResponse.ok || !isMounted) return;

      const verificationData =
        (await verificationResponse.json()) as VerificationApplicationSnapshot;

      setVerificationSnapshot(verificationData);
      setVerificationForm((prev) => ({
        ...prev,
        ...verificationData.defaults,
      }));
    };

    void loadSnapshot();

    return () => {
      isMounted = false;
    };
  }, [profileSecurityCacheKey]);

  const activeSection = useMemo(
    () =>
      settingSections.find((section) => section.key === activeSectionKey) ??
      settingSections[0],
    [activeSectionKey],
  );

  const totalOptions = settingSections.reduce(
    (acc, section) => acc + section.options.length,
    0,
  );
  const enabledCount = settingSections.reduce(
    (acc, section) =>
      acc +
      section.options.filter((option) => option.state !== "No-one").length,
    0,
  );

  const handlePrimaryEmailSave = async (nextEmail: string) => {
    const normalizedNext = nextEmail.trim().toLowerCase();
    if (!normalizedNext) return;

    setIsSavingPrimaryEmail(true);
    setPrimaryEmailUpdateError(null);
    setPrimaryEmailUpdateStatus(null);

    if (!isSupabaseConfigured) {
      setCurrentEmail(normalizedNext);
      setIsSavingPrimaryEmail(false);
      setIsPrimaryEmailModalOpen(false);
      setPrimaryEmailUpdateStatus("Primary email updated locally.");
      persistProfileSecurityCache({ email: normalizedNext });
      return;
    }

    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      setIsSavingPrimaryEmail(false);
      setPrimaryEmailUpdateError(
        "You need to be signed in to update your email.",
      );
      return;
    }

    const { error } = await supabase.auth.updateUser({ email: normalizedNext });

    setIsSavingPrimaryEmail(false);

    if (error) {
      setPrimaryEmailUpdateError(
        error.message || "Could not update your primary email right now.",
      );
      return;
    }

    setCurrentEmail(normalizedNext);
    setIsPrimaryEmailModalOpen(false);
    setPrimaryEmailUpdateStatus(`Primary email changed to ${normalizedNext}.`);
    persistProfileSecurityCache({ email: normalizedNext });
  };

  const handlePasswordSave = async (
    oldPassword: string,
    newPassword: string,
  ) => {
    const normalizedOld = oldPassword.trim();
    const normalizedNew = newPassword.trim();
    if (!normalizedOld || !normalizedNew) return;

    setIsSavingPassword(true);
    setPasswordUpdateError(null);
    setPasswordUpdateStatus(null);

    if (!isSupabaseConfigured) {
      setIsSavingPassword(false);
      setIsPasswordModalOpen(false);
      setPasswordUpdateStatus("Password reset locally.");
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user || !userData.user.email) {
      setIsSavingPassword(false);
      setPasswordUpdateError(
        "You need to be signed in to reset your password.",
      );
      return;
    }

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: userData.user.email,
      password: normalizedOld,
    });

    if (authError) {
      setIsSavingPassword(false);
      setPasswordUpdateError(
        authError.message || "Your old password is incorrect.",
      );
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: normalizedNew,
    });

    setIsSavingPassword(false);

    if (updateError) {
      setPasswordUpdateError(
        updateError.message || "Could not reset your password right now.",
      );
      return;
    }

    setIsPasswordModalOpen(false);
    setPasswordUpdateStatus("Password updated.");
  };

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
      setUsernameUpdateError(
        "You need to be signed in to update your username.",
      );
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ username: normalizedNext })
      .eq("id", data.user.id);

    setIsSavingUsername(false);

    if (error) {
      setUsernameUpdateError(
        error.message || "Could not update username right now.",
      );
      return;
    }

    setCurrentUsername(normalizedNext);
    setIsUsernameModalOpen(false);
    setUsernameUpdateStatus(`Username changed to @${normalizedNext}.`);
    persistProfileSecurityCache({ username: normalizedNext });
  };

  const generateRecoveryKeys = () => {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    const makePart = () =>
      Array.from({ length: 4 })
        .map(() => {
          const index = Math.floor(Math.random() * alphabet.length);
          return alphabet[index] ?? "X";
        })
        .join("");

    return Array.from({ length: 10 }).map(
      () => `${makePart()}-${makePart()}-${makePart()}`,
    );
  };

  const handleGalleryPreferenceChange = async (nextValue: boolean) => {
    setAddPostImagesToGallery(nextValue);
    setGalleryPreferenceStatus(null);
    setGalleryPreferenceError(null);
    persistProfileSecurityCache({ addPostImagesToGallery: nextValue });

    if (!isSupabaseConfigured) {
      setGalleryPreferenceStatus(
        `Post images will ${nextValue ? "appear" : "not appear"} in Gallery locally.`,
      );
      return;
    }

    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      setGalleryPreferenceError(
        "You need to be signed in to update gallery preferences.",
      );
      return;
    }

    const { error } = await supabase.from("profile_settings").upsert(
      {
        user_id: data.user.id,
        add_post_images_to_gallery: nextValue,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    if (error) {
      setAddPostImagesToGallery(!nextValue);
      persistProfileSecurityCache({ addPostImagesToGallery: !nextValue });
      setGalleryPreferenceError(
        error.message || "Could not update gallery preference right now.",
      );
      return;
    }

    setGalleryPreferenceStatus(
      `Post images will ${nextValue ? "appear" : "not appear"} in Gallery.`,
    );
  };

  const handleVerificationApplicationSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setVerificationStatusMessage(null);
    setVerificationErrorMessage(null);

    if (!verificationForm.idDocument) {
      setVerificationErrorMessage("Upload a government ID document to apply.");
      return;
    }

    setIsSubmittingVerification(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        setVerificationErrorMessage("Sign in again to submit verification.");
        return;
      }

      const payload = new FormData();
      payload.set("legalName", verificationForm.legalName);
      payload.set("displayName", verificationForm.displayName);
      payload.set("dateOfBirth", verificationForm.dateOfBirth);
      payload.set("country", verificationForm.country);
      payload.set("membershipType", verificationForm.membershipType);
      payload.set("idType", verificationForm.idType);
      payload.set("motivation", verificationForm.motivation);
      payload.set("idDocument", verificationForm.idDocument);
      payload.set(
        "isAdultConfirmed",
        String(verificationForm.isAdultConfirmed),
      );
      payload.set(
        "isConsentConfirmed",
        String(verificationForm.isConsentConfirmed),
      );
      payload.set(
        "isPolicyConfirmed",
        String(verificationForm.isPolicyConfirmed),
      );
      payload.set(
        "isPhotoRuleConfirmed",
        String(verificationForm.isPhotoRuleConfirmed),
      );

      const response = await fetch("/api/verification/apply", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: payload,
      });
      const data = (await response.json()) as {
        error?: string;
        message?: string;
        status?: string;
      };

      if (!response.ok) {
        setVerificationErrorMessage(
          data.error ?? "Could not submit verification right now.",
        );
        return;
      }

      setVerificationSnapshot((prev) =>
        prev
          ? { ...prev, eligible: false, status: data.status ?? "pending" }
          : prev,
      );
      setVerificationStatusMessage(
        data.message ?? "Verification application submitted for review.",
      );
      setVerificationForm((prev) => ({ ...prev, idDocument: null }));
    } catch {
      setVerificationErrorMessage(
        "Something went wrong while submitting verification.",
      );
    } finally {
      setIsSubmittingVerification(false);
    }
  };

  const handleRecoveryKeysGenerate = async () => {
    setIsSavingRecoveryKeys(true);
    setRecoveryKeysError(null);
    setRecoveryKeysStatus(null);
    const nextRecoveryKeys = generateRecoveryKeys();

    if (!isSupabaseConfigured) {
      setRecoveryKeys(nextRecoveryKeys);
      setIsSavingRecoveryKeys(false);
      setRecoveryKeysStatus("Recovery keys generated locally.");
      persistProfileSecurityCache({ recoveryKeys: nextRecoveryKeys });
      return;
    }

    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      setIsSavingRecoveryKeys(false);
      setRecoveryKeysError(
        "You need to be signed in to generate recovery keys.",
      );
      return;
    }

    const { error } = await supabase.from("profile_settings").upsert(
      {
        user_id: data.user.id,
        recovery_keys: nextRecoveryKeys,
        recovery_keys_generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    setIsSavingRecoveryKeys(false);

    if (error) {
      setRecoveryKeysError(
        error.message || "Could not generate recovery keys right now.",
      );
      return;
    }

    setRecoveryKeys(nextRecoveryKeys);
    setRecoveryKeysStatus("Recovery keys regenerated.");
    persistProfileSecurityCache({ recoveryKeys: nextRecoveryKeys });
  };

  if (!activeSection) return null;

  const hasVerificationCard =
    verificationSnapshot?.eligible ||
    verificationSnapshot?.status === "pending";

  const handleVerificationJump = () => {
    document
      .getElementById("verification")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className={`${layoutStyles.main} w-full max-w-full`}>
      <AppSidebar />

      <section className={styles.pageSection}>
        <div className={styles.contentWrap}>
          <header className={styles.header}>
            <div>
              <p className={styles.eyebrow}>Account Control Center</p>
              <h1>Settings & Security</h1>
              <p className={styles.subhead}>
                A redesigned command center for profile controls, privacy
                boundaries, and trust settings. Use the left rail to jump
                between sections and review controls in context.
              </p>
            </div>
            <div className={styles.quickStats}>
              <article>
                <p>Active protections</p>
                <strong>{enabledCount}</strong>
              </article>
              <article>
                <p>Total controls</p>
                <strong>{totalOptions}</strong>
              </article>
              <article>
                <p>Sections</p>
                <strong>{settingSections.length}</strong>
              </article>
            </div>
          </header>

          {verificationSnapshot?.status === "pending" ? (
            <section className={styles.verificationPanel} id="verification">
              <div>
                <p className={styles.sectionPill}>Verification review</p>
                <h2>Your ID verification is pending</h2>
                <p>
                  Keep browsing as a visitor while the team reviews your
                  application. Posting, commenting, messaging, friend requests,
                  check-ins, and creation forms unlock after approval.
                </p>
              </div>
              <span className={`${styles.statePill} ${styles.stateLimited}`}>
                Pending
              </span>
            </section>
          ) : null}

          {verificationSnapshot?.eligible ? (
            <section className={styles.verificationPanel} id="verification">
              <div className={styles.verificationIntro}>
                <p className={styles.sectionPill}>Visitor upgrade</p>
                <h2>Apply for ID verification</h2>
                <p>
                  This form is only for registered Visitor Pass accounts. Submit
                  your ID for manual review to unlock posting, comments,
                  messaging, friend requests, check-ins, and creation forms
                  after approval.
                </p>
              </div>

              <form
                className={styles.verificationForm}
                onSubmit={handleVerificationApplicationSubmit}
              >
                <div className={styles.verificationGrid}>
                  <label className={styles.formField}>
                    <span>Legal full name</span>
                    <input
                      value={verificationForm.legalName}
                      onChange={(event) =>
                        setVerificationForm((prev) => ({
                          ...prev,
                          legalName: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                  <label className={styles.formField}>
                    <span>Display name</span>
                    <input
                      value={verificationForm.displayName}
                      onChange={(event) =>
                        setVerificationForm((prev) => ({
                          ...prev,
                          displayName: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                  <label className={styles.formField}>
                    <span>Date of birth</span>
                    <input
                      type="date"
                      value={verificationForm.dateOfBirth}
                      onChange={(event) =>
                        setVerificationForm((prev) => ({
                          ...prev,
                          dateOfBirth: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                  <label className={styles.formField}>
                    <span>Country</span>
                    <input
                      value={verificationForm.country}
                      onChange={(event) =>
                        setVerificationForm((prev) => ({
                          ...prev,
                          country: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                  <label className={styles.formField}>
                    <span>Membership type</span>
                    <select
                      value={verificationForm.membershipType}
                      onChange={(event) =>
                        setVerificationForm((prev) => ({
                          ...prev,
                          membershipType: event.target.value,
                        }))
                      }
                      required
                    >
                      <option value="" disabled>
                        Choose membership
                      </option>
                      <option>Individual</option>
                      <option>Couple / household</option>
                      <option>Family</option>
                      <option>Community organizer</option>
                    </select>
                  </label>
                  <label className={styles.formField}>
                    <span>Government ID type</span>
                    <select
                      value={verificationForm.idType}
                      onChange={(event) =>
                        setVerificationForm((prev) => ({
                          ...prev,
                          idType: event.target.value,
                        }))
                      }
                      required
                    >
                      <option value="" disabled>
                        Choose ID type
                      </option>
                      <option>Passport</option>
                      <option>Driver&apos;s license</option>
                      <option>National ID card</option>
                    </select>
                  </label>
                </div>

                <label className={styles.formField}>
                  <span>
                    Upload government ID (JPG, PNG, WEBP, PDF • max 10MB)
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={(event) =>
                      setVerificationForm((prev) => ({
                        ...prev,
                        idDocument: event.target.files?.[0] ?? null,
                      }))
                    }
                    required
                  />
                  <small>
                    Your ID is only used for manual review and is never shown on
                    your profile.
                  </small>
                </label>

                <label className={styles.formField}>
                  <span>Why are you joining this community? (30+ chars)</span>
                  <textarea
                    value={verificationForm.motivation}
                    onChange={(event) =>
                      setVerificationForm((prev) => ({
                        ...prev,
                        motivation: event.target.value,
                      }))
                    }
                    minLength={30}
                    placeholder="Share your naturist values, boundaries, and what respectful participation means to you."
                    required
                  />
                </label>

                <div className={styles.confirmationGrid}>
                  {[
                    [
                      "isAdultConfirmed",
                      "I confirm I am 18+ and applying with my own ID.",
                    ],
                    [
                      "isConsentConfirmed",
                      "I agree to consent-first, respectful community behavior.",
                    ],
                    [
                      "isPhotoRuleConfirmed",
                      "I will not screenshot, save, or share member media without consent.",
                    ],
                    [
                      "isPolicyConfirmed",
                      "I understand full participation starts only after approval.",
                    ],
                  ].map(([key, label]) => (
                    <label key={key} className={styles.confirmationRow}>
                      <input
                        type="checkbox"
                        checked={Boolean(
                          verificationForm[
                            key as keyof VerificationApplicationForm
                          ],
                        )}
                        onChange={(event) =>
                          setVerificationForm((prev) => ({
                            ...prev,
                            [key]: event.target.checked,
                          }))
                        }
                        required
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>

                {verificationStatusMessage ? (
                  <p className={styles.statusNote}>
                    {verificationStatusMessage}
                  </p>
                ) : null}
                {verificationErrorMessage ? (
                  <p className={styles.errorNote}>{verificationErrorMessage}</p>
                ) : null}

                <button
                  className={styles.verificationSubmit}
                  type="submit"
                  disabled={isSubmittingVerification}
                >
                  {isSubmittingVerification
                    ? "Submitting for review..."
                    : "Submit ID verification"}
                </button>
              </form>
            </section>
          ) : null}

          <div className={styles.dashboardGrid}>
            <aside className={styles.navPanel} aria-label="Settings subjects">
              <div className={styles.navHeader}>
                <h2>Navigation</h2>
                <p>Pick a category to edit.</p>
              </div>

              <div className={styles.navList}>
                {settingSections.map((section) => (
                  <button
                    key={section.key}
                    type="button"
                    className={`${styles.subjectChip} ${activeSection.key === section.key ? styles.subjectChipActive : ""}`}
                    onClick={() => setActiveSectionKey(section.key)}
                  >
                    <div>
                      <span>{section.title}</span>
                      <small>{section.subtitle}</small>
                    </div>
                    <Badge variant="outline">{section.options.length}</Badge>
                  </button>
                ))}
              </div>

              <label className={styles.subjectSelectWrap}>
                <span>Jump to section</span>
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

              {hasVerificationCard ? (
                <button
                  type="button"
                  className={styles.verificationNavButton}
                  onClick={handleVerificationJump}
                >
                  <span>
                    {verificationSnapshot?.eligible
                      ? "Open ID verification form"
                      : "Open ID verification status"}
                  </span>
                  <small>Jump straight to the visitor upgrade area.</small>
                </button>
              ) : null}
            </aside>

            <Card
              className={`${styles.card} ${getToneClass(activeSection.tone)}`}
            >
              <CardContent className={styles.cardContent}>
                <div className={styles.sectionHeading}>
                  <div>
                    <p className={styles.sectionPill}>{activeSection.pill}</p>
                    <h2>{activeSection.title}</h2>
                    <p className={styles.sectionSubtitle}>
                      {activeSection.subtitle}
                    </p>
                  </div>
                  <Badge variant="outline">
                    {activeSection.options.length} controls
                  </Badge>
                </div>

                <div className={styles.statusStack}>
                  {usernameUpdateStatus ? (
                    <p className={styles.statusNote}>{usernameUpdateStatus}</p>
                  ) : null}
                  {primaryEmailUpdateStatus ? (
                    <p className={styles.statusNote}>
                      {primaryEmailUpdateStatus}
                    </p>
                  ) : null}
                  {passwordUpdateStatus ? (
                    <p className={styles.statusNote}>{passwordUpdateStatus}</p>
                  ) : null}
                  {recoveryKeysStatus ? (
                    <p className={styles.statusNote}>{recoveryKeysStatus}</p>
                  ) : null}
                  {galleryPreferenceStatus ? (
                    <p className={styles.statusNote}>
                      {galleryPreferenceStatus}
                    </p>
                  ) : null}
                  {galleryPreferenceError ? (
                    <p className={styles.errorNote}>{galleryPreferenceError}</p>
                  ) : null}
                </div>

                <div className={styles.optionList}>
                  {activeSection.options.map((option, index) => {
                    const isUsernameOption =
                      activeSection.key === "profile" &&
                      option.label === "Username";
                    const isPrimaryEmailOption =
                      activeSection.key === "profile" &&
                      option.label === "Primary email";
                    const isPasswordOption =
                      activeSection.key === "profile" &&
                      option.label === "Password reset";
                    const isRecoveryKeysOption =
                      activeSection.key === "profile" &&
                      option.label === "Recovery keys";

                    const variant = getOptionCardVariant(index);

                    if (
                      isUsernameOption ||
                      isPrimaryEmailOption ||
                      isPasswordOption ||
                      isRecoveryKeysOption
                    ) {
                      return (
                        <SettingsOptionCard
                          key={option.key}
                          label={option.label}
                          detail={option.detail}
                          variant={variant}
                          badge="Action"
                          onClick={() => {
                            if (isUsernameOption) {
                              setUsernameUpdateStatus(null);
                              setUsernameUpdateError(null);
                              setIsUsernameModalOpen(true);
                              return;
                            }
                            if (isPrimaryEmailOption) {
                              setPrimaryEmailUpdateStatus(null);
                              setPrimaryEmailUpdateError(null);
                              setIsPrimaryEmailModalOpen(true);
                              return;
                            }
                            if (isRecoveryKeysOption) {
                              setRecoveryKeysStatus(null);
                              setRecoveryKeysError(null);
                              setIsRecoveryKeysModalOpen(true);
                              return;
                            }

                            setPasswordUpdateStatus(null);
                            setPasswordUpdateError(null);
                            setIsPasswordModalOpen(true);
                          }}
                          stateNode={
                            <span
                              className={`${styles.statePill} ${styles.stateOn}`}
                            >
                              Manage
                            </span>
                          }
                        />
                      );
                    }

                    if (option.control === "boolean") {
                      const current = addPostImagesToGallery ? "Yes" : "No";

                      return (
                        <SettingsOptionCard
                          key={option.key}
                          label={option.label}
                          detail={option.detail}
                          variant={variant}
                          badge="Preference"
                          stateNode={
                            <div className={styles.visibilityGroup}>
                              {(["No", "Yes"] as const).map((level) => (
                                <button
                                  key={level}
                                  type="button"
                                  className={`${styles.statePill} ${current === level ? (level === "Yes" ? styles.stateOn : styles.statePrivate) : styles.stateOff}`}
                                  onClick={() => {
                                    void handleGalleryPreferenceChange(
                                      level === "Yes",
                                    );
                                  }}
                                >
                                  {level}
                                </button>
                              ))}
                            </div>
                          }
                        />
                      );
                    }

                    return (
                      <SettingsOptionCard
                        key={option.key}
                        label={option.label}
                        detail={option.detail}
                        variant={variant}
                        badge="Status"
                        stateNode={
                          <div className={styles.visibilityGroup}>
                            {(
                              ["No-one", "Friends only", "Everyone"] as const
                            ).map((level) => {
                              const current =
                                optionStates[
                                  `${activeSection.key}.${option.key}`
                                ] ?? option.state;
                              return (
                                <button
                                  key={level}
                                  type="button"
                                  className={`${styles.statePill} ${current === level ? getStateClass(level) : styles.stateOff}`}
                                  onClick={() => {
                                    void handleOptionVisibilityChange(
                                      activeSection.key,
                                      option.key,
                                      level,
                                    );
                                  }}
                                >
                                  {level}
                                </button>
                              );
                            })}
                          </div>
                        }
                      />
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
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
      <PasswordResetModal
        isOpen={isPasswordModalOpen}
        isSaving={isSavingPassword}
        errorMessage={passwordUpdateError}
        onCancel={() => {
          setPasswordUpdateError(null);
          setIsPasswordModalOpen(false);
        }}
        onSave={(oldPassword, newPassword) => {
          void handlePasswordSave(oldPassword, newPassword);
        }}
      />
      <PrimaryEmailModal
        key={`${currentEmail}-${isPrimaryEmailModalOpen ? "open" : "closed"}`}
        isOpen={isPrimaryEmailModalOpen}
        currentEmail={currentEmail}
        isSaving={isSavingPrimaryEmail}
        errorMessage={primaryEmailUpdateError}
        onCancel={() => {
          setPrimaryEmailUpdateError(null);
          setIsPrimaryEmailModalOpen(false);
        }}
        onSave={(nextEmail) => {
          void handlePrimaryEmailSave(nextEmail);
        }}
      />
      <RecoveryKeysModal
        isOpen={isRecoveryKeysModalOpen}
        recoveryKeys={recoveryKeys}
        isSaving={isSavingRecoveryKeys}
        errorMessage={recoveryKeysError}
        onCancel={() => {
          setRecoveryKeysError(null);
          setIsRecoveryKeysModalOpen(false);
        }}
        onGenerate={() => {
          void handleRecoveryKeysGenerate();
        }}
      />
    </main>
  );
}
