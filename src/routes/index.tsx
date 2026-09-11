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
type ItemKind = "freeze" | "burn";
type Item = Vec & { kind: ItemKind; life: number };

type Phase = "menu" | "playing" | "upgrade" | "over";
type Mode = "classic" | "flame";

type UpgradeKey = "hp" | "damage" | "speed" | "firerate" | "heal" | "nova" | "guns";
type Upgrade = { key: UpgradeKey; title: string; desc: string; icon: string; weight: number };

const UPGRADES: Upgrade[] = [
  { key: "hp", title: "Can Barı +25", desc: "Maksimum can artar ve 25 can dolar", icon: "❤", weight: 10 },
  { key: "damage", title: "Saldırı Gücü +35%", desc: "Mermilerin verdiği hasar artar", icon: "⚔", weight: 10 },
  { key: "speed", title: "Hız +18%", desc: "Daha hızlı hareket edersin", icon: "⚡", weight: 10 },
  { key: "firerate", title: "Atış Hızı +25%", desc: "Otomatik saldırı daha sık ateşler", icon: "🎯", weight: 10 },
  { key: "heal", title: "Tam İyileşme", desc: "Canını tamamen doldurur", icon: "✚", weight: 8 },
  {
    key: "nova",
    title: "Buz Patlaması",
    desc: "Periyodik olarak düşmanları 1 sn dondurur ve hasar verir",
    icon: "❄",
    weight: 8,
  },
  { key: "guns", title: "Ekstra Silah", desc: "Aynı anda bir mermi daha ateşlersin", icon: "🔫", weight: 3 },
];

