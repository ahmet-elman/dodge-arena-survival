import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Dodge Arena — Giriş ve Kayıt" },
      {
        name: "description",
        content:
          "Dodge Arena hesabınla giriş yap veya kayıt ol, hayatta kalma rekorlarını kalıcı olarak sakla ve sıralamada yarış.",
      },
      { property: "og:title", content: "Dodge Arena — Giriş ve Kayıt" },
      {
        property: "og:description",
        content: "Hesabını oluştur, rekorlarını kaydet ve diğer oyuncularla sıralamada yarış.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) void navigate({ to: "/" });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    if (tab === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setErr(error.message);
      else void navigate({ to: "/" });
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { username: username.trim() || email.split("@")[0] },
        },
      });
      if (error) setErr(error.message);
      else if (!data.session) setMsg("Hesabını doğrulamak için e-postandaki bağlantıya tıkla.");
      else void navigate({ to: "/" });
    }
    setBusy(false);
  };

  const google = async () => {
    setErr(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setErr("Google ile giriş yapılamadı.");
      return;
    }
    if (result.redirected) return;
    void navigate({ to: "/" });
  };

  return (
    <main className="arena-page">
      <div className="arena-auth">
        <h1 className="arena-title">Dodge Arena</h1>
        <div className="arena-board-tabs">
          <button className={`arena-tab${tab === "in" ? " is-active" : ""}`} onClick={() => setTab("in")}>
            Giriş Yap
          </button>
          <button className={`arena-tab${tab === "up" ? " is-active" : ""}`} onClick={() => setTab("up")}>
            Kayıt Ol
          </button>
        </div>

        <form className="arena-form" onSubmit={submit}>
          {tab === "up" && (
            <label>
              Oyuncu adı
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Sıralamada görünecek ad"
                maxLength={24}
              />
            </label>
          )}
          <label>
            E-posta
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ornek@mail.com"
            />
          </label>
          <label>
            Şifre
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="En az 6 karakter"
            />
          </label>
          {err && <p className="arena-err">{err}</p>}
          {msg && <p className="arena-msg">{msg}</p>}
          <button className="arena-btn" type="submit" disabled={busy}>
            {busy ? "Lütfen bekle…" : tab === "in" ? "Giriş Yap" : "Kayıt Ol"}
          </button>
        </form>

        <button className="arena-btn arena-btn-ghost" onClick={google}>
          Google ile devam et
        </button>

        <Link to="/" className="arena-hint arena-link">
          ← Oyuna dön
        </Link>
      </div>
    </main>
  );
}
