"use client";

import { Camera, CameraOff, Mic, MicOff, PhoneOff, RefreshCw, ScreenShare, Users } from "lucide-react";
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

type PeerState = {
  pc: RTCPeerConnection;
  makingOffer: boolean;
  ignoreOffer: boolean;
  isSettingRemoteAnswerPending: boolean;
  polite: boolean;
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
  const isMobileDevice = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    if ("userAgentData" in navigator) {
      const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
      if (typeof uaData?.mobile === "boolean") return uaData.mobile;
    }
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  }, []);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  const peerStatesRef = useRef(new Map<string, PeerState>());
  const pendingIceCandidatesRef = useRef(new Map<string, RTCIceCandidateInit[]>());
  const signalChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const [viewerId, setViewerId] = useState<string | null>(null);
  const [viewerPresenceName, setViewerPresenceName] = useState("member");
  const [onlineMembers, setOnlineMembers] = useState<OnlineMember[]>([]);
  const [lastUpdatedLabel, setLastUpdatedLabel] = useState<string>("--:--");
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isSharing, setIsSharing] = useState(false);
  const [isJoinedRoom, setIsJoinedRoom] = useState(false);
  const [isConnectingMedia, setIsConnectingMedia] = useState(true);
  const [cameraFacingMode, setCameraFacingMode] = useState<"user" | "environment">("user");

  const getVideoConstraints = useCallback(
    (facing: "user" | "environment") => (isMobileDevice ? { facingMode: { ideal: facing } } : true),
    [isMobileDevice],
  );

  const requestVideoTrack = useCallback(
    async (facing: "user" | "environment") => {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: getVideoConstraints(facing),
        audio: false,
      });
      const [track] = stream.getVideoTracks();
      if (track) return track;

      stream.getTracks().forEach((currentTrack) => currentTrack.stop());
      throw new Error("No video track available from media stream.");
    },
    [getVideoConstraints],
  );

  const requestVideoTrackWithFallback = useCallback(
    async (facing: "user" | "environment") => {
      try {
        return await requestVideoTrack(facing);
      } catch (primaryError) {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoInputs = devices.filter((device) => device.kind === "videoinput");
          const matcher = facing === "environment" ? /(back|rear|environment)/i : /(front|user|face)/i;

          const matchedDevice = videoInputs.find((device) => matcher.test(device.label));
          if (!matchedDevice) throw primaryError;

          const stream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: matchedDevice.deviceId } },
            audio: false,
          });
          const [track] = stream.getVideoTracks();
          if (track) return track;

          stream.getTracks().forEach((currentTrack) => currentTrack.stop());
          throw primaryError;
        } catch {
          throw primaryError;
        }
      }
    },
    [requestVideoTrack],
  );

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreamsByUser, setRemoteStreamsByUser] = useState<Record<string, MediaStream>>({});

  const setRemoteStream = useCallback((userId: string, stream: MediaStream) => {
    setRemoteStreamsByUser((current) => ({ ...current, [userId]: stream }));
  }, []);

  const clearRemoteStream = useCallback((userId: string) => {
    setRemoteStreamsByUser((current) => {
      if (!current[userId]) return current;
      const rest = { ...current };
      delete rest[userId];
      return rest;
    });
  }, []);

  const ensureLocalTracks = useCallback(
    (connection: RTCPeerConnection) => {
      if (!localStream) return;

      const senderTrackIds = new Set(
        connection
          .getSenders()
          .map((sender) => sender.track?.id)
          .filter((trackId): trackId is string => Boolean(trackId)),
      );

      localStream.getTracks().forEach((track) => {
        if (senderTrackIds.has(track.id)) return;
        connection.addTrack(track, localStream);
      });
    },
    [localStream],
  );

  const removePeerConnection = useCallback(
    (userId: string) => {
      const peerState = peerStatesRef.current.get(userId);
      if (peerState) {
        const { pc } = peerState;
        pc.ontrack = null;
        pc.onicecandidate = null;
        pc.onconnectionstatechange = null;
        pc.oniceconnectionstatechange = null;
        pc.onicegatheringstatechange = null;
        pc.onsignalingstatechange = null;
        pc.onnegotiationneeded = null;
        pc.close();
      }

      peerStatesRef.current.delete(userId);
      pendingIceCandidatesRef.current.delete(userId);
      clearRemoteStream(userId);
    },
    [clearRemoteStream],
  );

  const createPeerConnection = useCallback(
    (peerId: string) => {
      const existing = peerStatesRef.current.get(peerId);
      if (existing) {
        ensureLocalTracks(existing.pc);
        return existing;
      }

      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },

          // Add your TURN server here for real-world connectivity:
          // {
          //   urls: "turn:YOUR_TURN_HOST:3478",
          //   username: "YOUR_TURN_USERNAME",
          //   credential: "YOUR_TURN_PASSWORD",
          // },
        ],
      });

      const polite = viewerId ? viewerId > peerId : false;

      const peerState: PeerState = {
        pc,
        makingOffer: false,
        ignoreOffer: false,
        isSettingRemoteAnswerPending: false,
        polite,
      };

      ensureLocalTracks(pc);

      pc.ontrack = (event) => {
        const [stream] = event.streams;
        if (!stream) return;
        console.log("[webrtc] ontrack from", peerId, stream);
        setRemoteStream(peerId, stream);
      };

      pc.onicecandidate = async (event) => {
        const channel = signalChannelRef.current;
        if (!event.candidate || !channel || !viewerId) return;

        try {
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
        } catch (error) {
          console.error("[webrtc] failed to send ICE candidate", error);
        }
      };

      pc.onnegotiationneeded = async () => {
        const channel = signalChannelRef.current;
        if (!channel || !viewerId) return;

        try {
          peerState.makingOffer = true;
          console.log("[webrtc] negotiationneeded -> create offer for", peerId);

          await pc.setLocalDescription();
          if (!pc.localDescription) return;

          await channel.send({
            type: "broadcast",
            event: "webrtc-signal",
            payload: {
              from: viewerId,
              to: peerId,
              type: "offer",
              sdp: pc.localDescription,
            } satisfies SignalPayload,
          });
        } catch (error) {
          console.error("[webrtc] negotiationneeded failed", error);
        } finally {
          peerState.makingOffer = false;
        }
      };

      pc.onconnectionstatechange = () => {
        console.log("[webrtc] connectionState", peerId, pc.connectionState);

        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          removePeerConnection(peerId);
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log("[webrtc] iceConnectionState", peerId, pc.iceConnectionState);
      };

      pc.onicegatheringstatechange = () => {
        console.log("[webrtc] iceGatheringState", peerId, pc.iceGatheringState);
      };

      pc.onsignalingstatechange = () => {
        console.log("[webrtc] signalingState", peerId, pc.signalingState);
      };

      peerStatesRef.current.set(peerId, peerState);
      return peerState;
    },
    [ensureLocalTracks, removePeerConnection, setRemoteStream, viewerId],
  );

  const startLocalMedia = useCallback(async () => {
    setLoadError(null);
    setIsConnectingMedia(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: getVideoConstraints(cameraFacingMode),
        audio: true,
      });

      setLocalStream(stream);
      setIsMicOn(true);
      setIsCameraOn(true);
    } catch (error) {
      console.error("[media] getUserMedia failed", error);
      setLoadError("Could not access camera/microphone. Check browser permissions.");
      setLocalStream(null);
    } finally {
      setIsConnectingMedia(false);
    }
  }, [cameraFacingMode, getVideoConstraints]);

  const replaceVideoTrack = useCallback((nextTrack: MediaStreamTrack | null) => {
    if (!localStream) return;
    const currentVideoTrack = localStream.getVideoTracks()[0] ?? null;
    if (currentVideoTrack) {
      currentVideoTrack.stop();
      localStream.removeTrack(currentVideoTrack);
    }
    if (nextTrack) {
      localStream.addTrack(nextTrack);
    }
    peerStatesRef.current.forEach(({ pc }) => {
      const sender =
        pc.getSenders().find((candidate) => candidate.track?.kind === "video") ??
        pc
          .getTransceivers()
          .find((transceiver) => transceiver.receiver.track.kind === "video")
          ?.sender;
      if (sender) {
        void sender.replaceTrack(nextTrack);
      } else if (nextTrack) {
        pc.addTrack(nextTrack, localStream);
      }
    });
    setLocalStream(new MediaStream(localStream.getTracks()));
  }, [localStream]);

  useEffect(() => {
    const videoElement = localVideoRef.current;
    if (!videoElement || !localStream) return;

    videoElement.srcObject = localStream;
    return () => {
      videoElement.srcObject = null;
    };
  }, [localStream]);

  useEffect(() => {
    if (!isJoinedRoom) return;
    void startLocalMedia();
  }, [isJoinedRoom, startLocalMedia]);

  useEffect(() => {
    return () => {
      localStream?.getTracks().forEach((track) => track.stop());

      peerStatesRef.current.forEach(({ pc }) => pc.close());
      peerStatesRef.current.clear();

      pendingIceCandidatesRef.current.clear();
    };
  }, [localStream]);

  useEffect(() => {
    if (!localStream) return;

    peerStatesRef.current.forEach(({ pc }) => {
      ensureLocalTracks(pc);
    });
  }, [ensureLocalTracks, localStream]);

  useEffect(() => {
    let isMounted = true;

    void supabase.auth
      .getUser()
      .then(async ({ data }) => {
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
      })
      .catch((error) => {
        if (!isMounted) return;
        console.error("Failed to load discussion video-room user", error);
        setViewerId(null);
        setViewerPresenceName("guest");
        setLoadError("Could not confirm your session. Please reload and try again.");
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!viewerId || !isJoinedRoom) return;

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
        try {
          const signal = payload as SignalPayload | null;
          if (!signal || signal.to !== viewerId || signal.from === viewerId) return;

          const peerState = createPeerConnection(signal.from);
          const { pc } = peerState;

          console.log("[webrtc] received", signal.type, "from", signal.from);

          if (signal.type === "offer" && signal.sdp) {
            const readyForOffer =
              !peerState.makingOffer &&
              (pc.signalingState === "stable" || peerState.isSettingRemoteAnswerPending);

            const offerCollision = !readyForOffer;
            peerState.ignoreOffer = !peerState.polite && offerCollision;

            if (peerState.ignoreOffer) {
              console.warn("[webrtc] ignoring offer due to collision from", signal.from);
              return;
            }

            await pc.setRemoteDescription(signal.sdp);

            const pending = pendingIceCandidatesRef.current.get(signal.from) ?? [];
            for (const candidate of pending) {
              try {
                await pc.addIceCandidate(candidate);
              } catch (error) {
                console.error("[webrtc] failed to add queued ICE candidate", error);
              }
            }
            pendingIceCandidatesRef.current.delete(signal.from);

            await pc.setLocalDescription();
            if (!pc.localDescription) return;

            await onlineChannel.send({
              type: "broadcast",
              event: "webrtc-signal",
              payload: {
                from: viewerId,
                to: signal.from,
                type: "answer",
                sdp: pc.localDescription,
              } satisfies SignalPayload,
            });

            return;
          }

          if (signal.type === "answer" && signal.sdp) {
            peerState.isSettingRemoteAnswerPending = true;
            try {
              await pc.setRemoteDescription(signal.sdp);
            } finally {
              peerState.isSettingRemoteAnswerPending = false;
            }

            const pending = pendingIceCandidatesRef.current.get(signal.from) ?? [];
            for (const candidate of pending) {
              try {
                await pc.addIceCandidate(candidate);
              } catch (error) {
                console.error("[webrtc] failed to add queued ICE candidate", error);
              }
            }
            pendingIceCandidatesRef.current.delete(signal.from);

            return;
          }

          if (signal.type === "ice-candidate" && signal.candidate) {
            try {
              if (pc.remoteDescription) {
                await pc.addIceCandidate(signal.candidate);
              } else {
                const queued = pendingIceCandidatesRef.current.get(signal.from) ?? [];
                queued.push(signal.candidate);
                pendingIceCandidatesRef.current.set(signal.from, queued);
              }
            } catch (error) {
              if (!peerState.ignoreOffer) {
                console.error("[webrtc] addIceCandidate failed", error);
              }
            }
          }
        } catch (error) {
          console.error("[webrtc] signal handling failed", error);
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

      Array.from(peerStatesRef.current.keys()).forEach((peerId) => {
        removePeerConnection(peerId);
      });

      void onlineChannel.untrack();
      void supabase.removeChannel(onlineChannel);
    };
  }, [createPeerConnection, isJoinedRoom, removePeerConnection, viewerId, viewerPresenceName]);

  useEffect(() => {
    if (!viewerId || !localStream || !isJoinedRoom) return;

    const others = onlineMembers.filter((member) => member.userId !== viewerId);

    others.forEach((member) => {
      createPeerConnection(member.userId);
    });

    const onlineIds = new Set(others.map((member) => member.userId));
    Array.from(peerStatesRef.current.keys()).forEach((peerId) => {
      if (!onlineIds.has(peerId)) {
        removePeerConnection(peerId);
      }
    });
  }, [createPeerConnection, isJoinedRoom, localStream, onlineMembers, removePeerConnection, viewerId]);

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
    if (next) {
      void requestVideoTrackWithFallback(cameraFacingMode)
        .then((track) => {
          track.enabled = true;
          replaceVideoTrack(track);
          setIsCameraOn(true);
        })
        .catch((error) => {
          console.error("[media] could not re-enable camera", error);
          setLoadError("Could not turn camera back on.");
          setIsCameraOn(false);
        });
      return;
    }

    localStream.getVideoTracks().forEach((track) => {
      track.enabled = false;
      track.stop();
    });
    replaceVideoTrack(null);
    setIsCameraOn(false);
  };

  const switchCamera = async () => {
    if (!isJoinedRoom || !isMobileDevice) return;
    const nextFacing = cameraFacingMode === "user" ? "environment" : "user";
    if (!isCameraOn) return;
    try {
      const currentVideoTrack = localStream?.getVideoTracks()[0] ?? null;
      if (currentVideoTrack && localStream) {
        currentVideoTrack.stop();
        localStream.removeTrack(currentVideoTrack);
      }
      const track = await requestVideoTrackWithFallback(nextFacing);
      replaceVideoTrack(track);
      setCameraFacingMode(nextFacing);
    } catch (error) {
      console.error("[media] switch camera failed", error);
      setLoadError("Could not switch camera.");
    }
  };

  const leaveRoom = () => {
    localStream?.getTracks().forEach((track) => track.stop());
    setLocalStream(null);
    setIsMicOn(false);
    setIsCameraOn(false);
    setIsSharing(false);
    setIsConnectingMedia(false);
    setIsJoinedRoom(false);

    Array.from(peerStatesRef.current.keys()).forEach((peerId) => removePeerConnection(peerId));
  };

  return (
    <section className={styles.roomShell} aria-label="Video and voice room">
      <header className={styles.topBar}>
        <div>
          <p className={styles.roomLabel}>Video Room</p>
          <h1 className={styles.roomTitle}>Live Meeting Room</h1>
          <p className={styles.roomDescription}>Real camera + microphone room using your device media permissions.</p>
          {!isJoinedRoom ? (
            <button type="button" className={styles.joinButton} onClick={() => setIsJoinedRoom(true)}>
              Join room
            </button>
          ) : null}
          {loadError ? <p className={styles.statusError}>{loadError}</p> : null}
        </div>

        <div className={styles.metaPills}>
          <span>
            <Users size={14} aria-hidden /> {participantTiles.length} in room
          </span>
          <span className={styles.livePill}>{isJoinedRoom && localStream ? "Connected" : "Disconnected"}</span>
          <span>Updated {lastUpdatedLabel}</span>
        </div>
      </header>

      <div className={styles.meetingLayout}>
        <section className={styles.stageWrap}>
          <div className={styles.videoGrid} aria-label="Participant videos">
            <article className={styles.localStage}>
              {localStream && isCameraOn ? (
                <video ref={localVideoRef} autoPlay muted playsInline className={styles.localVideo} />
              ) : (
                <button type="button" className={styles.videoFallback} onClick={() => !isJoinedRoom && setIsJoinedRoom(true)}>
                  {isJoinedRoom ? "Camera is off" : "Click Join room to connect"}
                </button>
              )}
              <div className={styles.stageBadge}>{isJoinedRoom ? "You" : "Not joined"}</div>
              {isJoinedRoom && isConnectingMedia ? <p className={styles.statusInfo}>Connecting camera and microphone…</p> : null}
            </article>

            {remoteParticipants.map((member) => (
              <RemoteVideoTile key={member.userId} member={member} />
            ))}
          </div>

          <div className={styles.participantStrip}>
            {participantTiles.map((member) => (
              <article key={member.userId} className={styles.participantTile}>
                <div className={styles.tileAvatar}>{member.initials}</div>
                <p>{member.name}</p>
              </article>
            ))}
          </div>

          <div className={styles.controlDock}>
            <button type="button" className={styles.controlButton} onClick={toggleMic} disabled={!isJoinedRoom || !localStream}>
              {isMicOn ? <Mic size={18} aria-hidden /> : <MicOff size={18} aria-hidden />}
              <span>{isMicOn ? "Mute" : "Unmute"}</span>
            </button>

            <button type="button" className={styles.controlButton} onClick={toggleCamera} disabled={!isJoinedRoom || !localStream}>
              {isCameraOn ? <Camera size={18} aria-hidden /> : <CameraOff size={18} aria-hidden />}
              <span>{isCameraOn ? "Stop video" : "Start video"}</span>
            </button>
            <button
              type="button"
              className={styles.controlButton}
              onClick={() => void switchCamera()}
              disabled={!isJoinedRoom || !isMobileDevice}
            >
              <RefreshCw size={18} aria-hidden />
              <span>{isMobileDevice ? "Switch camera" : "Switch unavailable"}</span>
            </button>

            <button
              type="button"
              className={styles.controlButton}
              onClick={() => setIsSharing((current) => !current)}
              disabled={!isJoinedRoom}
            >
              <ScreenShare size={18} aria-hidden />
              <span>{isSharing ? "Stop share" : "Share"}</span>
            </button>

            <button
              type="button"
              className={`${styles.controlButton} ${styles.leaveButton}`}
              onClick={leaveRoom}
              disabled={!isJoinedRoom}
            >
              <PhoneOff size={18} aria-hidden />
              <span>Leave</span>
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}