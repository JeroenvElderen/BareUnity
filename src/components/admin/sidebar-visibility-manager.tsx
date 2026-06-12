"use client";

import { useEffect, useMemo, useState } from "react";

import {
  normalizeSidebarHiddenItems,
  SIDEBAR_VISIBILITY_STORAGE_EVENT,
  SIDEBAR_VISIBILITY_STORAGE_KEY,
  sidebarHiddenItemsToArray,
  sidebarVisibilityOptions,
  type SidebarHiddenItemSet,
  type SidebarItemId,
} from "@/lib/sidebar-visibility";
import { supabase } from "@/lib/supabase";
import styles from "@/app/admin/page.module.css";

type SaveState = "idle" | "saving" | "saved" | "error";

export function SidebarVisibilityManager() {
  const [hiddenItems, setHiddenItems] = useState<SidebarHiddenItemSet>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState("");

  const groupedOptions = useMemo(() => {
    return sidebarVisibilityOptions.reduce<
      Array<{ group: string; options: typeof sidebarVisibilityOptions }>
    >((groups, option) => {
      const existingGroup = groups.find((group) => group.group === option.group);
      if (existingGroup) {
        existingGroup.options = [...existingGroup.options, option];
        return groups;
      }

      return [...groups, { group: option.group, options: [option] }];
    }, []);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadSettings = async () => {
      try {
        const response = await fetch("/api/sidebar-visibility", {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Could not load sidebar settings.");

        const payload = (await response.json()) as { hiddenItems?: unknown };
        const normalized = normalizeSidebarHiddenItems(payload.hiddenItems);
        if (isMounted) setHiddenItems(normalized);
      } catch (error) {
        console.debug("Could not load sidebar visibility settings", error);
        if (isMounted) {
          setSaveState("error");
          setMessage("Could not load sidebar visibility settings.");
        }
      }
    };

    void loadSettings();

    return () => {
      isMounted = false;
    };
  }, []);

  const saveHiddenItems = async (nextHiddenItems: SidebarHiddenItemSet) => {
    setSaveState("saving");
    setMessage("Saving sidebar visibility…");

    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) throw new Error("Missing admin session.");

      const response = await fetch("/api/sidebar-visibility", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          hiddenItems: sidebarHiddenItemsToArray(nextHiddenItems),
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        hiddenItems?: unknown;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not save sidebar settings.");
      }

      const normalized = normalizeSidebarHiddenItems(payload.hiddenItems);
      setHiddenItems(normalized);
      window.localStorage.setItem(
        SIDEBAR_VISIBILITY_STORAGE_KEY,
        JSON.stringify(sidebarHiddenItemsToArray(normalized)),
      );
      window.dispatchEvent(new Event(SIDEBAR_VISIBILITY_STORAGE_EVENT));
      setSaveState("saved");
      setMessage("Sidebar visibility saved.");
    } catch (error) {
      console.debug("Could not save sidebar visibility settings", error);
      setHiddenItems(hiddenItems);
      setSaveState("error");
      setMessage(error instanceof Error ? error.message : "Could not save sidebar settings.");
    }
  };

  const toggleHiddenItem = (id: SidebarItemId) => {
    const nextHiddenItems = { ...hiddenItems, [id]: hiddenItems[id] !== true };
    if (!nextHiddenItems[id]) delete nextHiddenItems[id];
    setHiddenItems(nextHiddenItems);
    void saveHiddenItems(nextHiddenItems);
  };

  return (
    <section className={styles.visibilityPanel} aria-labelledby="sidebar-visibility-title">
      <div className={styles.visibilityHeader}>
        <div>
          <p className={styles.eyebrow}>Sidebar controls</p>
          <h2 id="sidebar-visibility-title">Hide sidebar options</h2>
          <p>
            Turn a toggle on to hide that exact option from the main sidebar. For
            example, switching Countries on hides the Countries dropdown.
          </p>
        </div>
        <span className={`${styles.saveStatus} ${styles[saveState]}`}>
          {message || "Ready"}
        </span>
      </div>

      <div className={styles.visibilityGroups}>
        {groupedOptions.map((group) => (
          <div key={group.group} className={styles.visibilityGroup}>
            <h3>{group.group}</h3>
            <div className={styles.visibilityList}>
              {group.options.map((option) => {
                const isHidden = hiddenItems[option.id] === true;

                return (
                  <label key={option.id} className={styles.visibilityOption}>
                    <span>
                      <strong>{option.label}</strong>
                      <small>{option.description}</small>
                    </span>
                    <input
                      type="checkbox"
                      checked={isHidden}
                      disabled={saveState === "saving"}
                      onChange={() => toggleHiddenItem(option.id)}
                      aria-label={`Hide ${option.label} from sidebar`}
                    />
                    <span className={styles.toggleTrack} aria-hidden>
                      <span className={styles.toggleThumb} />
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
