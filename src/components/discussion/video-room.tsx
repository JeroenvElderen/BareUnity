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

type RemoteVideoParticipant = {
  userId: string;
  name: string;
  initials: string;
  stream: MediaStream | null;
};

type SignalPayload = {
  from: string;
  to: string;
  type: "offer" | "answer" | "ice-candidate";
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

function profileInitials(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "ME";

  const pieces = trimmed.split(/\s+/).filter(Boolean);
  if (!pieces.length) return "ME";
  if (pieces.length === 1) return pieces[0]!.slice(0, 2).toUpperCase();
  return `${pieces[0]![0]}${pieces[1]![0]}`.toUpperCase();
}

function RemoteVideoTile({ member }: { member: RemoteVideoParticipant }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.srcObject = member.stream;
    return () => {
      video.srcObject = null;
    };
  }, [member.stream]);

  return (
    <article className={styles.remoteTile}>
      {member.stream ? (
        <video ref={videoRef} autoPlay playsInline className={styles.remoteVideo} />
      ) : (
        <div className={styles.remoteFallback}>Waiting for video…</div>
      )}
      <div className={styles.remoteBadge}>{member.name}</div>
    </article>
  );
}

export function VideoRoom() {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const peerConnectionsRef = useRef(new Map<string, RTCPeerConnection>());
  const signalChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

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
  const [remoteStreamsByUser, setRemoteStreamsByUser] = useState<Record<string, MediaStream>>({});

  const setRemoteStream = useCallback((userId: string, stream: MediaStream) => {
    setRemoteStreamsByUser((current) => ({ ...current, [userId]: stream }));
  }, []);

  const clearRemoteStream = useCallback((userId: string) => {
    setRemoteStreamsByUser((current) => {
      if (!current[userId]) return current;
      current[userId]?.getTracks().forEach((track) => track.stop());
      const rest = { ...current };
      delete rest[userId];
      return rest;
    });
  }, []);

  const removePeerConnection = useCallback(
    (userId: string) => {
      const existing = peerConnectionsRef.current.get(userId);
      if (existing) {
        existing.ontrack = null;
        existing.onicecandidate = null;
        existing.onconnectionstatechange = null;
        existing.close();
      }
      peerConnectionsRef.current.delete(userId);
      clearRemoteStream(userId);
    },
    [clearRemoteStream],
  );

  const upsertPeerConnection = useCallback(
    (peerId: string) => {
      const existing = peerConnectionsRef.current.get(peerId);
      if (existing) return existing;

      const connection = new RTCPeerConnection({
        iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
      });

      if (localStream) {
        localStream.getTracks().forEach((track) => {
          connection.addTrack(track, localStream);
        });
      }

      connection.ontrack = (event) => {
        const [stream] = event.streams;
        if (!stream) return;
        setRemoteStream(peerId, stream);
      };

      connection.onconnectionstatechange = () => {
        if (connection.connectionState === "failed" || connection.connectionState === "disconnected" || connection.connectionState === "closed") {
          removePeerConnection(peerId);
        }
      };

      connection.onicecandidate = async (event) => {
        const channel = signalChannelRef.current;
        if (!event.candidate || !channel || !viewerId) return;

        await channel.send({
          type: "broadcast",
          event: "webrtc-signal",
          payload: {
            from: viewerId,
            to: peerId,
            type: "ice-candidate",
            candidate: event.candidate.toJSON(),
          } satisfies SignalPayload,
        });
      };

      peerConnectionsRef.current.set(peerId, connection);
      return connection;
    },
    [localStream, removePeerConnection, setRemoteStream, viewerId],
  );

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
    const peerConnections = peerConnectionsRef.current;

    return () => {
      localStream?.getTracks().forEach((track) => {
        track.stop();
      });
      peerConnections.forEach((connection) => {
        connection.close();
      });
      peerConnections.clear();
      Object.values(remoteStreamsByUser).forEach((stream) => {
        stream.getTracks().forEach((track) => track.stop());
      });
    };
  }, [localStream, remoteStreamsByUser]);

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

    const peerConnections = peerConnectionsRef.current;
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
      .on("broadcast", { event: "webrtc-signal" }, async ({ payload }) => {
        const signal = payload as SignalPayload | null;
        if (!signal || signal.to !== viewerId || signal.from === viewerId) return;

        const peerConnection = upsertPeerConnection(signal.from);

        if (signal.type === "offer" && signal.sdp) {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);
          await onlineChannel.send({
            type: "broadcast",
            event: "webrtc-signal",
            payload: {
              from: viewerId,
              to: signal.from,
              type: "answer",
              sdp: answer,
            } satisfies SignalPayload,
          });
        }

        if (signal.type === "answer" && signal.sdp) {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        }

        if (signal.type === "ice-candidate" && signal.candidate) {
          await peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
      })
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;
        signalChannelRef.current = onlineChannel;

        await onlineChannel.track({
          user_id: viewerId,
          name: viewerPresenceName,
          initials: profileInitials(viewerPresenceName),
        });
      });

    return () => {
        signalChannelRef.current = null;
      Array.from(peerConnections.keys()).forEach((peerId) => removePeerConnection(peerId));
      void onlineChannel.untrack();
      void supabase.removeChannel(onlineChannel);
    };
  }, [removePeerConnection, upsertPeerConnection, viewerId, viewerPresenceName]);

  useEffect(() => {
    if (!viewerId || !localStream) return;

    const onlineChannel = supabase.getChannels().find((channel) => channel.topic === "realtime:video-room-presence");
    if (!onlineChannel) return;

    const others = onlineMembers.filter((member) => member.userId !== viewerId);

    others.forEach((member) => {
      if (peerConnectionsRef.current.has(member.userId)) return;

      const shouldInitiate = viewerId < member.userId;
      if (!shouldInitiate) return;

      const connection = upsertPeerConnection(member.userId);

      void (async () => {
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        await onlineChannel.send({
          type: "broadcast",
          event: "webrtc-signal",
          payload: {
            from: viewerId,
            to: member.userId,
            type: "offer",
            sdp: offer,
          } satisfies SignalPayload,
        });
      })();
    });

    const onlineIds = new Set(others.map((member) => member.userId));
    Array.from(peerConnectionsRef.current.keys()).forEach((peerId) => {
      if (!onlineIds.has(peerId)) {
        removePeerConnection(peerId);
      }
    });
  }, [localStream, onlineMembers, removePeerConnection, upsertPeerConnection, viewerId]);

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

  const remoteParticipants = useMemo<RemoteVideoParticipant[]>(() => {
    return participantTiles
      .filter((member) => member.userId !== viewerId)
      .map((member) => ({
        ...member,
        stream: remoteStreamsByUser[member.userId] ?? null,
      }));
  }, [participantTiles, remoteStreamsByUser, viewerId]);

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

        {remoteParticipants.length ? (
            <div className={styles.remoteGrid} aria-label="Remote participant videos">
              {remoteParticipants.map((member) => (
                <RemoteVideoTile key={member.userId} member={member} />
              ))}
            </div>
          ) : null}
          
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