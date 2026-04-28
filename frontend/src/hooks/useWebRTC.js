import { useRef, useState, useCallback } from 'react';

/**
 * Audio-only WebRTC hook. Use with Socket.IO for signaling (offer/answer/ICE).
 * Peer connection is established when remote offer is received and answer is sent via socket.
 */
export function useWebRTC(socket, roomCode, remoteUserId) {
  const [isMuted, setIsMuted] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);

  const getLocalStream = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  }, []);

  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    pc.onicecandidate = (e) => {
      if (e.candidate && socket && roomCode)
        socket.emit('webrtc_ice', { roomCode, targetUserId: remoteUserId, candidate: e.candidate });
    };
    pc.ontrack = (e) => {
      if (e.streams?.[0]) setRemoteStream(e.streams[0]);
    };
    pc.onconnectionstatechange = () => {
      setIsConnected(pc.connectionState === 'connected');
    };
    pcRef.current = pc;
    return pc;
  }, [socket, roomCode, remoteUserId]);

  const startAudio = useCallback(async () => {
    if (!socket || !roomCode) return;
    try {
      const stream = await getLocalStream();
      const pc = createPeerConnection();
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('webrtc_offer', { roomCode, targetUserId: remoteUserId, offer });
    } catch (err) {
      console.error('WebRTC start error', err);
    }
  }, [socket, roomCode, remoteUserId, getLocalStream, createPeerConnection]);

  const stopAudio = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      setLocalStream(null);
    }
    if (socket && roomCode) socket.emit('webrtc_leave', { roomCode });
    setRemoteStream(null);
    setIsConnected(false);
  }, [socket, roomCode]);

  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => (t.enabled = isMuted));
      setIsMuted(!isMuted);
    }
  }, [isMuted]);

  const handleRemoteOffer = useCallback(
    async (offer) => {
      try {
        const stream = await getLocalStream();
        const pc = createPeerConnection();
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket?.emit('webrtc_answer', { roomCode, targetUserId: remoteUserId, answer });
      } catch (err) {
        console.error('Handle offer error', err);
      }
    },
    [socket, roomCode, remoteUserId, getLocalStream, createPeerConnection]
  );

  const handleRemoteAnswer = useCallback(async (answer) => {
    if (pcRef.current)
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
  }, []);

  const handleRemoteIce = useCallback((candidate) => {
    if (pcRef.current) pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
  }, []);

  return {
    isMuted,
    isConnected,
    localStream,
    remoteStream,
    startAudio,
    stopAudio,
    toggleMute,
    handleRemoteOffer,
    handleRemoteAnswer,
    handleRemoteIce,
  };
}
