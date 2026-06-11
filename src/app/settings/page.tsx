"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import { PasswordResetModal } from "@/components/settings/password-reset-modal";
import { PrimaryEmailModal } from "@/components/settings/primary-email-modal";
import { RecoveryKeysModal } from "@/components/settings/recovery-keys-modal";
import { SettingsOptionCard } from "@/components/settings/settings-option-card";
import { UsernameChangeModal } from "@/components/settings/username-change-modal";
import { IdRedactionUploader } from "@/components/verification/id-redaction-uploader";
import { AppSidebar } from "@/components/sidebar/sidebar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  buildUserScopedCacheKey,
  evictCachedValuesByPrefix,
  readCachedValue,
  writeCachedValue,
} from "@/lib/client-cache";
import {
  normalizeSettingOptionStates,
  type OptionState,
} from "@/lib/settings-controls";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import layoutStyles from "../page.module.css";
import styles from "./settings.module.css";

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
        detail:
          "Generate one-time backup keys. Plain keys are shown once and never saved or shared.",
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
        detail: "Choose who can open your full profile page.",
        state: "Everyone",
      },
      {
        key: "Display name visibility",
        label: "Display name visibility",
        detail: "Choose who can see your display name on your profile.",
        state: "Everyone",
      },
      {
        key: "Location precision",
        label: "Location visibility",
        detail: "Choose who can see the location saved on your profile.",
        state: "No-one",
      },
    ],
  },
  {
    key: "gallery",
    title: "Gallery",
    subtitle: "One real publishing preference for post images in the Gallery.",
    pill: "Gallery",
    tone: "earth",
    options: [
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
  hasRecoveryKeys: boolean;
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
  isSensitiveIdDetailsHidden: boolean;
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
  isSensitiveIdDetailsHidden: false,
};

function normalizeOptionStates(value: unknown) {
  return normalizeSettingOptionStates(value);
}

function hasStoredRecoveryKeys(value: unknown) {
  return Array.isArray(value) && value.length > 0;
}

function getSecureRandomIndex(max: number) {
  if (typeof crypto === "undefined" || !crypto.getRandomValues) {
    return Math.floor(Math.random() * max);
  }

  const randomValues = new Uint32Array(1);
  crypto.getRandomValues(randomValues);
  return (randomValues[0] ?? 0) % max;
}

async function hashRecoveryKeysForStorage(keys: string[]) {
  const encoder = new TextEncoder();

  return Promise.all(
    keys.map(async (key, index) => {
      const digest = await crypto.subtle.digest("SHA-256", encoder.encode(key));
      const hash = Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");

      return {
        id: `key-${index + 1}`,
        hash,
        createdAt: new Date().toISOString(),
      };
    }),
  );
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
  const router = useRouter();
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
  const [generatedRecoveryKeys, setGeneratedRecoveryKeys] = useState<string[]>([]);
  const [hasRecoveryKeys, setHasRecoveryKeys] = useState(
    cachedProfileSecurity?.hasRecoveryKeys ?? false,
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
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);
  const [deleteAccountStatus, setDeleteAccountStatus] = useState<string | null>(null);

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
      hasRecoveryKeys: nextValues.hasRecoveryKeys ?? hasRecoveryKeys,
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
             recovery_keys: unknown;
            add_post_images_to_gallery: boolean | null;
            setting_control_states: Record<string, OptionState> | null;
          }>(),
      ]);

      if (profileResult.error) return;
      if (settingsResult.error) return;

      const snapshot: ProfileSecurityCache = {
        username: profileResult.data?.username?.trim() || "member",
        email: user.email?.trim() || "member@example.com",
        hasRecoveryKeys: hasStoredRecoveryKeys(settingsResult.data?.recovery_keys),
        addPostImagesToGallery:
          settingsResult.data?.add_post_images_to_gallery ?? true,
        optionStates: normalizeOptionStates(
          settingsResult.data?.setting_control_states,
        ),
      };

      if (!isMounted) return;

      setCurrentUsername(snapshot.username || "member");
      setCurrentEmail(snapshot.email || "member@example.com");
      setHasRecoveryKeys(snapshot.hasRecoveryKeys);
      setGeneratedRecoveryKeys([]);
      setAddPostImagesToGallery(snapshot.addPostImagesToGallery);
      setOptionStates(snapshot.optionStates);

      writeCachedValue<ProfileSecurityCache>(profileSecurityCacheKey, {
        username: snapshot.username || "member",
        email: snapshot.email || "member@example.com",
        hasRecoveryKeys: snapshot.hasRecoveryKeys,
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

  useEffect(() => {
    if (!verificationSnapshot) return;
    if (window.location.hash !== "#verification") return;

    document
      .getElementById("verification")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [verificationSnapshot]);
  
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
          const index = getSecureRandomIndex(alphabet.length);
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
      payload.set(
        "isSensitiveIdDetailsHidden",
        String(verificationForm.isSensitiveIdDetailsHidden),
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
      setGeneratedRecoveryKeys(nextRecoveryKeys);
      setHasRecoveryKeys(true);
      setIsSavingRecoveryKeys(false);
      setRecoveryKeysStatus(
        "Recovery keys generated locally. Copy them now; they will not be shown again.",
      );
      persistProfileSecurityCache({ hasRecoveryKeys: true });
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
        recovery_keys: await hashRecoveryKeysForStorage(nextRecoveryKeys),
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

    setGeneratedRecoveryKeys(nextRecoveryKeys);
    setHasRecoveryKeys(true);
    setRecoveryKeysStatus(
      "Recovery keys regenerated. Copy them now; they will not be shown again.",
    );
    persistProfileSecurityCache({ hasRecoveryKeys: true });
  };

  const handleDeleteAccount = async () => {
    setDeleteAccountError(null);
    setDeleteAccountStatus(null);

    const confirmation = window.prompt(
      "This permanently deletes your BareUnity account, profile, posts, gallery uploads, likes, comments, and verification files. Type DELETE to confirm.",
    );

    if (confirmation !== "DELETE") {
      setDeleteAccountError("Account deletion cancelled. Type DELETE exactly to confirm.");
      return;
    }

    setIsDeletingAccount(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        setDeleteAccountError("Sign in again before deleting your account.");
        return;
      }

      const response = await fetch("/api/settings/account", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        setDeleteAccountError(data.error ?? "Could not delete account right now.");
        return;
      }

      setDeleteAccountStatus("Account deleted. Signing you out...");
      evictCachedValuesByPrefix("home-feed:");
      evictCachedValuesByPrefix("map-spots:");
      evictCachedValuesByPrefix("settings:profile-security:");
      evictCachedValuesByPrefix("gallery-items:");
      evictCachedValuesByPrefix("profile:");
      await supabase.auth.signOut();
      router.replace("/welcome");
    } catch {
      setDeleteAccountError("Something went wrong while deleting your account.");
    } finally {
      setIsDeletingAccount(false);
    }
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
                Only the settings BareUnity can actually apply are shown here:
                account access, profile privacy, Gallery publishing, and ID
                verification when your account is eligible.
              </p>
            </div>
            <div className={styles.quickStats}>
              <article>
                <p>Useful settings</p>
                <strong>{totalOptions}</strong>
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
                  application. Posting, commenting, check-ins, and creation forms unlock after approval.
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
                  check-ins, and creation forms after approval.
                </p>
              </div>

              <div
                className={styles.idSafetyCard}
                aria-label="How we protect your ID document"
              >
                <div>
                  <span className={styles.idSafetyIcon}>🔒</span>
                  <h3>How we protect your ID from fraud</h3>
                </div>
                <ul>
                  <li>
                    Only platform admins can open the upload through short-lived
                    review links.
                  </li>
                  <li>
                    Your ID is never shown on your public profile or shared with
                    members.
                  </li>
                  <li>
                    The uploaded file is automatically deleted after the
                    approval or rejection decision.
                  </li>
                  <li>
                    You can hide everything except your legal name, date of
                    birth, and the official ID seal/logo/header needed to show
                    the document is government-issued.
                  </li>
                </ul>
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

                <div className={styles.formField}>
                  <span>
                    Upload government ID (JPG, PNG, WEBP, PDF • max 10MB)
                  </span>
                  <IdRedactionUploader
                    id="settingsIdDocument"
                    required
                    onFileChange={(file) =>
                      setVerificationForm((prev) => ({
                        ...prev,
                        idDocument: file,
                      }))
                    }
                  />
                  <small>
                    You can now redact sensitive details directly in BareUnity
                    before submitting. Your ID is only used for manual review,
                    never shown on your profile, and deleted from storage after
                    a review decision.
                  </small>
                </div>

                <div className={styles.redactionGuide}>
                  <strong>Use the platform redaction tool first:</strong>
                  <span>
                    For JPG, PNG, or WEBP files, drag black boxes over details we
                    do not need, then choose “Use redacted copy.” We only need
                    your legal name, date of birth, and the official ID
                    seal/logo/header that shows the document is government-issued.
                  </span>
                </div>

                <label className={styles.confirmationRow}>
                  <input
                    type="checkbox"
                    checked={verificationForm.isSensitiveIdDetailsHidden}
                    onChange={(event) =>
                      setVerificationForm((prev) => ({
                        ...prev,
                        isSensitiveIdDetailsHidden: event.target.checked,
                      }))
                    }
                    required
                  />
                  <span>
                    I have hidden everything except my legal name, date of
                    birth, and the official ID seal/logo/header.
                  </span>
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
                              ["No-one", "Members only", "Everyone"] as const
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

          <section className={styles.dangerZone} aria-labelledby="delete-account-title">
            <div>
              <p className={styles.dangerEyebrow}>Danger zone</p>
              <h2 id="delete-account-title">Delete account</h2>
              <p>
                Permanently remove your account, profile, posts, gallery uploads,
                comments, likes, and verification files. This
                cannot be undone.
              </p>
              {deleteAccountStatus ? (
                <p className={styles.statusNote}>{deleteAccountStatus}</p>
              ) : null}
              {deleteAccountError ? (
                <p className={styles.errorNote}>{deleteAccountError}</p>
              ) : null}
            </div>
            <button
              type="button"
              className={styles.deleteAccountButton}
              onClick={() => {
                void handleDeleteAccount();
              }}
              disabled={isDeletingAccount}
            >
              {isDeletingAccount ? "Deleting account..." : "Delete account"}
            </button>
          </section>
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
        recoveryKeys={generatedRecoveryKeys}
        hasExistingKeys={hasRecoveryKeys}
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
