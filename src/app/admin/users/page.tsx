"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import styles from "./page.module.css";

const ADMIN_EMAIL = "jeroen.vanelderen@hotmail.com";

type CreatedUser = {
  id: string;
  email: string | null;
  username: string | null;
  displayName: string | null;
  createdAt?: string | null;
  lastSignInAt?: string | null;
};

export default function AdminUsersPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState("");
  const [usersError, setUsersError] = useState("");
  const [success, setSuccess] = useState<CreatedUser | null>(null);
  const [users, setUsers] = useState<CreatedUser[]>([]);

  async function loadUsers(queryValue = "") {
    setIsLoadingUsers(true);
    setUsersError("");

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      setUsersError("Please sign in first. We could not verify your admin session.");
      setIsLoadingUsers(false);
      return;
    }

    const currentEmail = session.user.email?.toLowerCase() ?? "";
    if (currentEmail !== ADMIN_EMAIL) {
      setUsersError("This page is restricted to your owner account only.");
      setIsLoadingUsers(false);
      return;
    }

    const params = new URLSearchParams();
    if (queryValue.trim()) params.set("query", queryValue.trim());

    const response = await fetch(`/api/admin/users?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    const payload = (await response.json()) as {
      error?: string;
      users?: CreatedUser[];
    };

    if (!response.ok) {
      setUsersError(payload.error ?? "Could not load users.");
      setIsLoadingUsers(false);
      return;
    }

    setUsers(payload.users ?? []);
    setIsLoadingUsers(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess(null);
    setIsSubmitting(true);

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      setError("Please sign in first. We could not verify your admin session.");
      setIsSubmitting(false);
      return;
    }

    const currentEmail = session.user.email?.toLowerCase() ?? "";
    if (currentEmail !== ADMIN_EMAIL) {
      setError("This page is restricted to your owner account only.");
      setIsSubmitting(false);
      return;
    }

    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        email,
        password,
        displayName,
        username,
      }),
    });

    const payload = (await response.json()) as {
      error?: string;
      user?: CreatedUser;
    };

    if (!response.ok || !payload.user) {
      setError(payload.error ?? "Could not create user.");
      setIsSubmitting(false);
      return;
    }

    setSuccess(payload.user);
    setPassword("");
    setIsSubmitting(false);
    await loadUsers(searchQuery);
  }

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <p className={styles.eyebrow}>Admin Studio</p>
        <h1 className={styles.title}>Create User (Owner Only)</h1>
        <p className={styles.subtitle}>
          This form creates a user in <strong>auth.users</strong> and writes matching profile data to
          <strong> public.profiles</strong>.
        </p>

        <form className={styles.form} onSubmit={submit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="newmember@example.com"
              required
            />
          </label>

          <label>
            Temporary password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 12 chars, upper/lower/number/symbol"
              required
            />
          </label>

          <label>
            Display name
            <input
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Community Name"
              required
            />
          </label>

          <label>
            Username (optional)
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="community-name"
            />
          </label>

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating user..." : "Create user"}
          </button>
        </form>

        {error ? <p className={styles.error}>{error}</p> : null}
        {success ? (
          <p className={styles.success}>
            User created: {success.email} → username <strong>{success.username}</strong>
          </p>
        ) : null}

        <section className={styles.listCard}>
          <h2>Full user admin lookup</h2>
          <p>Find any user and open their full admin page with auth, profile, settings, activity, and verification data.</p>

          <div className={styles.searchRow}>
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by email, username, display name, or user id"
            />
            <button type="button" onClick={() => void loadUsers(searchQuery)} disabled={isLoadingUsers}>
              {isLoadingUsers ? "Loading..." : "Search users"}
            </button>
          </div>

          {usersError ? <p className={styles.error}>{usersError}</p> : null}

          {users.length ? (
            <div className={styles.userList}>
              {users.map((entry) => (
                <article key={entry.id} className={styles.userRow}>
                  <div>
                    <strong>{entry.displayName || entry.username || "Unnamed user"}</strong>
                    <p>{entry.email || "No email"}</p>
                    <p className={styles.mono}>{entry.id}</p>
                  </div>
                  <Link href={`/admin/users/${entry.id}`}>Open full admin page</Link>
                </article>
              ))}
            </div>
          ) : (
            <p className={styles.empty}>No users loaded yet. Search to load users.</p>
          )}
        </section>
      </section>
    </main>
  );
}