function pickChoices(n: number, mode: Mode = "classic"): Upgrade[] {
  const banned: UpgradeKey[] = mode === "flame" ? ["firerate", "guns"] : [];
  const pool = UPGRADES.filter((u) => !banned.includes(u.key)).map((u) => ({ ...u }));
  const out: Upgrade[] = [];
  while (out.length < n && pool.length) {
    const total = pool.reduce((s, u) => s + u.weight, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i]!.weight;
      if (r <= 0) {
        idx = i;
        break;
      }
    }
    out.push(pool.splice(idx, 1)[0]!);
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
  const [zoomPct, setZoomPct] = useState(100);
  const [choices, setChoices] = useState<Upgrade[]>([]);
  const [picked, setPicked] = useState<UpgradeKey | null>(null);
  const phaseRef = useRef<Phase>("menu");
  const [mode, setMode] = useState<Mode>("classic");
  const stickRef = useRef<Vec>({ x: 0, y: 0 });
  const stickBaseRef = useRef<HTMLDivElement | null>(null);
  const stickKnobRef = useRef<HTMLDivElement | null>(null);
  const [isTouch, setIsTouch] = useState(false);
  const startRef = useRef<(m: Mode) => void>(() => {});
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

    let vw = 0;
    let vh = 0;
    let dpr = 1;
    let zoom = 1; // <1 => daha geniş harita görünümü
    let w = 0; // dünya genişliği
    let h = 0;

    const applySize = () => {
      w = vw / zoom;
      h = vh / zoom;
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      vw = rect.width;
      vh = rect.height;
      canvas.width = Math.floor(vw * dpr);
      canvas.height = Math.floor(vh * dpr);
      applySize();
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
      guns: 1,
      nova: 0,
      flame: false,
      flameRange: 96,
    };
    let enemies: Enemy[] = [];
    let bullets: Bullet[] = [];
    let particles: Particle[] = [];
    let items: Item[] = [];
    let elapsed = 0;
    let spawnTimer = 0;
    let fireTimer = 0;
    let novaTimer = 0;
    let freezeTimer = 0;
    let burnTimer = 0;
    let nextLevelAt = 15;
    let levelNo = 1;
    let shake = 0;
    let flashRing = 0;
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
      const maxHpE = 16 + tier * 8 + tier * tier * 1.6;
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

    const start = (m: Mode = "classic") => {
      zoom = 1;
      applySize();
      const flame = m === "flame";
      player.x = w / 2;
      player.y = h / 2;
      player.vx = 0;
      player.vy = 0;
      player.maxHp = flame ? 150 : 100;
      player.hp = player.maxHp;
      player.speed = 340;
      player.damage = 12;
      player.fireRate = 2.2;
      player.invuln = 0;
      player.guns = 1;
      player.nova = 0;
      player.flame = flame;
      player.flameRange = 96;
      enemies = [];
      bullets = [];
      particles = [];
      items = [];
      elapsed = 0;
      spawnTimer = 0;
      fireTimer = 0;
      novaTimer = 0;
      freezeTimer = 0;
      burnTimer = 0;
      nextLevelAt = 15;
      levelNo = 1;
      shake = 0;
      setScore(0);
      setKills(0);
      setLevel(1);
      setHp(player.maxHp);
      setMaxHp(player.maxHp);
      setZoomPct(100);
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
      } else if (k === "nova") {
        player.nova += 1;
        novaTimer = Math.min(novaTimer, 2);
      } else if (k === "range") {
        player.flameRange *= 1.2;
      } else if (k === "guns") {
        if (player.flame) player.flameRange += 28;
        else player.guns += 1;
      }
      levelNo += 1;

      // her 5 seviyede kuş bakışı %10 genişler
      if (levelNo % 5 === 1 && levelNo > 1) {
        const oldW = w;
        const oldH = h;
        zoom *= 0.9;
        applySize();
        player.x += (w - oldW) / 2;
        player.y += (h - oldH) / 2;
        for (const en of enemies) {
          en.x += (w - oldW) / 2;
          en.y += (h - oldH) / 2;
        }
        setZoomPct(Math.round((1 / zoom) * 100));
        flashRing = 1;
      }

      setHp(Math.ceil(player.hp));
      setMaxHp(player.maxHp);
      setLevel(levelNo);
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
      pointer.x = (e.clientX - rect.left) / zoom;
      pointer.y = (e.clientY - rect.top) / zoom;
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
        if (freezeTimer > 0) freezeTimer -= dt;
        if (burnTimer > 0) burnTimer -= dt;

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
        const enemySpeed = 150 + steps * 26 + steps * steps * 2.2;

        if (freezeTimer <= 0) {
          spawnTimer -= dt;
          if (spawnTimer <= 0) {
            spawnEnemy();
            spawnTimer = Math.max(0.55, 2.0 - elapsed * 0.02);
          }
        }


        const killEnemy = (en: Enemy) => {
          burst(en.x, en.y, 18, en.hue, 3.5);
          setKills((k) => k + 1);
          if (Math.random() < 0.04) {
            items.push({
              x: en.x,
              y: en.y,
              kind: Math.random() < 0.5 ? "freeze" : "burn",
              life: 12,
            });
          }
        };

        // buz patlaması (nova)
        if (player.nova > 0) {
          novaTimer -= dt;
          if (novaTimer <= 0) {
            novaTimer = Math.max(4, 10 - (player.nova - 1) * 1.5);
            freezeTimer = Math.max(freezeTimer, 1);
            flashRing = 1;
            const dmg = 20 + player.nova * 15;
            burst(player.x, player.y, 40, 195, 5);
            for (const en of enemies) {
              if (Math.hypot(en.x - player.x, en.y - player.y) < 260) {
                en.hp -= dmg;
                en.hit = 0.12;
                if (en.hp <= 0) killEnemy(en);
              }
            }
            enemies = enemies.filter((en) => en.hp > 0);
          }
        }

        // yanma etkisi
        if (burnTimer > 0) {
          for (const en of enemies) {
            en.hp -= 26 * dt;
            if (Math.random() < 0.25) burst(en.x, en.y, 1, 25, 1);
            if (en.hp <= 0) killEnemy(en);
          }
          enemies = enemies.filter((en) => en.hp > 0);
        }

        // itemler
        for (const it of items) {
          it.life -= dt;
          if (Math.hypot(it.x - player.x, it.y - player.y) < player.r + 16) {
            it.life = 0;
            if (it.kind === "freeze") {
              freezeTimer = Math.max(freezeTimer, 3);
              burst(player.x, player.y, 40, 195, 5);
            } else {
              burnTimer = Math.max(burnTimer, 3);
              burst(player.x, player.y, 40, 25, 5);
            }
            flashRing = 1;
          }
        }
        items = items.filter((it) => it.life > 0);

        // alev silahı: sadece yakındaki düşmanlara sürekli hasar
        if (player.flame) {
          const fr = player.flameRange;
          const dps = player.damage * player.fireRate * 1.6;
          for (const en of enemies) {
            const d = Math.hypot(en.x - player.x, en.y - player.y);
            if (d < fr + en.r) {
              en.hp -= dps * dt;
              en.hit = 0.06;
              if (Math.random() < 0.15) burst(en.x, en.y, 1, 28, 1.0);
              if (en.hp <= 0) killEnemy(en);
            }
          }
          enemies = enemies.filter((en) => en.hp > 0);
          if (Math.random() < 0.25) {
            const a = Math.random() * Math.PI * 2;
            const rr = Math.random() * fr;
            burst(player.x + Math.cos(a) * rr, player.y + Math.sin(a) * rr, 1, 28, 0.6);
          }
        }

        // otomatik saldırı: en yakın düşman
        fireTimer -= dt;
        if (!player.flame && fireTimer <= 0 && enemies.length) {
          const maxRange = player.range * 2.5;
          const inRange = enemies
            .map((en) => ({ en, d: Math.hypot(en.x - player.x, en.y - player.y) }))
            .filter((o) => o.d < maxRange)
            .sort((a, b) => a.d - b.d);
          if (inRange.length) {
            const bs = 520;
            const n = player.guns;
            for (let i = 0; i < n; i++) {
              // her silah farklı bir hedefe kilitlenir; hedef azsa en yakınlara döner
              const t = inRange[i % inRange.length]!.en;
              const a = Math.atan2(t.y - player.y, t.x - player.x);
              bullets.push({
                x: player.x,
                y: player.y,
                vx: Math.cos(a) * bs,
                vy: Math.sin(a) * bs,
                r: 4.5,
                dmg: player.damage,
                life: 1.6,
              });
            }
            fireTimer = 1 / player.fireRate;
          }
        }


        // mermiler
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
              if (en.hp <= 0) killEnemy(en);
              break;
            }
          }
        }
        bullets = bullets.filter((b) => b.life > 0 && b.x > -30 && b.x < w + 30 && b.y > -30 && b.y < h + 30);
        enemies = enemies.filter((en) => en.hp > 0);

        const frozen = freezeTimer > 0;
        for (const en of enemies) {
          if (en.hit > 0) en.hit -= dt;
          const dx = player.x - en.x;
          const dy = player.y - en.y;
          const d = Math.hypot(dx, dy) || 1;
          if (!frozen) {
            en.vx += ((dx / d) * enemySpeed - en.vx) * Math.min(1, dt * 3);
            en.vy += ((dy / d) * enemySpeed - en.vy) * Math.min(1, dt * 3);
            en.x += en.vx * dt;
            en.y += en.vy * dt;
          }
          if (d < en.r + player.r && player.invuln <= 0) {
            player.hp -= 12 + steps * 2 + steps * steps * 0.25;
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

        // her 15 saniyede seviye
        if (phaseRef.current === "playing" && elapsed >= nextLevelAt) {
          nextLevelAt += 15;
          setChoices(pickChoices(4, player.flame ? "flame" : "classic"));
          setPhase("upgrade");
          phaseRef.current = "upgrade";
        }
      }

      // parçacıklar
      for (const p of particles) {
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.96;
        p.vy *= 0.96;
      }
      particles = particles.filter((p) => p.life > 0);
      if (particles.length > 600) particles = particles.slice(-600);
      if (flashRing > 0) flashRing = Math.max(0, flashRing - dt * 1.5);

      // render
      ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, 0, 0);
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
      ctx.lineWidth = 1 / zoom;
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

      if (freezeTimer > 0) {
        ctx.fillStyle = "rgba(90,200,255,0.10)";
        ctx.fillRect(0, 0, w, h);
      }
      if (burnTimer > 0) {
        ctx.fillStyle = "rgba(255,120,40,0.09)";
        ctx.fillRect(0, 0, w, h);
      }

      for (const p of particles) {
        const a = Math.max(0, p.life / p.max);
        ctx.fillStyle = `hsla(${p.hue}, 90%, 65%, ${a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * a + 0.4, 0, Math.PI * 2);
        ctx.fill();
      }

      const t = now / 1000;

      for (const it of items) {
        const bob = Math.sin(t * 4 + it.x) * 3;
        const hue = it.kind === "freeze" ? 195 : 25;
        ctx.shadowBlur = 20;
        ctx.shadowColor = `hsl(${hue},95%,60%)`;
        ctx.fillStyle = `hsl(${hue},95%,62%)`;
        ctx.beginPath();
        ctx.arc(it.x, it.y + bob, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#04101a";
        ctx.font = "bold 11px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(it.kind === "freeze" ? "❄" : "🔥", it.x, it.y + bob + 1);
      }

      for (const en of enemies) {
        const pulse = 1 + Math.sin(t * 6 + en.x * 0.05) * 0.08;
        const frozen = freezeTimer > 0;
        ctx.shadowBlur = 18;
        ctx.shadowColor = frozen ? "hsl(195,95%,65%)" : `hsl(${en.hue},90%,60%)`;
        ctx.fillStyle = en.hit > 0 ? "#ffffff" : frozen ? "hsl(195,80%,62%)" : `hsl(${en.hue},85%,58%)`;
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
          ctx.fillRect(en.x - bw / 2, en.y - en.r - 9, (bw * Math.max(0, en.hp)) / en.maxHp, 3.5);
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
        if (player.flame) {
          const fr = player.flameRange * (1 + Math.sin(t * 8) * 0.02);
          const fg = ctx.createRadialGradient(player.x, player.y, player.r, player.x, player.y, fr);
          fg.addColorStop(0, "rgba(255,170,90,0.16)");
          fg.addColorStop(0.7, "rgba(255,140,70,0.08)");
          fg.addColorStop(1, "rgba(255,130,60,0)");
          ctx.fillStyle = fg;
          ctx.beginPath();
          ctx.arc(player.x, player.y, fr, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "rgba(255,160,90,0.22)";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
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
        if (flashRing > 0) {
          ctx.strokeStyle = `rgba(140,230,255,${flashRing})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(player.x, player.y, 40 + (1 - flashRing) * 220, 0, Math.PI * 2);
          ctx.stroke();
        }
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

  const handleStart = useCallback((m: Mode) => {
    setPicked(null);
    setMode(m);
    startRef.current(m);
  }, []);

  const handlePick = useCallback(
    (k: UpgradeKey) => {
      if (picked) return;
      setPicked(k);
      window.setTimeout(() => {
        applyRef.current(k);
        setPicked(null);
      }, 500);
    },
    [picked],
  );

  // 1-4 tuşları ile seçim
  useEffect(() => {
    if (phase !== "upgrade") return;
    const onKey = (e: KeyboardEvent) => {
      const i = ["1", "2", "3", "4"].indexOf(e.key);
      if (i >= 0 && choices[i]) {
        e.preventDefault();
        handlePick(choices[i]!.key);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, choices, handlePick]);

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
              <small>Görüş</small>
              {zoomPct}%
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

          {(phase === "menu" || phase === "over") && (
            <div className="arena-overlay">
              <div className="arena-card">
                {phase === "menu" ? (
                  <>
                    <h2>Hayatta kal</h2>
                    <p>
                      WASD, ok tuşları veya dokunmatikte sürükle ile hareket et. Her 15 saniyede güçlendirme
                      seç (1-4 tuşları). Bir mod seç:
                    </p>
                    <div className="arena-modes">
                      <button className="arena-btn" onClick={() => handleStart("classic")}>
                        🔫 Klasik Silah
                      </button>
                      <button className="arena-btn arena-btn-flame" onClick={() => handleStart("flame")}>
                        🔥 Alev Silahı
                      </button>
                    </div>
                    <p className="arena-modehint">
                      Alev modu: 150 can ile başlarsın, sadece yaklaşan düşmanlar yanar.
                    </p>
                  </>
                ) : (
                  <>
                    <h2>Oyun Bitti</h2>
                    <p className="arena-score">{score.toFixed(1)}s</p>
                    <p>
                      Rekor: {best.toFixed(1)}s · {kills} düşman ·{" "}
                      {mode === "flame" ? "Alev modu" : "Klasik mod"}
                    </p>
                    <div className="arena-modes">
                      <button className="arena-btn" onClick={() => handleStart(mode)}>
                        Tekrar Oyna
                      </button>
                      <button
                        className="arena-btn arena-btn-flame"
                        onClick={() => handleStart(mode === "flame" ? "classic" : "flame")}
                      >
                        {mode === "flame" ? "🔫 Klasik Mod" : "🔥 Alev Modu"}
                      </button>
                    </div>
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

        {phase === "upgrade" && (
          <section className="arena-panel">
            <div className="arena-panel-head">
              <strong>Seviye {level + 1} · Bir güçlendirme seç</strong>
              <span>{picked ? "Devam ediliyor…" : "1 · 2 · 3 · 4 tuşlarıyla da seçebilirsin"}</span>
            </div>
            <div className="arena-choices arena-choices-4">
              {choices.map((c, i) => (
                <button
                  key={c.key}
                  className={`arena-choice${picked === c.key ? " is-picked" : ""}`}
                  disabled={!!picked}
                  onClick={() => handlePick(c.key)}
                >
                  <span className="arena-choice-num">{i + 1}</span>
                  <span className="arena-choice-icon">{c.icon}</span>
                  <strong>{c.title}</strong>
                  <em>{c.desc}</em>
                </button>
              ))}
            </div>
          </section>
        )}

        <p className="arena-hint">
          Düşmanlar her 15 saniyede hızlanır. Nadir düşenler: ❄ 3 sn dondurma, 🔥 3 sn yakma.
        </p>
      </div>
    </main>
  );
}
