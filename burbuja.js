/* =====================================================================
   BURBUJA DONATELOS: chat + puntos por ver + premios + apuestas con puntos
   Necesita app.js (usa su conexión `db` a Supabase) y haber ejecutado schema.sql.
   ===================================================================== */
(function () {
  "use strict";

  const BX = {
    TICK_MS: 5000,      // cada cuánto revisa si el video avanza
    BEAT_S: 60,         // segundos viendo = 1 punto
    DAILY_CAP: 180,     // tope diario (debe coincidir con schema.sql)
    COUNTRIES: ["Argentina", "Bolivia", "Brasil", "Chile", "Colombia", "Ecuador", "Estados Unidos", "Guatemala", "Honduras", "México", "Panamá", "Perú", "Uruguay", "Venezuela"],
    FLAGS: { "Argentina": "🇦🇷", "Bolivia": "🇧🇴", "Brasil": "🇧🇷", "Chile": "🇨🇱", "Colombia": "🇨🇴", "Ecuador": "🇪🇨", "Estados Unidos": "🇺🇸", "Guatemala": "🇬🇹", "Honduras": "🇭🇳", "México": "🇲🇽", "Panamá": "🇵🇦", "Perú": "🇵🇪", "Uruguay": "🇺🇾", "Venezuela": "🇻🇪", "Global": "🌐" },
    
    // Datos de partidos: API pública NO oficial de ESPN (sin clave).
    ESPN: "https://site.api.espn.com/apis/site/v2/sports/soccer/",
    
    // Función auxiliar para generar el endpoint completo de cualquier liga o deporte (soporta NBA)
    getScoreboardUrl(slug) {
      if (!slug) return "";

      if (slug.includes("nba") || slug.startsWith("basketball/")) {
        return `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard`;
      }
      return `${this.ESPN}${slug}/scoreboard`;
    },

   // Endpoint de resumen individual para consultar partidos finalizados
    getSummaryUrl(slug, matchId) {
      if (!slug || !matchId) return "";

      // Si es NBA o básquetbol
      if (slug.includes("nba") || slug.includes("basketball")) {
        return `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${matchId}`;
      }

      // Limpiar el slug por si viene con prefijos extra
      const cleanSlug = slug.replace(/^soccer\//, "");
      return `https://site.api.espn.com/apis/site/v2/sports/soccer/${cleanSlug}/summary?event=${matchId}`;
    },

    LEAGUES: [
      { slug: "conmebol.libertadores", name: "Copa Libertadores" },
      { slug: "conmebol.sudamericana", name: "Copa Sudamericana" },
      { slug: "uefa.champions", name: "Champions League" },
      { slug: "esp.1", name: "LaLiga (España)" },
      { slug: "eng.1", name: "Premier League" },
      { slug: "per.1", name: "Liga 1 (Perú)" },
      { slug: "arg.1", name: "Liga Argentina" },
      { slug: "mex.1", name: "Liga MX" },
      { slug: "col.1", name: "Liga Colombiana" },
      { slug: "bra.1", name: "Brasileirão" },
      { slug: "chi.1", name: "Liga Chilena" },
      { slug: "uru.1", name: "Liga Uruguaya" }
    ],
    MULT: { home: 2, draw: 3, away: 2 },   // respaldo general
    STAKES: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000]
  };

  // Ligas nuevas solicitadas que se agregan de forma inteligente sin duplicar
  const ligasNuevas = [
    { name: "Bundesliga", slug: "ger.1" },
    { name: "Liga Profesional Argentina", slug: "arg.1" },
    { name: "Serie A Brasil", slug: "bra.1" },
    { name: "Liga de Primera Chile", slug: "chi.1" },
    { name: "MLS", slug: "usa.1" },
    { name: "Ligue 1 Francia", slug: "fra.1" },
    { name: "Serie A Italia", slug: "ita.1" },
    { name: "Eliteserien Noruega", slug: "nor.1" },
    { name: "Eredivisie Países Bajos", slug: "ned.1" },
    { name: "Liga Portugal", slug: "por.1" },
    { name: "NBA", slug: "basketball/nba" }
  ];

  ligasNuevas.forEach(nueva => {
    if (!BX.LEAGUES.some(l => l.slug === nueva.slug)) {
      BX.LEAGUES.push(nueva);
    }
  });

  Object.assign(BX, window.BX_OVERRIDE || {});

  const sb = (typeof db !== "undefined" && db) ? db : null;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  function uuid() {
    try { if (crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16); });
  }
  let DEV = lsGet("donatelos_device");
  if (!DEV) { DEV = uuid(); lsSet("donatelos_device", DEV); }

  const S = {
    open: false, tab: "chat", player: null, points: 0, earnedToday: 0,
    msgs: [], chatSub: null, rewards: null, redeemFor: null, top: null, bets: null,
    editing: false, adult: lsGet("donatelos_18") === "1" ? true : lsGet("donatelos_18") === "0" ? false : null,
    league: BX.LEAGUES[0].slug, events: null, evErr: "", slip: null, watching: false, notice: "", noticeType: "ok"
  };
  try { const p = JSON.parse(lsGet("donatelos_player") || "null"); if (p && p.nickname) S.player = p; } catch (e) {}

  async function rpc(name, args) {
    if (!sb) throw new Error("El servicio no está disponible ahora.");
    const { data, error } = await sb.rpc(name, args);
    if (error) throw new Error(error.message || "Error");
    return data;
  }
  const flag = c => (BX.FLAGS[c] || "") + " " + c;

  /* ---------------- Estilos ---------------- */
  const css = `
  #bx-root{font-family:'Plus Jakarta Sans',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
  html.tv #bx-root{display:none}
  .bx-btn{position:fixed;right:20px;bottom:96px;z-index:250;width:60px;height:60px;border-radius:50%;border:0;background:#6D4AFF;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.45)}
  .bx-btn:focus-visible,.bx-panel button:focus-visible,.bx-panel input:focus-visible,.bx-panel select:focus-visible{outline:3px solid #fff;outline-offset:2px}
  .bx-pts{position:absolute;top:-6px;right:-6px;min-width:26px;height:22px;padding:0 6px;border-radius:11px;background:#FFC94D;color:#1A1200;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center}
  .bx-panel{position:fixed;right:20px;bottom:168px;z-index:260;width:min(380px,calc(100vw - 24px));height:min(600px,calc(100vh - 190px));background:#12141B;color:#F2F3F7;border:1px solid #262A36;border-radius:18px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.6)}
  .bx-panel[hidden]{display:none}
  .bx-head{display:flex;align-items:center;gap:10px;padding:14px 16px;background:linear-gradient(135deg,#3B1FA8,#6D4AFF)}
  .bx-head h3{margin:0;font-size:16px;font-weight:800;flex:1}
  .bx-chip{background:rgba(255,255,255,.2);padding:4px 10px;border-radius:999px;font-size:13px;font-weight:800;white-space:nowrap}
  .bx-x{width:36px;height:36px;border:0;border-radius:50%;background:rgba(255,255,255,.18);color:#fff;font-size:16px;cursor:pointer}
  .bx-tabs{display:flex;gap:4px;padding:8px;border-bottom:1px solid #262A36}
  .bx-tabs button{flex:1;min-height:40px;border:0;border-radius:10px;background:transparent;color:#A3A9B8;font-size:13px;font-weight:700;cursor:pointer}
  .bx-tabs button.on{background:#1E2230;color:#F2F3F7}
  .bx-body{flex:1;overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:12px}
  .bx-bot{background:#1E2230;border-radius:12px;padding:12px;font-size:14px;line-height:1.45}
  .bx-in,.bx-sel{width:100%;min-height:44px;padding:0 12px;border-radius:10px;border:1px solid #262A36;background:#0E0F14;color:#F2F3F7;font-size:14px;font-family:inherit}
  .bx-primary{min-height:44px;padding:0 16px;border:0;border-radius:10px;background:#6D4AFF;color:#fff;font-weight:800;font-size:14px;cursor:pointer;font-family:inherit}
  .bx-primary[disabled]{opacity:.45;cursor:not-allowed}
  .bx-ghost{min-height:44px;padding:0 16px;border:1px solid #262A36;border-radius:10px;background:#171923;color:#F2F3F7;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit}
  .bx-row{display:flex;gap:8px}
  .bx-small{margin:0;font-size:12px;color:#A3A9B8;line-height:1.4}
  .bx-small a{color:#B9A6FF;cursor:pointer;text-decoration:underline}
  #bx-notice{margin:0;font-size:13px;font-weight:700;border-radius:10px;padding:10px 12px}
  #bx-notice.ok{background:#052E16;color:#86EFAC}#bx-notice.err{background:#450A0A;color:#FCA5A5}#bx-notice:empty{display:none}
  .bx-msgs{flex:1;min-height:180px;overflow-y:auto;display:flex;flex-direction:column;gap:8px}
  .bx-m{font-size:13px}.bx-m b{color:#B9A6FF;margin-right:6px}.bx-m i{font-style:normal;color:#A3A9B8;font-size:11px}
  .bx-m p{margin:2px 0 0;line-height:1.4;word-break:break-word}
  .bx-m.bx-adm{background:#2A1712;border:1px solid #5A2A1E;border-radius:10px;padding:8px 10px}.bx-m.bx-adm b{color:#FF8A70}
  .bx-big{text-align:center}.bx-big span{font-size:48px;font-weight:800;color:#FFC94D;display:block;line-height:1}.bx-big small{color:#A3A9B8}
  .bx-bar{height:8px;border-radius:4px;background:#262A36;overflow:hidden}.bx-bar i{display:block;height:100%;background:#6D4AFF}
  .bx-card{background:#171923;border:1px solid #262A36;border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:8px}
  .bx-card h4,.bx-body h4{margin:0;font-size:14px}
  .bx-card p{margin:0;font-size:13px;color:#C9CEDA}
  .bx-rank{display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px solid #1E2230}
  .bx-picks{display:flex;gap:6px}.bx-picks button{flex:1;min-height:44px;border:1px solid #262A36;border-radius:10px;background:#0E0F14;color:#F2F3F7;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;padding:4px}
  .bx-picks button.on{background:#6D4AFF;border-color:#6D4AFF}.bx-picks small{display:block;color:#FFC94D;font-size:12px;transition:color 0.3s}
  .bx-teams{font-size:14px;font-weight:800}.bx-meta{font-size:12px;color:#A3A9B8}
  .bx-st-ganada{color:#86EFAC}.bx-st-perdida{color:#FCA5A5}.bx-st-anulada{color:#FFC94D}
  /* ---- Chat mejorado ---- */
  .bx-chatwrap{display:flex;flex-direction:column;gap:8px;flex:1;min-height:0}
  .bx-chead{display:flex;align-items:center;gap:8px;font-size:12px;color:#A3A9B8}
  .bx-dot{width:8px;height:8px;border-radius:50%;background:#F59E0B}
  .bx-dot.on{background:#22C55E;animation:bx-pulse 2s infinite}
  .bx-fx{margin-left:auto;border:1px solid #262A36;background:#171923;color:#F2F3F7;border-radius:999px;padding:4px 10px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit}
  .bx-msgwrap{position:relative;flex:1;min-height:200px;display:flex}
  .bx-chatbox{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:3px;padding:10px;border-radius:14px;background:radial-gradient(120% 80% at 50% 0%,#1A1D2B,#0E0F14);border:1px solid #1E2230;scroll-behavior:smooth}
  .bx-msg{display:flex;gap:8px;align-items:flex-end;max-width:92%;animation:bx-in .22s ease-out}
  .bx-msg.mine{align-self:flex-end;flex-direction:row-reverse}
  .bx-msg:not(.grp){margin-top:8px}
  .bx-av{flex:none;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#fff;background:hsl(var(--h),55%,42%)}
  .bx-av.sp{visibility:hidden}
  .bx-bub{background:#1E2230;border-radius:16px 16px 16px 4px;padding:7px 11px;min-width:0}
  .bx-msg.mine .bx-bub{background:linear-gradient(135deg,#6D4AFF,#8B5CF6);border-radius:16px 16px 4px 16px}
  .bx-who{display:flex;align-items:baseline;gap:6px;font-size:12px;margin-bottom:2px}
  .bx-who a{color:#C4B5FD;font-weight:800;cursor:pointer}
  .bx-who i{font-style:normal;font-size:11px;color:#A3A9B8}
  .bx-who time{margin-left:auto;font-size:10px;color:#7C8296;padding-left:8px}
  .bx-txt{font-size:14px;line-height:1.4;word-break:break-word;color:#F2F3F7}
  .bx-txt.jumbo{font-size:34px;line-height:1.1}
  .bx-t-r{display:block;text-align:right;font-size:10px;color:rgba(255,255,255,.7);margin-top:2px}
  .bx-at{color:#93C5FD;font-weight:700}
  .bx-at.bx-me{background:#FFC94D;color:#1A1200;border-radius:6px;padding:0 4px}
  .bx-msg.ment .bx-bub{box-shadow:0 0 0 2px #FFC94D}
  .bx-msg.adm{max-width:100%;align-self:stretch}
  .bx-msg.adm .bx-bub{flex:1;background:#1B1405;border:1px solid #F5C518;border-left-width:5px;border-radius:6px}
  .bx-msg.adm .bx-who b{color:#F5C518;font-weight:800}
  .bx-msg.adm .bx-txt{font-weight:800;text-transform:uppercase;letter-spacing:.02em}
  .bx-down{position:absolute;right:10px;bottom:10px;border:0;border-radius:999px;padding:6px 12px;background:#6D4AFF;color:#fff;font-size:12px;font-weight:800;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.5);font-family:inherit}
  .bx-down[hidden]{display:none}
  .bx-typing{min-height:18px;font-size:12px;color:#A3A9B8;display:flex;align-items:center;gap:6px}
  .bx-typing .d{display:inline-flex;gap:3px}
  .bx-typing .d i{width:5px;height:5px;border-radius:50%;background:#A3A9B8;animation:bx-bounce 1.2s infinite}
  .bx-typing .d i:nth-child(2){animation-delay:.15s}.bx-typing .d i:nth-child(3){animation-delay:.3s}
  .bx-quick{display:flex;gap:6px}
  .bx-quick button{flex:1;min-height:38px;border:1px solid #262A36;border-radius:10px;background:#171923;font-size:18px;cursor:pointer;transition:transform .12s}
  .bx-quick button:active{transform:scale(1.25)}
  .bx-pop{display:grid;grid-template-columns:repeat(8,1fr);gap:4px;padding:8px;border-radius:12px;background:#171923;border:1px solid #262A36;max-height:132px;overflow-y:auto}
  .bx-pop[hidden]{display:none}
  .bx-pop button{border:0;background:transparent;font-size:20px;min-height:34px;border-radius:8px;cursor:pointer}
  .bx-pop button:hover{background:#262A36}
  .bx-rainmenu{display:flex;align-items:center;flex-wrap:wrap}
  .bx-rainmenu[hidden]{display:none}
  .bx-rainmenu span{font-size:12px;color:#A3A9B8;margin-right:6px}
  .bx-composer{display:flex;gap:6px;align-items:center}
  .bx-composer .bx-in{flex:1;min-width:0;border-radius:999px;padding:0 14px}
  .bx-ico{flex:none;width:44px;height:44px;border:1px solid #262A36;border-radius:50%;background:#171923;font-size:20px;cursor:pointer}
  .bx-send{flex:none;width:44px;height:44px;border:0;border-radius:50%;background:#6D4AFF;color:#fff;font-size:18px;cursor:pointer}
  .bx-unread{position:absolute;top:-6px;left:-6px;min-width:22px;height:22px;padding:0 6px;border-radius:11px;background:#EF4444;color:#fff;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center}
  .bx-unread[hidden]{display:none}
  .bx-btn.pulse{animation:bx-pulse-btn 1s ease-out 2}
  #bx-rain{position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:300}
  html.tv #bx-rain{display:none}
  .bx-drop{position:absolute;top:-60px;will-change:transform;animation:bx-fall linear forwards}
  .bx-rainlbl{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:301;background:rgba(18,20,27,.92);border:1px solid #262A36;color:#fff;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:13px;font-weight:700;padding:6px 14px;border-radius:999px;pointer-events:none}
  @keyframes bx-fall{to{transform:translate3d(var(--sw),115vh,0) rotate(var(--rot))}}
  @keyframes bx-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
  @keyframes bx-bounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-4px)}}
  @keyframes bx-pulse{0%{box-shadow:0 0 0 0 rgba(34,197,94,.5)}70%{box-shadow:0 0 0 6px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}
  @keyframes bx-pulse-btn{0%{transform:scale(1)}50%{transform:scale(1.12)}100%{transform:scale(1)}}
  @media (prefers-reduced-motion:reduce){.bx-msg,.bx-dot,.bx-btn.pulse{animation:none}}
  /* ---- Anuncio del admin estilo GTA ---- */
  #bx-gta{position:fixed;top:18px;left:50%;transform:translate(-50%,-180%);z-index:100000;width:min(660px,94vw);pointer-events:none;transition:transform .45s cubic-bezier(.2,1.25,.3,1)}
  #bx-gta.show{transform:translate(-50%,0)}
  .bx-gta-box{position:relative;background:linear-gradient(180deg,rgba(0,0,0,.94),rgba(22,22,22,.94));border:2px solid #F5C518;border-left-width:12px;padding:12px 20px 16px;box-shadow:0 12px 44px rgba(0,0,0,.75),inset 0 0 0 1px rgba(255,255,255,.06);clip-path:polygon(0 0,100% 0,100% calc(100% - 16px),calc(100% - 16px) 100%,0 100%)}
  .bx-gta-tag{display:flex;justify-content:space-between;align-items:center;font:800 12px/1 'Plus Jakarta Sans',system-ui,sans-serif;letter-spacing:.28em;color:#F5C518;text-transform:uppercase}
  .bx-gta-msg{margin-top:9px;font:900 clamp(20px,4.4vw,32px)/1.08 Impact,'Arial Black','Haettenschweiler',sans-serif;color:#fff;text-transform:uppercase;letter-spacing:.02em;text-shadow:2px 2px 0 #000,-1px -1px 0 #000,0 0 22px rgba(245,197,24,.35);word-break:break-word}
  .bx-gta-bar{position:absolute;left:0;right:16px;bottom:0;height:5px;background:#F5C518;transform-origin:left;animation:bx-gta-time 7s linear forwards}
  @keyframes bx-gta-time{from{transform:scaleX(1)}to{transform:scaleX(0)}}
  @media (prefers-reduced-motion:reduce){#bx-gta{transition:none}}
  @media (max-width:900px){
    .bx-btn{right:12px;bottom:calc(88px + env(safe-area-inset-bottom))}
    .bx-panel{right:0;left:0;bottom:0;width:auto;height:min(82vh,640px);border-radius:18px 18px 0 0}
  }`;

  /* ---------------- Estructura ---------------- */
  function build() {
    const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    const root = document.createElement("div"); root.id = "bx-root";
    root.innerHTML = `
      <button class="bx-btn" id="bx-btn" type="button" aria-label="Abrir chat y puntos">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/></svg>
        <span class="bx-pts" id="bx-badge" hidden>0</span>
        <span class="bx-unread" id="bx-unread" hidden>0</span>
      </button>
      <section class="bx-panel" id="bx-panel" role="dialog" aria-label="Comunidad Donatelos" hidden></section>`;
    document.body.appendChild(root);
    document.body.insertAdjacentHTML("beforeend", `<div id="bx-rain" aria-hidden="true"></div>
      <div id="bx-gta" role="alert" aria-live="assertive"><div class="bx-gta-box"><div class="bx-gta-tag"><span>★ Anuncio importante</span><span class="bx-gta-time"></span></div><div class="bx-gta-msg"></div><div class="bx-gta-bar"></div></div></div>`);
    $("bx-btn").addEventListener("click", toggle);
    $("bx-panel").addEventListener("click", onClick);
    $("bx-panel").addEventListener("change", e => {
      if (e.target.id === "bx-league") { S.league = e.target.value; S.events = null; S.slip = null; renderPanel(); loadEvents(); }
    });
    $("bx-panel").addEventListener("keydown", e => {
      if (e.key === "Enter" && e.target.id === "bx-text") { e.preventDefault(); act("send"); }
    });
    $("bx-panel").addEventListener("input", e => { if (e.target.id === "bx-text") sendTyping(); });
    $("bx-panel").addEventListener("scroll", e => {
      if (e.target.id === "bx-msgs" && e.target.scrollHeight - e.target.scrollTop - e.target.clientHeight < 90) { CH.newBelow = 0; hideDown(); }
    }, true);
    window.addEventListener("keydown", e => {
      if (e.key === "Escape" && S.open) { e.stopImmediatePropagation(); e.preventDefault(); toggle(); }
    }, true);
    updateBadge();
    startBxOddsFluctuation();
  }

  function updateBadge() {
    const b = $("bx-badge"); if (!b) return;
    b.hidden = !S.player; b.textContent = "⭐" + S.points;
    document.querySelectorAll(".bx-points-val").forEach(n => n.textContent = S.points);
    const t = $("bx-today"); if (t) t.textContent = S.earnedToday;
    const bar = $("bx-bar-i"); if (bar) bar.style.width = Math.min(100, S.earnedToday / BX.DAILY_CAP * 100) + "%";
    const w = $("bx-watch"); if (w) w.textContent = S.watching ? "✅ Sumando puntos ahora" : "▶ Abre un canal y dale play para sumar";
  }
  function notice(msg, type) {
    S.notice = msg; S.noticeType = type || "ok";
    const n = $("bx-notice"); if (n) { n.textContent = msg; n.className = S.noticeType; }
    clearTimeout(notice.t); if (msg) notice.t = setTimeout(() => notice("", "ok"), 6000);
  }

  function toggle() {
    S.open = !S.open;
    $("bx-panel").hidden = !S.open;
    if (S.open) { onOpen(); } else { updateUnread(); }
  }
  async function onOpen() {
    renderPanel();
    if (S.player && sb) {
      try {
        const p = await rpc("get_player", { p_device: DEV });
        if (!p) { S.player = null; lsSet("donatelos_player", "null"); }
        else if (p.banned) { notice("Tu cuenta está suspendida.", "err"); }
        else { S.points = p.points; S.earnedToday = p.earned_today || 0; }
      } catch (e) {}
      renderPanel();
    }
    enterTab();
  }

  /* ---------------- Pestañas ---------------- */
  const TABS = [["chat", "Chat"], ["puntos", "Puntos"], ["premios", "Premios"], ["apuestas", "Apuestas"]];
  function renderPanel() {
    const p = $("bx-panel"); if (!p) return;
    const onb = !S.player || S.editing;
    const head = `<div class="bx-head"><h3>Comunidad Donatelos</h3>${S.player ? `<span class="bx-chip">⭐ <span class="bx-points-val">${S.points}</span></span>` : ""}<button class="bx-x" data-act="close" aria-label="Cerrar">✕</button></div>`;
    const tabs = !onb ? `<div class="bx-tabs" role="tablist">${TABS.map(([k, t]) => `<button role="tab" class="${S.tab === k ? "on" : ""}" aria-selected="${S.tab === k}" data-act="tab" data-tab="${k}">${t}</button>`).join("")}</div>` : "";
    const body = onb ? bodyOnboarding() : S.tab === "chat" ? bodyChat() : S.tab === "puntos" ? bodyPuntos() : S.tab === "premios" ? bodyPremios() : bodyApuestas();
    p.innerHTML = head + tabs + `<div class="bx-body">${body}<p id="bx-notice" class="${S.noticeType}">${esc(S.notice)}</p></div>`;
    afterRender();
  }
  function afterRender() {
    const m = $("bx-msgs"); if (m) m.scrollTop = m.scrollHeight;
    updateBadge(); renderTyping(); updateUnread(); updateConn();
  }
  function enterTab() {
    if (!S.player) return;
    if (S.tab === "chat") { loadChat(); }
    if (S.tab === "puntos") loadTop();
    if (S.tab === "premios") loadRewards();
    if (S.tab === "apuestas" && S.adult) { if (S.events === null) loadEvents(); loadBets(); }
  }

  function bodyOnboarding() {
    const nick = S.player ? S.player.nickname : "";
    return `<div class="bx-bot">¡Hola! 👋 Elige un apodo y tu país para entrar al chat, sumar puntos por ver los canales y canjearlos por premios.</div>
      <input id="bx-nick" class="bx-in" maxlength="20" placeholder="Tu apodo" value="${esc(nick)}" autocomplete="nickname" aria-label="Tu apodo">
      <select id="bx-country" class="bx-sel" aria-label="Tu país">${BX.COUNTRIES.map(c => `<option value="${esc(c)}">${BX.FLAGS[c]} ${esc(c)}</option>`).join("")}</select>
      <button class="bx-primary" data-act="register">Entrar</button>
      <p class="bx-small">Solo guardamos tu apodo, país y puntos. No pedimos correo ni contraseña.</p>`;
  }
  function bodyPuntos() {
    const top = S.top === null ? '<p class="bx-small">Cargando ranking…</p>' : S.top.length ? S.top.map((t, i) => `<div class="bx-rank"><span>${i + 1}. ${esc(t.nickname)} <small>${esc(BX.FLAGS[t.country] || "")}</small></span><b>⭐ ${t.points}</b></div>`).join("") : '<p class="bx-small">Aún no hay jugadores en el ranking.</p>';
    return `<div class="bx-big"><span class="bx-points-val">${S.points}</span><small>puntos</small></div>
      <div class="bx-card"><p>Ganas <b>1 punto por cada minuto</b> viendo un canal (máx. ${BX.DAILY_CAP} al día). Hoy: <b id="bx-today">${S.earnedToday}</b>/${BX.DAILY_CAP}</p>
      <div class="bx-bar"><i id="bx-bar-i" style="width:${Math.min(100, S.earnedToday / BX.DAILY_CAP * 100)}%"></i></div>
      <p id="bx-watch">${S.watching ? "✅ Sumando puntos ahora" : "▶ Abre un canal y dale play para sumar"}</p></div>
      <h4>🏆 Ranking</h4><div>${top}</div>`;
  }
  function bodyPremios() {
    if (S.rewards === null) return '<p class="bx-small">Cargando premios…</p>';
    if (S.redeemFor) {
      const r = S.redeemFor;
      return `<div class="bx-card"><h4>Canjear: ${esc(r.name)}</h4><p>Costo: ⭐ ${r.cost}. Escribe cómo contactarte (Telegram o WhatsApp) para entregarte el premio.</p>
        <input id="bx-contact" class="bx-in" maxlength="80" placeholder="@usuario o número" aria-label="Contacto">
        <div class="bx-row"><button class="bx-ghost" data-act="redeem-cancel">Cancelar</button><button class="bx-primary" data-act="redeem-confirm" style="flex:1">Confirmar canje</button></div></div>`;
    }
    if (!S.rewards.length) return '<div class="bx-bot">Todavía no hay premios publicados. ¡Sigue sumando puntos, pronto habrá novedades!</div>';
    return S.rewards.map(r => {
      const out = r.stock !== null && r.stock <= 0, short = S.points < r.cost;
      return `<div class="bx-card"><h4>${esc(r.name)}</h4>${r.description ? `<p>${esc(r.description)}</p>` : ""}
        <p><b>⭐ ${r.cost}</b>${r.stock !== null ? ` · quedan ${r.stock}` : ""}</p>
        <button class="bx-primary" data-act="redeem" data-id="${r.id}" ${out || short ? "disabled" : ""}>${out ? "Agotado" : short ? `Te faltan ${r.cost - S.points}` : "Canjear"}</button></div>`;
    }).join("");
  }
  function bodyApuestas() {
    if (S.adult === null) return `<div class="bx-card"><h4>🔞 Solo para mayores de 18 años</h4>
      <p>En esta sección apuestas con <b>puntos virtuales</b>. Los puntos se ganan viendo canales y no se pueden comprar. Juega con responsabilidad.</p>
      <button class="bx-primary" data-act="adult-yes">Tengo 18 años o más</button><button class="bx-ghost" data-act="adult-no">Soy menor de edad</button></div>`;
    if (S.adult === false) return '<div class="bx-bot">Esta sección es solo para mayores de edad. Puedes seguir usando el chat, los puntos y los premios.</div>';
    
    const slip = S.slip ? slipHTML() : "";
    
    const ev = S.events === null ? '<p class="bx-small">Cargando partidos…</p>' : S.evErr ? `<p class="bx-small">${esc(S.evErr)}</p>` : !S.events.length ? '<p class="bx-small">No hay partidos en vivo ni próximos en esta liga. Prueba con otra.</p>'
      : S.events.map((e, i) => {
        const isLive = e.state === "in";
        const matchTimeOrMinute = isLive 
          ? `<span style="color: #ff4757; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">
               <span style="width: 6px; height: 6px; background-color: #ff4757; border-radius: 50%; display: inline-block;"></span> 
               EN VIVO ${e.detail ? `(${e.detail})` : ''}
             </span>`
          : `<span class="bx-meta">${esc(fmtTime(e.ms))}</span>`;

        const scoreOrVs = isLive
          ? `<span style="background: rgba(255, 71, 87, 0.15); color: #ff4757; padding: 2px 8px; border-radius: 6px; font-weight: 700; font-size: 13px;">${e.homeScore} - ${e.awayScore}</span>`
          : `<span class="bx-meta" style="font-size: 11px;">vs</span>`;

        return `
        <div class="bx-card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            ${matchTimeOrMinute}
          </div>
          <div class="bx-teams" style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 6px 0;">
            <div style="display: flex; align-items: center; gap: 6px; flex: 1;">
              ${e.homeLogo ? `<img src="${esc(e.homeLogo)}" width="22" height="22" style="object-fit: contain;" alt="">` : ""}
              <span style="font-size: 13px; font-weight: 700;">${esc(e.home)}</span>
            </div>
            <div style="margin: 0 4px; text-align: center;">
              ${scoreOrVs}
            </div>
            <div style="display: flex; align-items: center; gap: 6px; flex: 1; justify-content: flex-end; text-align: right;">
              <span style="font-size: 13px; font-weight: 700;">${esc(e.away)}</span>
              ${e.awayLogo ? `<img src="${esc(e.awayLogo)}" width="22" height="22" style="object-fit: contain;" alt="">` : ""}
            </div>
          </div>
          <div class="bx-picks">
            ${["home", "draw", "away"].map(k => {
              const oddVal = k === "home" ? e.homeOdds : k === "draw" ? e.drawOdds : e.awayOdds;
              return `
              <button data-act="pick" data-i="${i}" data-pick="${k}" class="${S.slip && S.slip.i === i && S.slip.pick === k ? "on" : ""}">
                ${k === "home" ? "Local" : k === "draw" ? "Empate" : "Visitante"}
                <small class="bx-dynamic-odd">${oddVal}x</small>
              </button>
            `;}).join("")}
          </div>
        </div>
      `;
      }).join("");

    const bets = S.bets === null ? "" : S.bets.length ? `<h4>Mis apuestas</h4>${S.bets.map(b => `<div class="bx-rank"><span>${esc(b.match_label)}<br><small class="bx-meta">${pickName(b)} · ⭐ ${b.stake}</small></span><b class="bx-st-${b.status}">${statusText(b)}</b></div>`).join("")}` : "";
    
    return `${slip}<select id="bx-league" class="bx-sel" aria-label="Liga">${BX.LEAGUES.map(l => `<option value="${l.slug}" ${l.slug === S.league ? "selected" : ""}>${esc(l.name)}</option>`).join("")}</select>${ev}${bets}
      <p class="bx-small">Apuestas con puntos virtuales: no hay dinero ni se compran puntos. Cuotas dinámicas basadas en favoritos y marcador en vivo. Cierran 10 min antes del partido. El resultado es el final según ESPN (incluye prórroga, sin penales). +18 · Juega con responsabilidad.</p>`;
  }

  function slipHTML() {
    const s = S.slip, e = S.events[s.i];
    const currentOdds = parseFloat(s.pick === "home" ? e.homeOdds : s.pick === "draw" ? e.drawOdds : e.awayOdds);
    const win = Math.floor(s.stake * currentOdds);
    const who = s.pick === "home" ? e.home : s.pick === "away" ? e.away : "Empate";
    return `<div class="bx-card" style="border-color:#6D4AFF"><h4>Tu apuesta: ${esc(who)} (${currentOdds}x)</h4><p>${esc(e.home)} vs ${esc(e.away)}</p>
      <div class="bx-row" style="flex-wrap: wrap;">${BX.STAKES.map(v => `<button class="bx-ghost" style="flex:1;min-width:45px;padding:0 4px;${s.stake === v ? "border-color:#6D4AFF" : ""}" data-act="stake" data-v="${v}">${v}</button>`).join("")}</div>
      <input id="bx-stake" class="bx-in" type="number" min="5" max="5000" value="${s.stake}" aria-label="Puntos a apostar">
      <p>Si aciertas ganas <b>⭐ <span id="bx-win-preview">${win}</span></b>. Tienes ⭐ ${S.points}.</p>
      <div class="bx-row"><button class="bx-ghost" data-act="slip-cancel">Cancelar</button><button class="bx-primary" style="flex:1" data-act="slip-confirm">Apostar</button></div></div>`;
  }
  const pickName = b => b.pick === "home" ? "Local" : b.pick === "away" ? "Visitante" : "Empate";
  const statusText = b => b.status === "abierta" ? "En juego" : b.status === "ganada" ? `+${b.payout}` : b.status === "perdida" ? "Perdida" : "Devuelta";
  function fmtTime(ms) {
    const d = new Date(ms), t = d.toLocaleTimeString("es", { hour: "numeric", minute: "2-digit" });
    const z = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((z(d) - z(new Date())) / 864e5);
    return (diff === 0 ? "Hoy" : diff === 1 ? "Mañana" : d.toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" })) + " " + t;
  }

  /* ---------------- Simulación de fluctuación de cuotas (Estilo Casa de Apuestas) ---------------- */
  function startBxOddsFluctuation() {
    if (window.bxOddsIntervalStarted) return;
    window.bxOddsIntervalStarted = true;
    setInterval(() => {
      const oddElements = document.querySelectorAll('.bx-dynamic-odd');
      if (oddElements.length === 0) return;
      
      const randomElement = oddElements[Math.floor(Math.random() * oddElements.length)];
      let textVal = randomElement.textContent.replace('x', '');
      let val = parseFloat(textVal);
      if (isNaN(val)) return;

      const fluctuation = (Math.random() * 0.1 - 0.05).toFixed(2);
      let newVal = (val + parseFloat(fluctuation)).toFixed(2);
      if (newVal < 1.05) newVal = "1.05";

      if (newVal > val) {
        randomElement.style.color = "#4ade80"; // Sube: Verde
        randomElement.textContent = newVal + "x";
        setTimeout(() => { randomElement.style.color = "#ffc94d"; }, 1200);
      } else if (newVal < val) {
        randomElement.style.color = "#f87171"; // Baja: Rojo
        randomElement.textContent = newVal + "x";
        setTimeout(() => { randomElement.style.color = "#ffc94d"; }, 1200);
      }
    }, 3000);
  }

  /* ---------------- Acciones ---------------- */
  function onClick(e) {
    const el = e.target.closest("[data-act]"); if (!el) return;
    act(el.dataset.act, el);
  }
  async function act(a, el) {
    try {
      if (chatAct(a, el)) return;
      if (a === "close") { toggle(); }
      else if (a === "tab") { S.tab = el.dataset.tab; S.redeemFor = null; renderPanel(); enterTab(); }
      else if (a === "register") {
        const nick = ($("bx-nick").value || "").trim(), country = $("bx-country").value;
        const p = await rpc("register_player", { p_device: DEV, p_nick: nick, p_country: country });
        if (p.banned) throw new Error("Tu cuenta está suspendida.");
        S.player = { nickname: p.nickname, country: p.country }; S.points = p.points; S.editing = false;
        lsSet("donatelos_player", JSON.stringify(S.player)); S.tab = "chat"; renderPanel(); enterTab();
      }
      else if (a === "edit-profile") { S.editing = true; renderPanel(); $("bx-country").value = S.player.country; }
      else if (a === "send") { await sendChat(); }
      else if (a === "redeem") { S.redeemFor = S.rewards.find(r => String(r.id) === el.dataset.id); renderPanel(); }
      else if (a === "redeem-cancel") { S.redeemFor = null; renderPanel(); }
      else if (a === "redeem-confirm") {
        const r = S.redeemFor, d = await rpc("redeem_reward", { p_device: DEV, p_reward: r.id, p_contact: $("bx-contact").value });
        S.points = d.points; S.redeemFor = null; S.rewards = null; renderPanel(); loadRewards();
        notice("¡Canje enviado! Te contactaremos para entregarte tu premio.", "ok");
      }
      else if (a === "adult-yes") { S.adult = true; lsSet("donatelos_18", "1"); renderPanel(); enterTab(); }
      else if (a === "adult-no") { S.adult = false; lsSet("donatelos_18", "0"); renderPanel(); }
      else if (a === "pick") { S.slip = { i: +el.dataset.i, pick: el.dataset.pick, stake: (S.slip && S.slip.stake) || BX.STAKES[0] }; renderPanel(); }
      else if (a === "stake") { S.slip.stake = +el.dataset.v; renderPanel(); }
      else if (a === "slip-cancel") { S.slip = null; renderPanel(); }
      else if (a === "slip-confirm") {
        const e2 = S.events[S.slip.i], stake = parseInt($("bx-stake").value, 10) || 0;
        const d = await rpc("place_bet", { p_device: DEV, p_league: S.league, p_match_id: e2.id, p_label: `${e2.home} vs ${e2.away}`, p_kickoff: e2.date, p_pick: S.slip.pick, p_stake: stake });
        S.points = d.points; S.slip = null; S.bets = null; renderPanel(); loadBets();
        notice("¡Apuesta registrada! Suerte 🍀", "ok");
      }
    } catch (err) { notice(err.message, "err"); }
  }

  /* ---------------- Datos ---------------- */
  async function loadTop() { try { S.top = await rpc("top_players"); } catch (e) { S.top = []; } if (S.tab === "puntos") renderPanel(); }
  async function loadRewards() {
    try {
      const { data, error } = await sb.from("rewards").select("id,name,description,cost,stock").eq("active", true).order("cost");
      if (error) throw error; S.rewards = data || [];
    } catch (e) { S.rewards = []; }
    if (S.tab === "premios" && !S.redeemFor) renderPanel();
  }
  async function loadBets() { try { S.bets = await rpc("my_bets", { p_device: DEV }) || []; } catch (e) { S.bets = []; } if (S.tab === "apuestas") renderPanel(); }

  async function loadEvents() {
    S.evErr = ""; const slug = S.league;
    try {
      const r = await fetch(BX.getScoreboardUrl(slug));
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      S.events = (j.events || []).map(e => {
        const c = (e.competitions && e.competitions[0]) || {}, comp = c.competitors || [];
        const h = comp.find(x => x.homeAway === "home"), v = comp.find(x => x.homeAway === "away");
        if (!h || !v) return null;
        
        const homeLogo = (h.team && (h.team.logo || (h.team.logos && h.team.logos[0] && h.team.logos[0].href))) || "";
        const awayLogo = (v.team && (v.team.logo || (v.team.logos && v.team.logos[0] && v.team.logos[0].href))) || "";
        const state = (e.status && e.status.type && e.status.type.state) || ""; // "pre", "in", "post"
        const homeScore = h.score || "0";
        const awayScore = v.score || "0";
        const detail = (e.status && e.status.type && e.status.type.detail) || "";

        // Cuotas realistas basadas en favoritos y marcador en vivo
        const homeScoreNum = parseInt(homeScore) || 0;
        const awayScoreNum = parseInt(awayScore) || 0;
        const seed = parseInt(e.id) || Math.floor(Math.random() * 1000);
        const r1 = ((seed * 9301 + 49297) % 233280) / 233280;

        let homeOdds, drawOdds, awayOdds;

        if (state === "in") {
          if (homeScoreNum > awayScoreNum) {
            homeOdds = (1.15 + (r1 * 0.25)).toFixed(2);
            drawOdds = (4.50 + (r1 * 3.00)).toFixed(2);
            awayOdds = (6.00 + (r1 * 9.00)).toFixed(2);
          } else if (awayScoreNum > homeScoreNum) {
            homeOdds = (6.00 + (r1 * 9.00)).toFixed(2);
            drawOdds = (4.50 + (r1 * 3.00)).toFixed(2);
            awayOdds = (1.15 + (r1 * 0.25)).toFixed(2);
          } else {
            homeOdds = (2.20 + (r1 * 0.80)).toFixed(2);
            drawOdds = (2.40 + (r1 * 0.60)).toFixed(2);
            awayOdds = (2.20 + (r1 * 0.80)).toFixed(2);
          }
        } else {
          if (r1 > 0.5) {
            homeOdds = (1.65 + (r1 * 0.55)).toFixed(2);
            drawOdds = (3.30 + (r1 * 0.50)).toFixed(2);
            awayOdds = (2.40 + (r1 * 1.60)).toFixed(2);
          } else {
            homeOdds = (2.40 + (r1 * 1.60)).toFixed(2);
            drawOdds = (3.30 + (r1 * 0.50)).toFixed(2);
            awayOdds = (1.65 + (r1 * 0.55)).toFixed(2);
          }
        }

        return { 
          id: String(e.id), 
          date: e.date, 
          ms: Date.parse(e.date), 
          state: state,
          home: (h.team && (h.team.displayName || h.team.name)) || "Local", 
          homeLogo,
          homeScore,
          homeOdds,
          away: (v.team && (v.team.displayName || v.team.name)) || "Visitante",
          awayLogo,
          awayScore,
          awayOdds,
          drawOdds,
          detail
        };
      }).filter(x => {
        if (!x) return false;
        if (x.state === "in") return true; // Mostrar partidos en juego
        if (x.state === "pre" && x.ms > Date.now() + 10 * 60 * 1000) return true; // Próximos
        return false;
      }).sort((x, y) => {
        // Poner los partidos en vivo primero, luego los próximos por hora
        if (x.state === "in" && y.state !== "in") return -1;
        if (y.state === "in" && x.state !== "in") return 1;
        return x.ms - y.ms;
      }).slice(0, 30);
    } catch (e) { 
      S.events = []; 
      console.error("Error detallado en loadEvents:", e); 
      S.evErr = "No se pudieron cargar los partidos ahora. Inténtalo más tarde."; 
    }
    if (slug === S.league && S.tab === "apuestas") renderPanel();
  }

  /* ---------------- Puntos por ver ---------------- */
  let lastCur = null, acc = 0;
  function tick() {
    const v = $("video"), pv = $("player-view");
    const isOpen = pv && pv.classList.contains("open");
    const playing = !!(v && isOpen && !v.paused && !v.ended && v.readyState >= 3 && document.visibilityState === "visible");
    const cur = v ? v.currentTime : 0;
    let adv = false;
    if (playing && lastCur !== null) { const dt = cur - lastCur, step = BX.TICK_MS / 1000; adv = dt >= step * 0.5 && dt <= step * 2; }
    lastCur = playing ? cur : null;
    const was = S.watching; S.watching = !!(S.player && adv);
    if (was !== S.watching) updateBadge();
    if (!S.player) return;
    if (adv) acc += BX.TICK_MS / 1000;
    if (acc >= BX.BEAT_S) { acc = 0; beat(); }
  }
  async function beat() {
    try {
      const d = await rpc("heartbeat", { p_device: DEV });
      if (d) { S.points = d.points; S.earnedToday = d.earned_today; updateBadge(); }
    } catch (e) {}
  }


  /* =====================================================================
     CHAT MEJORADO: tiempo real, "está escribiendo", lluvia de emojis,
     reacciones rápidas, menciones y anuncios estilo GTA
     ===================================================================== */
  const RAIN_EMOJIS = ["⚽", "🔥", "🎉", "❤️", "👏", "😂", "🏆", "💪"];
  const QUICK = ["🔥", "⚽", "👏", "😂", "😮", "💔"];
  const PICKER = ["😀", "😁", "😂", "🤣", "😊", "😍", "😎", "🤩", "😮", "😢", "😡", "🤯", "🥳", "🙌", "👏", "👍", "👎", "🙏", "💪", "🔥", "⚽", "🏆", "🥅", "🎉", "🎊", "❤️", "💙", "💛", "💚", "💜", "🧡", "💔", "🤝", "👀", "😅", "😬", "🤔", "😴", "😤", "🤦‍♂️"];
  const GTA_SOUND = "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3";
  const CH = { seen: new Set(), lastId: 0, baseId: null, rt: null, rtAll: false, ok: false, typing: {}, unread: 0,
    lastTypingSent: 0, lastRainSent: 0, lastRainRx: 0, fx: lsGet("donatelos_fx") !== "0", picker: false, rainMenu: false,
    gtaQ: [], gtaBusy: false, newBelow: 0, fetching: false };
  let EMOJI_ONLY = null, AT_RE;
  try { EMOJI_ONLY = new RegExp("^(?:\\p{Extended_Pictographic}|\\uFE0F|\\u200D|\\s){1,8}$", "u"); } catch (e) {}
  try { AT_RE = new RegExp("@([\\p{L}\\p{N}_]{2,20})", "gu"); } catch (e) { AT_RE = /@(\w{2,20})/g; }

  const hueOf = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const isMine = m => !!(S.player && m.nickname === S.player.nickname && m.country === S.player.country);
  const isAdminMsg = m => !!(m.is_admin || /ADMINISTRADOR/.test(m.nickname || ""));
  function fmtMsg(text) {
    return esc(text).replace(AT_RE, (all, n) => {
      const me = S.player && n.toLowerCase() === S.player.nickname.toLowerCase();
      return `<span class="bx-at${me ? " bx-me" : ""}">@${n}</span>`;
    });
  }
  function msgHTML(m, prev) {
    const mine = isMine(m), adm = isAdminMsg(m);
    const t = m.created_at ? new Date(m.created_at) : new Date();
    const time = t.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const group = !!(prev && prev.nickname === m.nickname && prev.country === m.country && !!prev.is_admin === !!m.is_admin && m.created_at && prev.created_at && (Date.parse(m.created_at) - Date.parse(prev.created_at)) < 120000);
    const jumbo = EMOJI_ONLY && EMOJI_ONLY.test(m.message || "");
    const ment = S.player && (m.message || "").toLowerCase().includes("@" + S.player.nickname.toLowerCase());
    const av = mine ? "" : `<span class="bx-av${group ? " sp" : ""}" style="--h:${hueOf(m.nickname)}">${esc((m.nickname || "?").trim().charAt(0).toUpperCase())}</span>`;
    const who = (group || mine) ? "" : adm
      ? `<div class="bx-who"><b>📢 ${esc(m.nickname)}</b><time>${esc(time)}</time></div>`
      : `<div class="bx-who"><a data-act="mention" data-nick="${esc(m.nickname)}" title="Mencionar">${esc(m.nickname)}</a><i>${esc(flag(m.country))}</i><time>${esc(time)}</time></div>`;
    return `<div class="bx-msg${mine ? " mine" : ""}${adm ? " adm" : ""}${group ? " grp" : ""}${ment ? " ment" : ""}">${av}<div class="bx-bub">${who}<div class="bx-txt${jumbo ? " jumbo" : ""}">${fmtMsg(m.message)}</div>${mine ? `<time class="bx-t-r">${esc(time)}</time>` : ""}</div></div>`;
  }
  function bodyChat() {
    const list = S.msgs.map((m, i) => msgHTML(m, S.msgs[i - 1])).join("") || '<p class="bx-small" id="bx-empty">Cargando mensajes…</p>';
    return `<div class="bx-chatwrap">
      <div class="bx-chead"><span class="bx-dot${CH.ok ? " on" : ""}" id="bx-dot"></span><span id="bx-conn">${CH.ok ? "En vivo" : "Conectando…"}</span>
        <button class="bx-fx" data-act="fx-toggle" id="bx-fx" aria-pressed="${CH.fx}" title="Activar o quitar la lluvia de emojis">${CH.fx ? "🎉 Efectos" : "🔇 Sin efectos"}</button></div>
      <div class="bx-msgwrap"><div class="bx-chatbox" id="bx-msgs" aria-live="polite">${list}</div>
        <button class="bx-down" id="bx-down" data-act="scroll-bottom" hidden>↓ <span id="bx-downn">0</span> nuevos</button></div>
      <div class="bx-typing" id="bx-typing" aria-live="polite"></div>
      <div class="bx-quick">${QUICK.map(e => `<button data-act="quick" data-e="${e}" aria-label="Enviar ${e}">${e}</button>`).join("")}</div>
      <div class="bx-pop" id="bx-picker" ${CH.picker ? "" : "hidden"}>${PICKER.map(e => `<button data-act="emoji-add" data-e="${e}" aria-label="${e}">${e}</button>`).join("")}</div>
      <div class="bx-pop bx-rainmenu" id="bx-rainmenu" ${CH.rainMenu ? "" : "hidden"}><span>Lluvia de…</span>${RAIN_EMOJIS.map(e => `<button data-act="rain" data-e="${e}" aria-label="Lluvia de ${e}">${e}</button>`).join("")}</div>
      <div class="bx-composer">
        <button class="bx-ico" data-act="emoji-toggle" aria-label="Elegir emoji">😊</button>
        <input id="bx-text" class="bx-in" maxlength="200" placeholder="Escribe un mensaje…" aria-label="Mensaje" autocomplete="off">
        <button class="bx-ico" data-act="rain-toggle" aria-label="Lanzar lluvia de emojis">🌧️</button>
        <button class="bx-send" data-act="send" aria-label="Enviar">➤</button></div>
      <p class="bx-small">Escribes como <b>${esc(S.player.nickname)}</b> (${esc(flag(S.player.country))}) · <a data-act="edit-profile">Cambiar</a> · Toca un nombre para mencionarlo. Sin enlaces ni insultos.</p></div>`;
  }

  /* ---------- Envío y acciones del chat ---------- */
  async function sendChat(forced) {
    const inp = $("bx-text"), txt = (forced || (inp ? inp.value : "") || "").trim();
    if (!txt) return;
    if (!forced && inp) inp.value = "";
    try {
      await rpc("send_chat", { p_device: DEV, p_message: txt });
      CH.picker = false; syncPops(); fetchNew();   // tu mensaje aparece al instante
    } catch (err) { if (!forced && inp) inp.value = txt; notice(err.message, "err"); }
  }
  function syncPops() {
    const p = $("bx-picker"), r = $("bx-rainmenu");
    if (p) p.hidden = !CH.picker; if (r) r.hidden = !CH.rainMenu;
  }
  function chatAct(a, el) {
    switch (a) {
      case "emoji-toggle": CH.picker = !CH.picker; CH.rainMenu = false; syncPops(); return true;
      case "rain-toggle": CH.rainMenu = !CH.rainMenu; CH.picker = false; syncPops(); return true;
      case "emoji-add": { const i = $("bx-text"); if (i) { i.value = (i.value + el.dataset.e).slice(0, 200); i.focus(); sendTyping(); } return true; }
      case "quick": sendChat(el.dataset.e); return true;
      case "rain": sendRain(el.dataset.e); CH.rainMenu = false; syncPops(); return true;
      case "mention": { const i = $("bx-text"); if (i) { i.value = (i.value + "@" + el.dataset.nick + " ").slice(0, 200); i.focus(); } return true; }
      case "fx-toggle": { CH.fx = !CH.fx; lsSet("donatelos_fx", CH.fx ? "1" : "0"); const b = $("bx-fx"); if (b) { b.textContent = CH.fx ? "🎉 Efectos" : "🔇 Sin efectos"; b.setAttribute("aria-pressed", CH.fx); } return true; }
      case "scroll-bottom": { const m = $("bx-msgs"); if (m) m.scrollTop = m.scrollHeight; CH.newBelow = 0; hideDown(); return true; }
    }
    return false;
  }
  function showDown() { const d = $("bx-down"), n = $("bx-downn"); if (d && n) { n.textContent = CH.newBelow; d.hidden = false; } }
  function hideDown() { const d = $("bx-down"); if (d) d.hidden = true; }

  /* ---------- "Está escribiendo…" (broadcast, no guarda nada) ---------- */
  function sendTyping() {
    if (!S.player || !CH.ok || !CH.rt) return;
    const now = Date.now(); if (now - CH.lastTypingSent < 2500) return;
    CH.lastTypingSent = now;
    try { CH.rt.send({ type: "broadcast", event: "typing", payload: { nick: S.player.nickname } }); } catch (e) {}
  }
  function onTyping(p) {
    if (!p || typeof p.nick !== "string" || !S.player || p.nick === S.player.nickname) return;
    CH.typing[p.nick.slice(0, 20)] = Date.now() + 3500; renderTyping();
  }
  function renderTyping() {
    const now = Date.now();
    Object.keys(CH.typing).forEach(n => { if (CH.typing[n] <= now) delete CH.typing[n]; });
    const el = $("bx-typing"); if (!el) return;
    const names = Object.keys(CH.typing);
    if (!names.length) { if (el.firstChild) el.textContent = ""; return; }
    const txt = names.length === 1 ? `${names[0]} está escribiendo` : names.length === 2 ? `${names[0]} y ${names[1]} están escribiendo` : `${names[0]} y ${names.length - 1} más están escribiendo`;
    if (!el.querySelector(".d")) el.innerHTML = '<span class="d"><i></i><i></i><i></i></span><span class="t"></span>';
    el.querySelector(".t").textContent = txt + "…";
  }

  /* ---------- Lluvia de emojis ---------- */
  function rainFx(emoji, label) {
    if (!CH.fx) return;
    const lbl = document.createElement("div"); lbl.className = "bx-rainlbl"; lbl.textContent = label;
    document.body.appendChild(lbl); setTimeout(() => lbl.remove(), 3500);
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const layer = $("bx-rain"); if (!layer) return;
    const n = Math.min(36, Math.max(18, Math.floor(innerWidth / 38)));
    for (let i = 0; i < n; i++) {
      const d = document.createElement("span"); d.className = "bx-drop"; d.textContent = emoji;
      const dur = 2.6 + Math.random() * 2.4, delay = Math.random() * 1.2;
      d.style.cssText = `left:${Math.random() * 100}%;font-size:${20 + Math.random() * 26}px;animation-duration:${dur}s;animation-delay:${delay}s;--sw:${(Math.random() * 120 - 60) | 0}px;--rot:${(Math.random() * 360 - 180) | 0}deg`;
      layer.appendChild(d); setTimeout(() => d.remove(), (dur + delay) * 1000 + 300);
    }
  }
  function sendRain(e) {
    if (!S.player || !RAIN_EMOJIS.includes(e)) return;
    const left = 10000 - (Date.now() - CH.lastRainSent);
    if (left > 0) { notice(`Espera ${Math.ceil(left / 1000)} s para lanzar otra lluvia.`, "err"); return; }
    CH.lastRainSent = Date.now();
    if (CH.rt && CH.ok) { try { CH.rt.send({ type: "broadcast", event: "rain", payload: { emoji: e, nick: S.player.nickname } }); } catch (x) {} }
    else notice("Sin conexión en vivo: solo tú verás la lluvia.", "err");
    rainFx(e, `Lanzaste lluvia de ${e}`);
  }
  function onRain(p) {
    if (!p || !RAIN_EMOJIS.includes(p.emoji)) return;            // solo emojis permitidos
    const now = Date.now(); if (now - CH.lastRainRx < 4000) return; // anti-spam
    CH.lastRainRx = now;
    rainFx(p.emoji, `${String(p.nick || "Alguien").slice(0, 20)} lanzó lluvia de ${p.emoji}`);
  }

  /* ---------- Anuncio estilo GTA (mismo sonido y 7 s de siempre) ---------- */
  function gtaShow(text, iso) {
    CH.gtaQ.push({ text: String(text || "").replace("📢 ANUNCIO:", "").trim(), t: iso ? new Date(iso) : new Date() });
    if (!CH.gtaBusy) gtaNext();
  }
  function gtaNext() {
    const item = CH.gtaQ.shift(), el = $("bx-gta");
    if (!item || !el) { CH.gtaBusy = false; return; }
    CH.gtaBusy = true;
    el.querySelector(".bx-gta-msg").textContent = item.text;
    el.querySelector(".bx-gta-time").textContent = item.t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
    const bar = el.querySelector(".bx-gta-bar"); bar.style.animation = "none"; void bar.offsetWidth; bar.style.animation = "";
    el.classList.add("show");
    try { const audio = new Audio(GTA_SOUND); audio.volume = 0.5; audio.play().catch(() => {}); } catch (e) {}
    setTimeout(() => { el.classList.remove("show"); setTimeout(gtaNext, 600); }, 7000);
  }

  /* ---------- Tiempo real (con respaldo automático) ---------- */
  function updateConn() {
    const d = $("bx-dot"), c = $("bx-conn");
    if (d) d.className = "bx-dot" + (CH.ok ? " on" : "");
    if (c) c.textContent = CH.ok ? "En vivo" : "Reconectando…";
  }
  function updateUnread(pulse) {
    const b = $("bx-unread"); if (!b) return;
    b.hidden = !(CH.unread > 0 && !(S.open && S.tab === "chat"));
    b.textContent = CH.unread > 99 ? "99+" : CH.unread;
    if (pulse && !b.hidden) { const btn = $("bx-btn"); btn.classList.remove("pulse"); void btn.offsetWidth; btn.classList.add("pulse"); }
  }
  function ensureRealtime() {
    if (!sb || !sb.channel) return;
    const all = !!S.player;
    if (CH.rt && CH.rtAll === all) return;
    if (CH.rt && sb.removeChannel) { try { sb.removeChannel(CH.rt); } catch (e) {} }
    const cfg = { event: "INSERT", schema: "public", table: "chat_messages" };
    if (!all) cfg.filter = "is_admin=eq.true";            // sin apodo: solo anuncios del admin
    const ch = sb.channel("bx-room", { config: { broadcast: { self: false } } });
    ch.on("postgres_changes", cfg, p => onNewRow(p.new));
    ch.on("broadcast", { event: "typing" }, m => onTyping(m && m.payload));
    ch.on("broadcast", { event: "rain" }, m => onRain(m && m.payload));
    ch.subscribe(status => { CH.ok = status === "SUBSCRIBED"; updateConn(); if (CH.ok) fetchNew(); });
    CH.rt = ch; CH.rtAll = all;
  }
  async function fetchNew() {
    if (!sb || CH.fetching) return;
    CH.fetching = true;
    try {
      let q = sb.from("chat_messages").select("id,nickname,country,message,is_admin,created_at").gt("id", CH.lastId).order("id", { ascending: true }).limit(50);
      if (!S.player) q = q.eq("is_admin", true);
      const { data, error } = await q;
      if (error) throw error;
      (data || []).forEach(onNewRow);
    } catch (e) {} finally { CH.fetching = false; }
  }
  function onNewRow(m) {
    if (!m || m.id == null || CH.seen.has(m.id)) return;
    CH.seen.add(m.id); if (m.id > CH.lastId) CH.lastId = m.id;
    if (isAdminMsg(m) && (CH.baseId === null || m.id > CH.baseId)) gtaShow(m.message, m.created_at);
    if (S.player) pushMsg(m);
  }
  function pushMsg(m) {
    const prev = S.msgs[S.msgs.length - 1];
    S.msgs.push(m); if (S.msgs.length > 100) S.msgs.shift();
    delete CH.typing[m.nickname];
    const onChat = S.open && S.tab === "chat", box = $("bx-msgs");
    if (onChat && box) {
      const near = box.scrollHeight - box.scrollTop - box.clientHeight < 90, empty = $("bx-empty"); if (empty) empty.remove();
      box.insertAdjacentHTML("beforeend", msgHTML(m, prev));
      if (near || isMine(m)) box.scrollTop = box.scrollHeight; else { CH.newBelow++; showDown(); }
      renderTyping();
    }
    if (!onChat && !isMine(m)) { CH.unread++; updateUnread(true); }
  }
  async function loadChat() {
    if (!sb) { notice("El chat no está disponible ahora.", "err"); return; }
    ensureRealtime();
    try {
      const { data, error } = await sb.from("chat_messages").select("id,nickname,country,message,is_admin,created_at").order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      const rows = (data || []).reverse();
      rows.forEach(r => { CH.seen.add(r.id); if (r.id > CH.lastId) CH.lastId = r.id; });
      const ids = new Set(rows.map(r => r.id)), top = rows.length ? rows[rows.length - 1].id : 0;
      S.msgs = [...rows, ...S.msgs.filter(m => !ids.has(m.id) && m.id > top)];
      CH.unread = 0; updateUnread();
      if (S.tab === "chat" && S.open) renderPanel();
    } catch (e) { notice("No se pudo cargar el chat. ¿Ya ejecutaste schema.sql?", "err"); }
  }
  function startChatEngine() {
    if (!sb) return;
    sb.from("chat_messages").select("id").order("id", { ascending: false }).limit(1)
      .then(r => { CH.baseId = (r && r.data && r.data[0]) ? r.data[0].id : 0; if (CH.lastId < CH.baseId) CH.lastId = CH.baseId; }, () => {});
    ensureRealtime();
    setInterval(renderTyping, 1000);
    setInterval(() => { if (!CH.ok) fetchNew(); }, 4000);                                           // respaldo si falla el tiempo real
    setInterval(() => { if (CH.ok && S.player && S.open && S.tab === "chat") fetchNew(); }, 20000); // red de seguridad
  }

  function init() {
    build();
    startChatEngine();
    setInterval(tick, BX.TICK_MS);
    if (S.player && sb) rpc("get_player", { p_device: DEV }).then(p => { if (p) { S.points = p.points; S.earnedToday = p.earned_today || 0; updateBadge(); } }).catch(() => {});
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();