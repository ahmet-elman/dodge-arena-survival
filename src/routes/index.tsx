import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dodge Arena — Survive the Chase" },
      {
        name: "description",
        content:
          "Dodge Arena is a fast browser arcade game: move with WASD or arrows, auto-attack chasing enemies, level up every 15 seconds and survive.",
      },
      { property: "og:title", content: "Dodge Arena — Survive the Chase" },
      {
        property: "og:description",
        content:
          "Move with WASD, arrows or touch. Auto-attack enemies, pick upgrades every 15s and beat your best survival time.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type Vec = { x: number; y: number };
type Enemy = Vec & { vx: number; vy: number; r: number; hue: number; hp: number; maxHp: number; hit: number };
type Bullet = Vec & { vx: number; vy: number; r: number; dmg: number; life: number };
type Particle = Vec & { vx: number; vy: number; life: number; max: number; r: number; hue: number };

type Phase = "menu" | "playing" | "upgrade" | "over";

type UpgradeKey = "hp" | "damage" | "speed" | "firerate" | "heal";
type Upgrade = { key: UpgradeKey; title: string; desc: string; icon: string };

const UPGRADES: Upgrade[] = [
  { key: "hp", title: "Can Barı +25", desc: "Maksimum can artar ve 25 can dolar", icon: "❤" },
  { key: "damage", title: "Saldırı Gücü +35%", desc: "Mermilerin verdiği hasar artar", icon: "⚔" },
  { key: "speed", title: "Hız +18%", desc: "Daha hızlı hareket edersin", icon: "⚡" },
  { key: "firerate", title: "Atış Hızı +25%", desc: "Otomatik saldırı daha sık ateşler", icon: "🎯" },
  { key: "heal", title: "Tam İyileşme", desc: "Canını tamamen doldurur", icon: "✚" },
];

function pick3(): Upgrade[] {
  const pool = [...UPGRADES];
  const out: Upgrade[] = [];
  while (out.length < 3 && pool.length) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]!);
  }
  return out;
}

