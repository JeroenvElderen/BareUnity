"use client";

import { Camera, CameraOff, Mic, MicOff, PhoneOff, ScreenShare, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { supabase } from "@/lib/supabase";

import styles from "./video-room.module.css";

type DbProfile = {
  id: string;
  username: string | null;
  display_name: string | null;
};

type OnlineMember = {
  userId: string;
  name: string;
  initials: string;
};

function profileInitials(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "ME";

  const pieces = trimmed.split(/\s+/).filter(Boolean);
  if (!pieces.length) return "ME";
  if (pieces.length === 1) return pieces[0]!.slice(0, 2).toUpperCase();
  return `${pieces[0]![0]}${pieces[1]![0]}`.toUpperCase();
}

export function VideoRoom() {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  const [viewerId, setViewerId] = useState<string | null>(null);
  const [viewerPresenceName, setViewerPresenceName] = useState("member");
  const [onlineMembers, setOnlineMembers] = useState<OnlineMember[]>([]);
  const [lastUpdatedLabel, setLastUpdatedLabel] = useState<string>("--:--");
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isSharing, setIsSharing] = useState(false);
  const [isConnectingMedia, setIsConnectingMedia] = useState(true);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const startLocalMedia = useCallback(async () => {
    setLoadError(null);
    setIsConnectingMedia(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      setLocalStream(stream);
      setIsMicOn(true);
      setIsCameraOn(true);
    } catch {
      setLoadError("Could not access camera/microphone. Check browser permissions.");
      setLocalStream(null);
    } finally {
      setIsConnectingMedia(false);
    }
  }, []);

  useEffect(() => {
    const videoElement = localVideoRef.current;
    if (!videoElement || !localStream) return;

    videoElement.srcObject = localStream;

    return () => {
      videoElement.srcObject = null;
    };
  }, [localStream]);

  useEffect(() => {
    void startLocalMedia();
  }, [startLocalMedia]);

  useEffect(() => {
    return () => {
      localStream?.getTracks().forEach((track) => {
        track.stop();
      });
    };
  }, [localStream]);

  useEffect(() => {
    let isMounted = true;

    void supabase.auth.getUser().then(async ({ data }) => {
      if (!isMounted) return;
      const user = data.user;
      setViewerId(user?.id ?? null);

      if (!user?.id) {
        setViewerPresenceName("guest");
        return;
      }

      const { data: viewerProfile } = await supabase
        .from("profiles")
        .select("display_name,username")
        .eq("id", user.id)
        .maybeSingle<DbProfile>();

      const viewerName = viewerProfile?.display_name || viewerProfile?.username || "member";
      setViewerPresenceName(viewerName);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!viewerId) return;

    const onlineChannel = supabase.channel("video-room-presence", {
      config: {
        presence: { key: viewerId },
      },
    });

    onlineChannel
      .on("presence", { event: "sync" }, () => {
        const presenceState = onlineChannel.presenceState<{
          user_id?: string;
          name?: string;
          initials?: string;
        }>();

        const nextMembers = Object.entries(presenceState)
          .map(([key, presences]) => {
            const currentPresence = presences[presences.length - 1];
            const name = currentPresence?.name?.trim() || "member";

            return {
              userId: currentPresence?.user_id || key,
              name,
              initials: currentPresence?.initials || profileInitials(name),
            } satisfies OnlineMember;
          })
          .sort((left, right) => left.name.localeCompare(right.name));

        setOnlineMembers(nextMembers);
        setLastUpdatedLabel(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      })
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;

        await onlineChannel.track({
          user_id: viewerId,
          name: viewerPresenceName,
          initials: profileInitials(viewerPresenceName),
        });
      });

    return () => {
      void onlineChannel.untrack();
      void supabase.removeChannel(onlineChannel);
    };
  }, [viewerId, viewerPresenceName]);

  const participantTiles = useMemo(() => {
    if (onlineMembers.length) return onlineMembers;

    return [
      {
        userId: viewerId ?? "self",
        name: viewerPresenceName,
        initials: profileInitials(viewerPresenceName),
      },
    ];
  }, [onlineMembers, viewerId, viewerPresenceName]);

  const toggleMic = () => {
    if (!localStream) return;

    const next = !isMicOn;
    localStream.getAudioTracks().forEach((track) => {
      track.enabled = next;
    });
    setIsMicOn(next);
  };

  const toggleCamera = () => {
    if (!localStream) return;

    const next = !isCameraOn;
    localStream.getVideoTracks().forEach((track) => {
      track.enabled = next;
    });
    setIsCameraOn(next);
  };

  const leaveRoom = () => {
    localStream?.getTracks().forEach((track) => {
      track.stop();
    });
    setLocalStream(null);
    setIsMicOn(false);
    setIsCameraOn(false);
  };

  return (
    <section className={styles.roomShell} aria-label="Video and voice room">
      <header className={styles.topBar}>
        <div>
          <p className={styles.roomLabel}>Video Room</p>
          <h1 className={styles.roomTitle}>Live Meeting Room</h1>
          <p className={styles.roomDescription}>Real camera + microphone room using your device media permissions.</p>
          {loadError ? <p className={styles.statusError}>{loadError}</p> : null}
        </div>

        <div className={styles.metaPills}>
          <span>
            <Users size={14} aria-hidden /> {participantTiles.length} in room
          </span>
          <span className={styles.livePill}>{localStream ? "Connected" : "Disconnected"}</span>
          <span>Updated {lastUpdatedLabel}</span>
        </div>
      </header>

      <div className={styles.meetingLayout}>
        <section className={styles.stageWrap}>
          <article className={styles.localStage}>
            {localStream && isCameraOn ? (
              <video ref={localVideoRef} autoPlay muted playsInline className={styles.localVideo} />
            ) : (
              <div className={styles.videoFallback}>Camera is off</div>
            )}
            <div className={styles.stageBadge}>You</div>
            {isConnectingMedia ? <p className={styles.statusInfo}>Connecting camera and microphone…</p> : null}
          </article>

          <div className={styles.participantStrip}>
            {participantTiles.map((member) => (
              <article key={member.userId} className={styles.participantTile}>
                <div className={styles.tileAvatar}>{member.initials}</div>
                <p>{member.name}</p>
              </article>
            ))}
          </div>

          <div className={styles.controlDock}>
            <button type="button" className={styles.controlButton} onClick={toggleMic} disabled={!localStream}>
              {isMicOn ? <Mic size={18} aria-hidden /> : <MicOff size={18} aria-hidden />}
              <span>{isMicOn ? "Mute" : "Unmute"}</span>
            </button>
            <button type="button" className={styles.controlButton} onClick={toggleCamera} disabled={!localStream}>
              {isCameraOn ? <Camera size={18} aria-hidden /> : <CameraOff size={18} aria-hidden />}
              <span>{isCameraOn ? "Stop video" : "Start video"}</span>
            </button>
            <button type="button" className={styles.controlButton} onClick={() => setIsSharing((current) => !current)}>
              <ScreenShare size={18} aria-hidden />
              <span>{isSharing ? "Stop share" : "Share"}</span>
            </button>
            <button type="button" className={`${styles.controlButton} ${styles.leaveButton}`} onClick={leaveRoom}>
              <PhoneOff size={18} aria-hidden />
              <span>Leave</span>
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}