import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import liff from "@line/liff";

export default function useWorldBossSocket() {
  const [snapshot, setSnapshot] = useState(null);
  const [enrageBatch, setEnrageBatch] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = io("/world-boss", {
      // socketSetProfile reads socket.handshake.query.token (NOT auth.token)
      query: { token: liff.getAccessToken() },
    });

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("snapshot", snap => setSnapshot(snap));
    socket.on("enrage", payload => {
      setEnrageBatch(payload.knockedBatch || []);
      // auto-clear the flash after a few seconds
      setTimeout(() => setEnrageBatch(null), 4000);
    });

    return () => {
      socket.close();
    };
  }, []);

  return { snapshot, enrageBatch, connected };
}