function Index() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [phase, setPhase] = useState<Phase>("menu");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [level, setLevel] = useState(1);
  const [hp, setHp] = useState(100);
  const [maxHp, setMaxHp] = useState(100);
  const [kills, setKills] = useState(0);
  const [choices, setChoices] = useState<Upgrade[]>([]);
  const phaseRef = useRef<Phase>("menu");
  const stickRef = useRef<Vec>({ x: 0, y: 0 });
  const stickBaseRef = useRef<HTMLDivElement | null>(null);
  const stickKnobRef = useRef<HTMLDivElement | null>(null);
  const [isTouch, setIsTouch] = useState(false);
  const startRef = useRef<() => void>(() => {});
  const applyRef = useRef<(k: UpgradeKey) => void>(() => {});

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    setIsTouch(
      typeof window !== "undefined" &&
        (window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window),
    );
  }, []);

  // sanal joystick
  useEffect(() => {
    const base = stickBaseRef.current;
    const knob = stickKnobRef.current;
    if (!base || !knob) return;
    let id: number | null = null;

    const setKnob = (dx: number, dy: number) => {
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    };
    const move = (e: PointerEvent) => {
      if (id !== e.pointerId) return;
      const rect = base.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const max = rect.width / 2 - 12;
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > max) {
        dx = (dx / d) * max;
        dy = (dy / d) * max;
      }
      setKnob(dx, dy);
      stickRef.current = { x: dx / max, y: dy / max };
    };
    const down = (e: PointerEvent) => {
      id = e.pointerId;
      base.setPointerCapture(e.pointerId);
      move(e);
      e.preventDefault();
    };
    const up = (e: PointerEvent) => {
      if (id !== e.pointerId) return;
      id = null;
      stickRef.current = { x: 0, y: 0 };
      setKnob(0, 0);
    };
    base.addEventListener("pointerdown", down);
    base.addEventListener("pointermove", move);
    base.addEventListener("pointerup", up);
    base.addEventListener("pointercancel", up);
    return () => {
      base.removeEventListener("pointerdown", down);
      base.removeEventListener("pointermove", move);
      base.removeEventListener("pointerup", up);
      base.removeEventListener("pointercancel", up);
    };
  }, [isTouch, phase]);

  useEffect(() => {
    const stored = Number(localStorage.getItem("dodge-arena-best") || 0);
    if (!Number.isNaN(stored)) setBest(stored);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const keys = new Set<string>();
    const player = {
      x: w / 2,
      y: h / 2,
      vx: 0,
      vy: 0,
      r: 13,
      hp: 100,
      maxHp: 100,
      speed: 340,
      damage: 12,
      fireRate: 2.2,
      range: 260,
      invuln: 0,
    };
    let enemies: Enemy[] = [];
    let bullets: Bullet[] = [];
    let particles: Particle[] = [];
    let elapsed = 0;
    let spawnTimer = 0;
    let fireTimer = 0;
    let nextLevelAt = 15;
    let shake = 0;
    const pointer = { active: false, x: 0, y: 0 };

    const burst = (x: number, y: number, n: number, hue: number, power = 3) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = Math.random() * power + 0.5;
        const max = 0.4 + Math.random() * 0.6;
        particles.push({
          x,
          y,
          vx: Math.cos(a) * s * 60,
          vy: Math.sin(a) * s * 60,
          life: max,
          max,
          r: 1 + Math.random() * 3,
          hue,
        });
      }
    };

    const spawnEnemy = () => {
      const side = Math.floor(Math.random() * 4);
      const m = 24;
      let x = 0;
      let y = 0;
      if (side === 0) {
        x = Math.random() * w;
        y = -m;
      } else if (side === 1) {
        x = w + m;
        y = Math.random() * h;
      } else if (side === 2) {
        x = Math.random() * w;
        y = h + m;
      } else {
        x = -m;
        y = Math.random() * h;
      }
      const tier = Math.floor(elapsed / 15);
      const maxHpE = 14 + tier * 9;
      enemies.push({
        x,
        y,
        vx: 0,
        vy: 0,
        r: 10 + Math.random() * 4,
        hue: 350 + Math.random() * 20,
        hp: maxHpE,
        maxHp: maxHpE,
        hit: 0,
      });
      burst(x, y, 8, 355, 2);
    };

    const start = () => {
      player.x = w / 2;
      player.y = h / 2;
      player.vx = 0;
      player.vy = 0;
      player.maxHp = 100;
      player.hp = 100;
      player.speed = 340;
      player.damage = 12;
      player.fireRate = 2.2;
      player.invuln = 0;
      enemies = [];
      bullets = [];
      particles = [];
      elapsed = 0;
      spawnTimer = 0;
      fireTimer = 0;
      nextLevelAt = 15;
      shake = 0;
      setScore(0);
      setKills(0);
      setLevel(1);
      setHp(100);
      setMaxHp(100);
      setPhase("playing");
      for (let i = 0; i < 3; i++) spawnEnemy();
    };
    startRef.current = start;

    applyRef.current = (k: UpgradeKey) => {
      if (k === "hp") {
        player.maxHp += 25;
        player.hp = Math.min(player.maxHp, player.hp + 25);
      } else if (k === "damage") {
        player.damage *= 1.35;
      } else if (k === "speed") {
        player.speed *= 1.18;
      } else if (k === "firerate") {
        player.fireRate *= 1.25;
      } else if (k === "heal") {
        player.hp = player.maxHp;
      }
      setHp(Math.ceil(player.hp));
      setMaxHp(player.maxHp);
      setLevel((l) => l + 1);
      setPhase("playing");
      burst(player.x, player.y, 40, 140, 4);
    };

    const gameOver = () => {
      burst(player.x, player.y, 60, 190, 6);
      shake = 16;
      const final = Math.floor(elapsed * 10) / 10;
      setScore(final);
      setBest((b) => {
        const nb = Math.max(b, final);
        localStorage.setItem("dodge-arena-best", String(nb));
        return nb;
      });
      setPhase("over");
    };

    const onKeyDown = (e: KeyboardEvent) => {
      keys.add(e.key.toLowerCase());
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(e.key.toLowerCase()))
        e.preventDefault();
      if (e.key === "Enter" && (phaseRef.current === "menu" || phaseRef.current === "over")) start();
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp);

    const pos = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      pointer.active = true;
      pos(e);
    };
    const onMove = (e: PointerEvent) => {
      if (pointer.active) pos(e);
    };
    const onUp = () => {
      pointer.active = false;
    };
    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    let last = performance.now();
    let raf = 0;

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const running = phaseRef.current === "playing";

      if (running) {
        elapsed += dt;
        setScore(Math.floor(elapsed * 10) / 10);
        if (player.invuln > 0) player.invuln -= dt;

        // input
        let ax = 0;
        let ay = 0;
        if (keys.has("a") || keys.has("arrowleft")) ax -= 1;
        if (keys.has("d") || keys.has("arrowright")) ax += 1;
        if (keys.has("w") || keys.has("arrowup")) ay -= 1;
        if (keys.has("s") || keys.has("arrowdown")) ay += 1;
        const stick = stickRef.current;
        if (Math.hypot(stick.x, stick.y) > 0.12) {
          ax += stick.x;
          ay += stick.y;
        } else if (pointer.active) {
          const dx = pointer.x - player.x;
          const dy = pointer.y - player.y;
          const d = Math.hypot(dx, dy);
          if (d > 4) {
            ax += dx / d;
            ay += dy / d;
          }
        }
        const len = Math.hypot(ax, ay);
        if (len > 0) {
          ax /= len;
          ay /= len;
        }
        const accel = player.speed * 7.6;
        player.vx += ax * accel * dt;
        player.vy += ay * accel * dt;
        const drag = Math.pow(0.0015, dt);
        player.vx *= drag;
        player.vy *= drag;
        const maxS = player.speed;
        const sp = Math.hypot(player.vx, player.vy);
        if (sp > maxS) {
          player.vx = (player.vx / sp) * maxS;
          player.vy = (player.vy / sp) * maxS;
        }
        player.x = Math.max(player.r, Math.min(w - player.r, player.x + player.vx * dt));
        player.y = Math.max(player.r, Math.min(h - player.r, player.y + player.vy * dt));
        if (sp > 60 && Math.random() < 0.6) burst(player.x, player.y, 1, 190, 0.6);

        // difficulty
        const steps = Math.floor(elapsed / 15);
        const enemySpeed = 90 * Math.pow(1.18, steps);

        spawnTimer -= dt;
        if (spawnTimer <= 0) {
          spawnEnemy();
          spawnTimer = Math.max(0.55, 2.0 - elapsed * 0.02);
        }

        // auto attack: nearest enemy in range
        fireTimer -= dt;
        if (fireTimer <= 0 && enemies.length) {
          let target: Enemy | null = null;
          let bd = Infinity;
          for (const en of enemies) {
            const d = Math.hypot(en.x - player.x, en.y - player.y);
            if (d < bd) {
              bd = d;
              target = en;
            }
          }
          if (target && bd < player.range * 2.5) {
            const dx = target.x - player.x;
            const dy = target.y - player.y;
            const d = Math.hypot(dx, dy) || 1;
            const bs = 520;
            bullets.push({
              x: player.x,
              y: player.y,
              vx: (dx / d) * bs,
              vy: (dy / d) * bs,
              r: 4.5,
              dmg: player.damage,
              life: 1.6,
            });
            fireTimer = 1 / player.fireRate;
          }
        }

        // bullets
        for (const b of bullets) {
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.life -= dt;
          for (const en of enemies) {
            if (en.hp <= 0) continue;
            if (Math.hypot(en.x - b.x, en.y - b.y) < en.r + b.r) {
              en.hp -= b.dmg;
              en.hit = 0.12;
              b.life = 0;
              burst(b.x, b.y, 5, 45, 2);
              if (en.hp <= 0) {
                burst(en.x, en.y, 18, en.hue, 3.5);
                setKills((k) => k + 1);
              }
              break;
            }
          }
        }
        bullets = bullets.filter((b) => b.life > 0 && b.x > -30 && b.x < w + 30 && b.y > -30 && b.y < h + 30);
        enemies = enemies.filter((en) => en.hp > 0);

        for (const en of enemies) {
          if (en.hit > 0) en.hit -= dt;
          const dx = player.x - en.x;
          const dy = player.y - en.y;
          const d = Math.hypot(dx, dy) || 1;
          en.vx += ((dx / d) * enemySpeed - en.vx) * Math.min(1, dt * 3);
          en.vy += ((dy / d) * enemySpeed - en.vy) * Math.min(1, dt * 3);
          en.x += en.vx * dt;
          en.y += en.vy * dt;
          if (d < en.r + player.r && player.invuln <= 0) {
            player.hp -= 12 + steps * 3;
            player.invuln = 0.8;
            shake = 10;
            burst(player.x, player.y, 14, 0, 3);
            setHp(Math.max(0, Math.ceil(player.hp)));
            if (player.hp <= 0) {
              gameOver();
              break;
            }
          }
        }

        // level up every 15s
        if (phaseRef.current === "playing" && elapsed >= nextLevelAt) {
          nextLevelAt += 15;
          setChoices(pick3());
          setPhase("upgrade");
          phaseRef.current = "upgrade";
        }
      }

      // particles
      for (const p of particles) {
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.96;
        p.vy *= 0.96;
      }
      particles = particles.filter((p) => p.life > 0);
      if (particles.length > 600) particles = particles.slice(-600);

      // render
      ctx.save();
      if (shake > 0) {
        shake *= 0.9;
        ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      }
      const g = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, Math.max(w, h) * 0.75);
      g.addColorStop(0, "#141a2e");
      g.addColorStop(1, "#080b16");
      ctx.fillStyle = g;
      ctx.fillRect(-40, -40, w + 80, h + 80);

      ctx.strokeStyle = "rgba(120,160,255,0.07)";
      ctx.lineWidth = 1;
      const grid = 48;
      ctx.beginPath();
      for (let x = 0; x < w; x += grid) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = 0; y < h; y += grid) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();

      for (const p of particles) {
        const a = Math.max(0, p.life / p.max);
        ctx.fillStyle = `hsla(${p.hue}, 90%, 65%, ${a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * a + 0.4, 0, Math.PI * 2);
        ctx.fill();
      }

      const t = now / 1000;
      for (const en of enemies) {
        const pulse = 1 + Math.sin(t * 6 + en.x * 0.05) * 0.08;
        ctx.shadowBlur = 18;
        ctx.shadowColor = `hsl(${en.hue},90%,60%)`;
        ctx.fillStyle = en.hit > 0 ? "#ffffff" : `hsl(${en.hue},85%,58%)`;
        ctx.beginPath();
        ctx.arc(en.x, en.y, en.r * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(255,255,255,0.65)";
        ctx.beginPath();
        ctx.arc(en.x - en.r * 0.3, en.y - en.r * 0.3, en.r * 0.25, 0, Math.PI * 2);
        ctx.fill();
        if (en.hp < en.maxHp) {
          const bw = en.r * 2.2;
          ctx.fillStyle = "rgba(0,0,0,0.45)";
          ctx.fillRect(en.x - bw / 2, en.y - en.r - 9, bw, 3.5);
          ctx.fillStyle = "hsl(140,80%,55%)";
          ctx.fillRect(en.x - bw / 2, en.y - en.r - 9, (bw * en.hp) / en.maxHp, 3.5);
        }
      }

      for (const b of bullets) {
        ctx.shadowBlur = 14;
        ctx.shadowColor = "hsl(48,100%,60%)";
        ctx.fillStyle = "hsl(50,100%,72%)";
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      if (phaseRef.current === "playing" || phaseRef.current === "upgrade") {
        const flash = player.invuln > 0 && Math.floor(t * 20) % 2 === 0;
        ctx.globalAlpha = flash ? 0.45 : 1;
        ctx.shadowBlur = 24;
        ctx.shadowColor = "hsl(190,100%,60%)";
        ctx.fillStyle = "hsl(185,100%,70%)";
        ctx.beginPath();
        ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(player.x, player.y, player.r + 4 + Math.sin(t * 5) * 1.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  const handleStart = useCallback(() => startRef.current(), []);
  const handlePick = useCallback((k: UpgradeKey) => applyRef.current(k), []);

  return (
    <main className="arena-page">
      <div className="arena-wrap">
        <header className="arena-head">
          <h1 className="arena-title">Dodge Arena</h1>
          <div className="arena-stats">
            <span className="stat">
              <small>Süre</small>
              {score.toFixed(1)}s
            </span>
            <span className="stat">
              <small>Seviye</small>
              {level}
            </span>
            <span className="stat">
              <small>Öldürme</small>
              {kills}
            </span>
            <span className="stat">
              <small>Rekor</small>
              {best.toFixed(1)}s
            </span>
          </div>
        </header>

        <div className="arena-hpbar" aria-label="Can barı">
          <div
            className="arena-hpfill"
            style={{ width: `${Math.max(0, Math.min(100, (hp / maxHp) * 100))}%` }}
          />
          <span className="arena-hptext">
            {Math.max(0, hp)} / {maxHp}
          </span>
        </div>

        <div className="arena-stage">
          <canvas ref={canvasRef} className="arena-canvas" />

          {phase === "upgrade" && (
            <div className="arena-overlay">
              <div className="arena-card arena-card-wide">
                <h2>Seviye Atladın!</h2>
                <p>Bir güçlendirme seç</p>
                <div className="arena-choices">
                  {choices.map((c) => (
                    <button key={c.key} className="arena-choice" onClick={() => handlePick(c.key)}>
                      <span className="arena-choice-icon">{c.icon}</span>
                      <strong>{c.title}</strong>
                      <em>{c.desc}</em>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {(phase === "menu" || phase === "over") && (
            <div className="arena-overlay">
              <div className="arena-card">
                {phase === "menu" ? (
                  <>
                    <h2>Hayatta kal</h2>
                    <p>
                      WASD, ok tuşları veya dokunmatikte sürükle ile hareket et. Karakterin en yakın düşmana
                      otomatik ateş eder. Her 15 saniyede güçlendirme seç.
                    </p>
                    <button className="arena-btn" onClick={handleStart}>
                      Oyunu Başlat
                    </button>
                  </>
                ) : (
                  <>
                    <h2>Oyun Bitti</h2>
                    <p className="arena-score">{score.toFixed(1)}s</p>
                    <p>
                      Rekor: {best.toFixed(1)}s · {kills} düşman
                    </p>
                    <button className="arena-btn" onClick={handleStart}>
                      Tekrar Oyna
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {isTouch && phase === "playing" && (
            <div className="arena-stick" ref={stickBaseRef} aria-label="Yön kolu">
              <div className="arena-stick-knob" ref={stickKnobRef} />
            </div>
          )}
        </div>


        <p className="arena-hint">Düşmanlar her 15 saniyede hızlanır ve güçlenir.</p>
      </div>
    </main>
  );
}
