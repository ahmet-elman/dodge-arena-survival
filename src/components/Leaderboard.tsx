import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Mode = "classic" | "flame";
type Row = { user_id: string; score: number; kills: number; username: string };

export function Leaderboard({ refreshKey = 0 }: { refreshKey?: number }) {
  const [mode, setMode] = useState<Mode>("classic");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("scores")
      .select("user_id, score, kills")
      .eq("mode", mode)
      .order("score", { ascending: false })
      .limit(200);

    const best = new Map<string, { score: number; kills: number }>();
    for (const r of data ?? []) {
      const cur = best.get(r.user_id);
      const score = Number(r.score);
      if (!cur || score > cur.score) best.set(r.user_id, { score, kills: r.kills });
    }
    const ids = [...best.keys()];
    let names = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, username").in("id", ids);
      names = new Map((profs ?? []).map((p) => [p.id, p.username]));
    }
    setRows(
      ids
        .map((id) => ({
          user_id: id,
          score: best.get(id)!.score,
          kills: best.get(id)!.kills,
          username: names.get(id) ?? "oyuncu",
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10),
    );
    setLoading(false);
  }, [mode]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <section className="arena-board">
      <div className="arena-board-head">
        <strong>🏆 Rekorlar</strong>
        <div className="arena-board-tabs">
          <button
            className={`arena-tab${mode === "classic" ? " is-active" : ""}`}
            onClick={() => setMode("classic")}
          >
            Klasik
          </button>
          <button
            className={`arena-tab${mode === "flame" ? " is-active" : ""}`}
            onClick={() => setMode("flame")}
          >
            Alev
          </button>
        </div>
      </div>
      {loading ? (
        <p className="arena-board-empty">Yükleniyor…</p>
      ) : rows.length === 0 ? (
        <p className="arena-board-empty">Bu modda henüz skor yok. İlk sen ol!</p>
      ) : (
        <ol className="arena-board-list">
          {rows.map((r, i) => (
            <li key={r.user_id}>
              <span className="arena-rank">{i + 1}</span>
              <span className="arena-name">{r.username}</span>
              <span className="arena-kills">{r.kills} öldürme</span>
              <span className="arena-time">{r.score.toFixed(1)}s</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
