import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type OnlineMode = "classic" | "flame";

export type Peer = {
  id: string;
  name: string;
  nx: number;
  ny: number;
  hp: number;
  maxHp: number;
  score: number;
  kills: number;
  level: number;
  alive: boolean;
  ts: number;
};

export type SelfState = {
  nx: number;
  ny: number;
  hp: number;
  maxHp: number;
  score: number;
  kills: number;
  level: number;
  alive: boolean;
};

export type RosterEntry = { id: string; name: string; joinedAt: number };

export const MAX_PLAYERS = 5;

export function makeRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 5; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

type Handlers = {
  onRoster?: (roster: RosterEntry[]) => void;
  onStart?: (mode: OnlineMode) => void;
  onPeers?: (peers: Peer[]) => void;
};

export class OnlineSession {
  readonly code: string;
  readonly me: { id: string; name: string };
  private channel: RealtimeChannel;
  private handlers: Handlers;
  private joinedAt = Date.now();
  peers = new Map<string, Peer>();
  roster: RosterEntry[] = [];

  constructor(code: string, me: { id: string; name: string }, handlers: Handlers = {}) {
    this.code = code;
    this.me = me;
    this.handlers = handlers;
    this.channel = supabase.channel(`arena:${code}`, {
      config: { presence: { key: me.id }, broadcast: { self: false } },
    });

    this.channel.on("presence", { event: "sync" }, () => {
      const state = this.channel.presenceState<{ id: string; name: string; joinedAt: number }>();
      const list: RosterEntry[] = [];
      for (const metas of Object.values(state)) {
        const m = metas[0];
        if (m) list.push({ id: m.id, name: m.name, joinedAt: m.joinedAt });
      }
      list.sort((a, b) => a.joinedAt - b.joinedAt);
      this.roster = list;
      for (const id of [...this.peers.keys()]) {
        if (!list.some((r) => r.id === id)) this.peers.delete(id);
      }
      this.handlers.onRoster?.(list);
    });

    this.channel.on("broadcast", { event: "state" }, ({ payload }) => {
      const p = payload as Peer;
      if (!p || p.id === me.id) return;
      this.peers.set(p.id, { ...p, ts: Date.now() });
      this.handlers.onPeers?.([...this.peers.values()]);
    });

    this.channel.on("broadcast", { event: "start" }, ({ payload }) => {
      this.peers.clear();
      this.handlers.onStart?.((payload as { mode: OnlineMode }).mode);
    });
  }

  async join() {
    await new Promise<void>((resolve, reject) => {
      this.channel.subscribe((status) => {
        if (status === "SUBSCRIBED") resolve();
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") reject(new Error("Bağlantı kurulamadı"));
      });
    });
    this.joinedAt = Date.now();
    await this.channel.track({ id: this.me.id, name: this.me.name, joinedAt: this.joinedAt });
  }

  isHost() {
    return this.roster.length > 0 && this.roster[0]!.id === this.me.id;
  }

  broadcastStart(mode: OnlineMode) {
    this.peers.clear();
    void this.channel.send({ type: "broadcast", event: "start", payload: { mode } });
  }

  sendState(s: SelfState) {
    void this.channel.send({
      type: "broadcast",
      event: "state",
      payload: { id: this.me.id, name: this.me.name, ts: Date.now(), ...s },
    });
  }

  livePeers(): Peer[] {
    const now = Date.now();
    return [...this.peers.values()].filter((p) => now - p.ts < 6000);
  }

  async leave() {
    try {
      await this.channel.untrack();
    } catch {
      /* ignore */
    }
    await supabase.removeChannel(this.channel);
  }
}

export async function createRoom(userId: string, isPublic: boolean) {
  for (let i = 0; i < 6; i++) {
    const code = makeRoomCode();
    const { error } = await supabase
      .from("rooms")
      .insert({ code, host_id: userId, is_public: isPublic, status: "waiting", players: 1 });
    if (!error) return code;
  }
  throw new Error("Oda oluşturulamadı");
}

export async function findQuickRoom(userId: string) {
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("rooms")
    .select("code, players")
    .eq("is_public", true)
    .eq("status", "waiting")
    .gt("updated_at", since)
    .lt("players", MAX_PLAYERS)
    .order("created_at", { ascending: true })
    .limit(1);
  const room = data?.[0];
  if (room) return room.code;
  return createRoom(userId, true);
}

export async function roomExists(code: string) {
  const { data } = await supabase.from("rooms").select("code, players").eq("code", code).maybeSingle();
  return data;
}

export async function setRoomPlayers(code: string, players: number) {
  await supabase.from("rooms").update({ players }).eq("code", code);
}

export async function setRoomStatus(code: string, status: "waiting" | "playing", mode?: OnlineMode) {
  await supabase
    .from("rooms")
    .update(mode ? { status, mode } : { status })
    .eq("code", code);
}
