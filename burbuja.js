/* =====================================================================
   BURBUJA DONATELOS: chat + puntos (🟢/🔴 en tiempo real) + premios + apuestas decimales + ESPN + stickers + visor
   ===================================================================== */
(function () {
  "use strict";

  const BX = {
    TICK_MS: 5000,
    BEAT_S: 30, // Reducido a 30s para una respuesta más rápida en pruebas
    DAILY_CAP: 180,
    COUNTRIES: ["Argentina", "Bolivia", "Brasil", "Chile", "Colombia", "Ecuador", "Estados Unidos", "Guatemala", "Honduras", "México", "Panamá", "Perú", "Uruguay", "Venezuela"],
    FLAGS: { "Argentina": "🇦🇷", "Bolivia": "🇧🇴", "Brasil": "🇧🇷", "Chile": "🇨🇱", "Colombia": "🇨🇴", "Ecuador": "🇪🇨", "Estados Unidos": "🇺🇸", "Guatemala": "🇬🇹", "Honduras": "🇭🇳", "México": "🇲🇽", "Panamá": "🇵🇦", "Perú": "🇵🇪", "Uruguay": "🇺🇾", "Venezuela": "🇻🇪", "Global": "🌐" },
    ESPN: "https://site.api.espn.com/apis/site/v2/sports/soccer/",
    
    getScoreboardUrl(slug) {
      if (!slug) return "";
      if (slug.includes("nba") || slug.startsWith("basketball/")) {
        return `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard`;
      }
      return `${this.ESPN}${slug}/scoreboard`;
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
    STAKES: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000]
  };

  const ligasNuevas = [
    { name: "Bundesliga", slug: "ger.1" }, { name: "Liga Profesional Argentina", slug: "arg.1" },
    { name: "Serie A Brasil", slug: "bra.1" }, { name: "Liga de Primera Chile", slug: "chi.1" },
    { name: "MLS", slug: "usa.1" }, { name: "Ligue 1 Francia", slug: "fra.1" },
    { name: "Serie A Italia", slug: "ita.1" }, { name: "Eliteserien Noruega", slug: "nor.1" },
    { name: "Eredivisie Países Bajos", slug: "ned.1" }, { name: "Liga Portugal", slug: "por.1" },
    { name: "NBA", slug: "basketball/nba" }
  ];
  ligasNuevas.forEach(nueva => { if (!BX.LEAGUES.some(l => l.slug === nueva.slug)) BX.LEAGUES.push(nueva); });

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
    msgs: [], rewards: null, redeemFor: null, top: null, bets: null,
    editing: false, adult: lsGet("donatelos_18") === "1" ? true : lsGet("donatelos_18") === "0" ? false : null,
    league: BX.LEAGUES[0].slug, events: null, evErr: "", slip: null, watching: false, notice: "", noticeType: "ok",
    stickers: []
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
  .bx-pts{position:absolute;top:-6px;right:-6px;min-width:26px;height:22px;padding:0 6px;border-radius:11px;background:#FFC94D;color:#1A1200;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center}
  
  .bx-status-dot {display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;}
  .bx-status-dot.green {background:#22C55E;box-shadow:0 0 8px #22C55E;}
  .bx-status-dot.red {background:#EF4444;box-shadow:0 0 8px #EF4444;}

  .bx-panel{position:fixed;right:20px;bottom:20px;z-index:260;width:min(420px,calc(100vw - 24px));height:min(820px,calc(100vh - 40px));background:#12141B;color:#F2F3F7;border:1px solid #262A36;border-radius:18px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.6)}
  .bx-panel[hidden]{display:none}
  .bx-head{display:flex;align-items:center;gap:10px;padding:12px 16px;background:linear-gradient(135deg,#3B1FA8,#6D4AFF)}
  .bx-head h3{margin:0;font-size:16px;font-weight:800;flex:1}
  .bx-chip{background:rgba(255,255,255,.2);padding:4px 10px;border-radius:999px;font-size:13px;font-weight:800;white-space:nowrap}
  .bx-x{width:36px;height:36px;border:0;border-radius:50%;background:rgba(255,255,255,.18);color:#fff;font-size:16px;cursor:pointer}
  .bx-tabs{display:flex;gap:4px;padding:6px 8px;border-bottom:1px solid #262A36}
  .bx-tabs button{flex:1;min-height:38px;border:0;border-radius:10px;background:transparent;color:#A3A9B8;font-size:13px;font-weight:700;cursor:pointer}
  .bx-tabs button.on{background:#1E2230;color:#F2F3F7}
  .bx-body{flex:1;overflow-y:auto;padding:8px 12px;display:flex;flex-direction:column;gap:8px;min-height:0}
  .bx-bot{background:#1E2230;border-radius:12px;padding:12px;font-size:14px;line-height:1.45}
  .bx-in,.bx-sel{width:100%;min-height:42px;padding:0 12px;border-radius:10px;border:1px solid #262A36;background:#0E0F14;color:#F2F3F7;font-size:14px;font-family:inherit}
  .bx-primary{min-height:42px;padding:0 16px;border:0;border-radius:10px;background:#6D4AFF;color:#fff;font-weight:800;font-size:14px;cursor:pointer;font-family:inherit}
  .bx-primary[disabled]{opacity:.45;cursor:not-allowed}
  .bx-ghost{min-height:42px;padding:0 16px;border:1px solid #262A36;border-radius:10px;background:#171923;color:#F2F3F7;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit}
  .bx-row{display:flex;gap:8px}
  .bx-small{margin:0;font-size:12px;color:#A3A9B8;line-height:1.4}
  #bx-notice{margin:0;font-size:13px;font-weight:700;border-radius:10px;padding:8px 12px}
  #bx-notice.ok{background:#052E16;color:#86EFAC}#bx-notice.err{background:#450A0A;color:#FCA5A5}#bx-notice:empty{display:none}
  
  .bx-big{text-align:center}.bx-big span{font-size:48px;font-weight:800;color:#FFC94D;display:block;line-height:1}.bx-big small{color:#A3A9B8}
  .bx-bar{height:8px;border-radius:4px;background:#262A36;overflow:hidden}.bx-bar i{display:block;height:100%;background:#6D4AFF}
  .bx-card{background:#171923;border:1px solid #262A36;border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:8px}
  .bx-card h4{margin:0;font-size:14px}
  .bx-card p{margin:0;font-size:13px;color:#C9CEDA}
  .bx-rank{display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px solid #1E2230}
  .bx-picks{display:flex;gap:6px}.bx-picks button{flex:1;min-height:44px;border:1px solid #262A36;border-radius:10px;background:#0E0F14;color:#F2F3F7;font-size:12px;font-weight:700;cursor:pointer;padding:4px}
  .bx-picks button.on{background:#6D4AFF;border-color:#6D4AFF}.bx-picks small{display:block;color:#FFC94D;font-size:12px}
  .bx-teams{font-size:14px;font-weight:800}.bx-meta{font-size:12px;color:#A3A9B8}
  .bx-st-ganada{color:#86EFAC}.bx-st-perdida{color:#FCA5A5}.bx-st-anulada{color:#FFC94D}

  /* Chat y multimedia */
  .bx-chatwrap{display:flex;flex-direction:column;gap:6px;flex:1;min-height:0}
  .bx-chead{display:flex;align-items:center;gap:8px;font-size:12px;color:#A3A9B8}
  .bx-dot{width:8px;height:8px;border-radius:50%;background:#F59E0B}
  .bx-dot.on{background:#22C55E}
  .bx-msgwrap{position:relative;flex:1;min-height:0;display:flex}
  .bx-chatbox{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:4px;padding:10px;border-radius:14px;background:radial-gradient(120% 80% at 50% 0%,#1A1D2B,#0E0F14);border:1px solid #1E2230}
  .bx-msg{display:flex;gap:8px;align-items:flex-end;max-width:92%;position:relative}
  .bx-msg.mine{align-self:flex-end;flex-direction:row-reverse}
  .bx-bub{background:#1E2230;border-radius:16px 16px 16px 4px;padding:7px 11px;min-width:0;position:relative}
  .bx-msg.mine .bx-bub{background:linear-gradient(135deg,#6D4AFF,#8B5CF6);border-radius:16px 16px 4px 16px}
  .bx-who{display:flex;align-items:baseline;gap:6px;font-size:12px;margin-bottom:2px}
  .bx-who a{color:#C4B5FD;font-weight:800}
  .bx-txt{font-size:14px;line-height:1.4;word-break:break-word;color:#F2F3F7}
  
  .bx-chat-img {max-width:100%;max-height:220px;border-radius:8px;display:block;margin-top:4px;object-fit:cover;background:#000;cursor:pointer;transition:transform .2s;}
  .bx-chat-img:hover {transform:scale(1.02);}
  .bx-chat-sticker {max-width:110px;max-height:110px;border-radius:8px;display:block;margin-top:4px;object-fit:contain;background:transparent;}
  
  .bx-viewer {position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;padding:20px;}
  .bx-viewer[hidden] {display:none!important;}
  .bx-viewer img {max-width:95vw;max-height:90vh;border-radius:10px;object-fit:contain;box-shadow:0 10px 30px rgba(0,0,0,.8);}
  .bx-viewer-close {position:absolute;top:20px;right:25px;background:rgba(255,255,255,.2);color:#fff;border:0;border-radius:50%;width:40px;height:40px;font-size:20px;cursor:pointer;}

  .bx-pop{position:absolute;bottom:55px;left:0;right:0;display:grid;grid-template-columns:repeat(8,1fr);gap:4px;padding:8px;border-radius:12px;background:#171923;border:1px solid #262A36;max-height:132px;overflow-y:auto;z-index:300}
  .bx-pop[hidden]{display:none!important}
  .bx-pop button{border:0;background:transparent;font-size:20px;min-height:34px;border-radius:8px;cursor:pointer}
  .bx-pop button:hover{background:#262A36}
  
  #bx-sticker-picker.bx-pop {grid-template-columns:repeat(4,1fr)!important;padding:8px!important;}
  .bx-sticker-grid {display:contents;}
  .bx-sticker-grid button {background:#0E0F14;border:1px solid #262A36;border-radius:8px;padding:4px;cursor:pointer;text-align:center;display:flex;flex-direction:column;align-items:center;gap:2px;}
  .bx-sticker-grid button img {width:64px;height:64px;object-fit:contain;}
  .bx-sticker-grid button span {font-size:10px;color:#A3A9B8;}
  .bx-sticker-grid button:hover {background:#6D4AFF;border-color:#6D4AFF;}

  .bx-composer{display:flex;gap:6px;align-items:center;position:relative}
  .bx-composer .bx-in{flex:1;min-width:0;border-radius:999px;padding:0 14px}
  .bx-ico{flex:none;width:40px;height:40px;border:1px solid #262A36;border-radius:50%;background:#171923;font-size:18px;cursor:pointer}
  .bx-send{flex:none;width:40px;height:40px;border:0;border-radius:50%;background:#6D4AFF;color:#fff;font-size:16px;cursor:pointer}
  .bx-file-input{display:none!important;}
  `;

  const PICKER = ["😀", "😁", "😂", "🤣", "😊", "😍", "😎", "🤩", "😮", "😢", "😡", "🤯", "🥳", "🙌", "👏", "👍", "👎", "🙏", "💪", "🔥", "⚽", "🏆", "❤️", "💔"];
  const TABS = [["chat", "Chat"], ["puntos", "Puntos"], ["premios", "Premios"], ["apuestas", "Apuestas"]];
  const CH = { picker: false, stickerPicker: false };
  let beatTimer = null;

  function build() {
    const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    const root = document.createElement("div"); root.id = "bx-root";
    root.innerHTML = `
      <button class="bx-btn" id="bx-btn" type="button"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12z"/></svg><span class="bx-pts" id="bx-badge" hidden>0</span></button>
      <section class="bx-panel" id="bx-panel" hidden></section>
      <div class="bx-viewer" id="bx-viewer" hidden><button class="bx-viewer-close" id="bx-viewer-close">✕</button><img id="bx-viewer-img" src="" alt="Ampliada"></div>`;
    document.body.appendChild(root);
    $("bx-btn").addEventListener("click", toggle);
    $("bx-panel").addEventListener("click", onClick);

    $("bx-viewer-close").addEventListener("click", closeViewer);
    $("bx-viewer").addEventListener("click", e => { if (e.target.id === "bx-viewer") closeViewer(); });

    $("bx-panel").addEventListener("click", e => {
      const imgTarget = e.target.closest(".bx-chat-img");
      if (imgTarget) openViewer(imgTarget.src);
    });

    $("bx-panel").addEventListener("change", e => {
      if (e.target.id === "bx-league") { S.league = e.target.value; S.events = null; S.slip = null; renderPanel(); loadEvents(); }
    });

    document.addEventListener("change", async e => {
      if (e.target && e.target.id === "bx-file-input") {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 3 * 1024 * 1024) { notice("El archivo es mayor a 3MB.", "err"); return; }
        try {
          notice("Subiendo imagen...", "ok");
          const ext = file.name.split('.').pop().toLowerCase();
          const fileName = `${Date.now()}.${ext}`;
          const filePath = `${DEV}/${fileName}`;
          
          const { error: uploadErr } = await sb.storage.from("chat-media").upload(filePath, file);
          if (uploadErr) throw uploadErr;

          await rpc("send_rich", { p_device: DEV, p_kind: "image", p_text: "", p_path: filePath, p_url: "", p_meta: null });
          notice("¡Imagen enviada!", "ok");
          fetchNew();
        } catch (err) {
          notice(err.message || "Error al subir imagen", "err");
        }
        e.target.value = "";
      }
    });

    loadStickers();
    startHeartbeat();
  }

  function openViewer(src) {
    const v = $("bx-viewer"), img = $("bx-viewer-img");
    if (v && img) { img.src = src; v.hidden = false; }
  }
  function closeViewer() {
    const v = $("bx-viewer"), img = $("bx-viewer-img");
    if (v && img) { v.hidden = true; img.src = ""; }
  }

  async function loadStickers() {
    if (!sb) return;
    try {
      const { data, error } = await sb.from("stickers").select("*").order("created_at", { ascending: false });
      if (!error && data) S.stickers = data;
    } catch (e) { S.stickers = []; }
  }

  function toggle() {
    S.open = !S.open;
    $("bx-panel").hidden = !S.open;
    if (S.open) { onOpen(); }
  }

  async function onOpen() {
    renderPanel();
    if (S.player && sb) {
      try {
        const p = await rpc("get_player", { p_device: DEV });
        if (p) { S.points = p.points; S.earnedToday = p.earned_today || 0; }
      } catch (e) {}
      renderPanel();
    }
    enterTab();
  }

  function enterTab() {
    if (!S.player) return;
    if (S.tab === "chat") { loadChat(); }
    if (S.tab === "puntos") { loadPointsInfo(); loadTop(); }
    if (S.tab === "premios") loadRewards();
    if (S.tab === "apuestas" && S.adult) { if (S.events === null) loadEvents(); loadBets(); }
  }

  function renderPanel() {
    const p = $("bx-panel"); if (!p) return;
    const onb = !S.player;
    const head = `<div class="bx-head"><h3>Comunidad Donatelos</h3>${S.player ? `<span class="bx-chip">⭐ ${S.points}</span>` : ""}<button class="bx-x" data-act="close">✕</button></div>`;
    const tabs = !onb ? `<div class="bx-tabs" role="tablist">${TABS.map(([k, t]) => `<button role="tab" class="${S.tab === k ? "on" : ""}" data-act="tab" data-tab="${k}">${t}</button>`).join("")}</div>` : "";
    const body = onb ? bodyOnboarding() : S.tab === "chat" ? bodyChat() : S.tab === "puntos" ? bodyPuntos() : S.tab === "premios" ? bodyPremios() : bodyApuestas();
    p.innerHTML = head + tabs + `<div class="bx-body">${body}<p id="bx-notice" class="${S.noticeType}">${esc(S.notice)}</p></div>`;
  }

  function bodyOnboarding() {
    return `<div class="bx-bot">Elige tu apodo y país para unirte al chat.</div>
      <input id="bx-nick" class="bx-in" maxlength="20" placeholder="Tu apodo">
      <select id="bx-country" class="bx-sel">${BX.COUNTRIES.map(c => `<option value="${esc(c)}">${BX.FLAGS[c]} ${esc(c)}</option>`).join("")}</select>
      <button class="bx-primary" data-act="register">Entrar</button>`;
  }

  function bodyPuntos() {
    const top = S.top === null ? '<p class="bx-small">Cargando ranking…</p>' : S.top.length ? S.top.map((t, i) => `<div class="bx-rank"><span>${i + 1}. ${esc(t.nickname)}</span><b>⭐ ${t.points}</b></div>`).join("") : '<p class="bx-small">Sin ranking aún.</p>';
    const isEarning = S.player && S.earnedToday < BX.DAILY_CAP && document.visibilityState === "visible";
    const dotClass = isEarning ? "green" : "red";
    const statusText = !S.player ? "Inicia sesión para sumar" : isEarning ? "Obteniendo puntos..." : "Pausado / Límite alcanzado";

    return `<div class="bx-big"><span>${S.points}</span><small>puntos</small></div>
      <div class="bx-card">
        <p>Ganas <b>1 punto por minuto</b> viendo transmisiones (máx. ${BX.DAILY_CAP}).<br>
        <span style="display:inline-flex;align-items:center;margin-top:4px;"><span class="bx-status-dot ${dotClass}" id="bx-status-indicator"></span><span id="bx-earning-status" style="font-weight:700;color:${isEarning ? '#86EFAC':'#FCA5A5'}">${statusText}</span></span></p>
        <p style="margin-top:4px">Hoy: <b>${S.earnedToday}</b>/${BX.DAILY_CAP}</p>
        <div class="bx-bar" style="margin-top:6px"><i style="width:${Math.min(100, S.earnedToday / BX.DAILY_CAP * 100)}%"></i></div>
      </div>
      <h4>🏆 Ranking</h4><div>${top}</div>`;
  }

  function bodyPremios() {
    if (S.rewards === null) return '<p class="bx-small">Cargando premios…</p>';
    if (!S.rewards.length) return '<div class="bx-bot">No hay premios publicados todavía.</div>';
    return S.rewards.map(r => `<div class="bx-card"><h4>${esc(r.name)}</h4><p>⭐ ${r.cost}</p><button class="bx-primary" data-act="redeem" data-id="${r.id}">Canjear</button></div>`).join("");
  }

  function bodyApuestas() {
    if (S.adult === null) return `<div class="bx-card"><h4>🔞 Mayor de 18 años</h4><p>Apuestas con puntos virtuales.</p><button class="bx-primary" data-act="adult-yes">Soy mayor de edad</button></div>`;
    if (S.adult === false) return '<div class="bx-bot">Sección exclusiva para mayores de edad.</div>';
    
    let evHTML = S.events === null ? '<p class="bx-small">Cargando partidos…</p>' : S.evErr ? `<p class="bx-small" style="color:#FCA5A5">${esc(S.evErr)}</p>` : S.events.length ? S.events.map(ev => {
      const isSel = S.slip && S.slip.eventId === ev.id;
      return `<div class="bx-card">
        <div class="bx-teams">${esc(ev.name)}</div>
        <div class="bx-meta">${esc(ev.status)}</div>
        <div class="bx-picks">
          <button class="${isSel && S.slip.pick === 'home' ? 'on' : ''}" data-act="pick" data-id="${ev.id}" data-pick="home" data-team="${esc(ev.home)}">1 (${ev.odds.home.toFixed(2)})<small>${esc(ev.home)}</small></button>
          <button class="${isSel && S.slip.pick === 'draw' ? 'on' : ''}" data-act="pick" data-id="${ev.id}" data-pick="draw" data-team="Empate">X (${ev.odds.draw.toFixed(2)})<small>Empate</small></button>
          <button class="${isSel && S.slip.pick === 'away' ? 'on' : ''}" data-act="pick" data-id="${ev.id}" data-pick="away" data-team="${esc(ev.away)}">2 (${ev.odds.away.toFixed(2)})<small>${esc(ev.away)}</small></button>
        </div>
        ${isSel ? `<div style="display:flex;gap:4px;margin-top:6px"><select id="bx-stake" class="bx-sel" style="padding:0 6px;height:36px">${BX.STAKES.map(st => `<option value="${st}" ${S.slip.stake === st ? 'selected' : ''}>${st} pts</option>`).join("")}</select><button class="bx-primary" data-act="place-bet" style="height:36px">Apostar</button></div>` : ''}
      </div>`;
    }).join("") : '<p class="bx-small">No hay partidos programados en esta liga hoy.</p>';

    let betsHTML = S.bets === null ? '' : S.bets.length ? `<h4 style="margin-top:12px">Mis Apuestas</h4>` + S.bets.map(b => `<div class="bx-card"><div class="bx-teams">${esc(b.match_name)}</div><p class="bx-meta">Pick: <b>${esc(b.pick)}</b> | Apuesta: <b>${b.stake} pts</b></p><p class="bx-meta">Premio pot: <b>${b.payout} pts</b> | Estado: <span class="bx-st-${b.status}">${b.status.toUpperCase()}</span></p></div>`).join("") : '';

    return `<select id="bx-league" class="bx-sel">${BX.LEAGUES.map(l => `<option value="${l.slug}" ${l.slug === S.league ? "selected" : ""}>${esc(l.name)}</option>`).join("")}</select>
    <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">${evHTML}${betsHTML}</div>`;
  }

  function fmtMedia(m) {
    if (m.kind === 'image' && m.media_path) {
      const { data } = sb.storage.from("chat-media").getPublicUrl(m.media_path);
      return `<img src="${esc(data.publicUrl)}" class="bx-chat-img" alt="Imagen en chat">`;
    }
    if (m.kind === 'sticker') {
      return `<img src="${esc(m.media_url || m.message)}" class="bx-chat-sticker" alt="Sticker">`;
    }
    return esc(m.message);
  }

  function msgHTML(m) {
    const mine = S.player && m.nickname === S.player.nickname;
    return `<div class="bx-msg${mine ? " mine" : ""}"><div class="bx-bub"><div class="bx-who"><a>${esc(m.nickname)}</a></div><div class="bx-txt">${fmtMedia(m)}</div></div></div>`;
  }

  function bodyChat() {
    const list = S.msgs.map(m => msgHTML(m)).join("") || '<p class="bx-small">Cargando mensajes…</p>';
    const stickerButtons = S.stickers.map(stk => `
      <button data-act="send-sticker" data-url="${esc(stk.image_url)}" data-vip="${stk.is_vip}">
        <img src="${esc(stk.image_url)}" alt="${esc(stk.name)}">
        <span>${stk.is_vip ? '⭐ VIP' : esc(stk.name)}</span>
      </button>`).join("");

    return `<div class="bx-chatwrap">
      <div class="bx-chead"><span class="bx-dot on"></span><span>En vivo</span></div>
      <div class="bx-msgwrap"><div class="bx-chatbox" id="bx-msgs">${list}</div></div>
      
      <div class="bx-pop" id="bx-picker" ${CH.picker ? "" : "hidden"}>${PICKER.map(e => `<button data-act="emoji-add" data-e="${e}">${e}</button>`).join("")}</div>
      <div class="bx-pop" id="bx-sticker-picker" ${CH.stickerPicker ? "" : "hidden"}><div class="bx-sticker-grid">${stickerButtons || '<p class="bx-small" style="grid-column:span 4;text-align:center;">Sin stickers</p>'}</div></div>

      <input type="file" id="bx-file-input" class="bx-file-input" accept="image/jpeg,image/png,image/webp">

      <div class="bx-composer">
        <button class="bx-ico" data-act="emoji-toggle" title="Emojis">😊</button>
        <button class="bx-ico" data-act="sticker-toggle" title="Stickers">⭐</button>
        <button class="bx-ico" data-act="file-trigger" title="Adjuntar imagen">📎</button>
        <input id="bx-text" class="bx-in" maxlength="200" placeholder="Escribe un mensaje...">
        <button class="bx-send" data-act="send">➤</button>
      </div></div>`;
  }

  function syncPops() {
    const p = $("bx-picker"), s = $("bx-sticker-picker");
    if (p) p.hidden = !CH.picker;
    if (s) s.hidden = !CH.stickerPicker;
  }

  function onClick(e) {
    const el = e.target.closest("[data-act]"); if (!el) return;
    const a = el.dataset.act;
    if (a === "close") toggle();
    if (a === "tab") { S.tab = el.dataset.tab; renderPanel(); enterTab(); }
    if (a === "emoji-toggle") { CH.picker = !CH.picker; CH.stickerPicker = false; syncPops(); }
    if (a === "sticker-toggle") { CH.stickerPicker = !CH.stickerPicker; CH.picker = false; syncPops(); }
    if (a === "file-trigger") { const f = $("bx-file-input"); if (f) f.click(); }
    if (a === "emoji-add") { const i = $("bx-text"); if (i) { i.value += el.dataset.e; i.focus(); } }
    if (a === "adult-yes") { S.adult = true; lsSet("donatelos_18", "1"); renderPanel(); enterTab(); }
    
    if (a === "pick") {
      const id = el.dataset.id, pick = el.dataset.pick, team = el.dataset.team;
      const ev = (S.events || []).find(x => x.id === id);
      if (!ev) return;
      S.slip = { eventId: id, matchName: ev.name, pick, pickName: team, mult: ev.odds[pick], stake: BX.STAKES[0] };
      renderPanel();
    }
    if (a === "place-bet") {
      if (!S.slip) return;
      const stEl = $("bx-stake");
      const stakeVal = stEl ? parseInt(stEl.value, 10) : S.slip.stake;
      rpc("place_bet", { p_device: DEV, p_match_id: S.slip.eventId, p_match_name: S.slip.matchName, p_pick: S.slip.pickName, p_stake: stakeVal, p_mult: S.slip.mult })
        .then(() => { notice("¡Apuesta realizada con éxito!", "ok"); S.slip = null; onOpen(); })
        .catch(err => notice(err.message, "err"));
    }
    if (a === "send-sticker") {
      const url = el.dataset.url;
      const isVip = el.dataset.vip === "true";

      if (isVip && S.player.nickname !== "ADMINISTRADOR") {
        notice("Este sticker es exclusivo para usuarios VIP.", "err");
        return;
      }

      rpc("send_rich", { p_device: DEV, p_kind: "sticker", p_text: "", p_path: "", p_url: url, p_meta: null })
        .then(() => { CH.stickerPicker = false; syncPops(); fetchNew(); })
        .catch(err => notice(err.message, "err"));
    }
    if (a === "register") {
      const nick = ($("bx-nick").value || "").trim();
      rpc("register_player", { p_device: DEV, p_nick: nick, p_country: $("bx-country").value })
        .then(p => { S.player = { nickname: p.nickname }; S.points = p.points; lsSet("donatelos_player", JSON.stringify(S.player)); renderPanel(); enterTab(); });
    }
    if (a === "send") {
      const inp = $("bx-text"), txt = (inp ? inp.value : "").trim();
      if (!txt) return;
      inp.value = "";
      rpc("send_chat", { p_device: DEV, p_message: txt }).then(() => fetchNew());
    }
  }

  function notice(msg, type) {
    S.notice = msg; S.noticeType = type || "ok";
    const n = $("bx-notice"); if (n) { n.textContent = msg; n.className = S.noticeType; }
  }

  async function loadPointsInfo() {
    try {
      const p = await rpc("get_player", { p_device: DEV });
      if (p) { S.points = p.points; S.earnedToday = p.earned_today || 0; }
    } catch (e) {}
    if (S.tab === "puntos") renderPanel();
  }

  function startHeartbeat() {
    if (beatTimer) clearInterval(beatTimer);
    beatTimer = setInterval(async () => {
      // Actualización visual en tiempo real de los indicadores (Verde/Rojo)
      const isVisible = document.visibilityState === "visible";
      const isEarning = S.player && S.earnedToday < BX.DAILY_CAP && isVisible;
      
      const statusEl = $("bx-earning-status");
      const dotEl = $("bx-status-indicator");
      if (statusEl && dotEl) {
        if (!S.player) {
          statusEl.textContent = "Inicia sesión para sumar";
          statusEl.style.color = "#FCA5A5";
          dotEl.className = "bx-status-dot red";
        } else if (!isVisible) {
          statusEl.textContent = "Pausado (Pestaña oculta)";
          statusEl.style.color = "#FCA5A5";
          dotEl.className = "bx-status-dot red";
        } else if (S.earnedToday >= BX.DAILY_CAP) {
          statusEl.textContent = "Límite diario alcanzado";
          statusEl.style.color = "#FCA5A5";
          dotEl.className = "bx-status-dot red";
        } else {
          statusEl.textContent = "Obteniendo puntos...";
          statusEl.style.color = "#86EFAC";
          dotEl.className = "bx-status-dot green";
        }
      }

      // Si no hay jugador o no cumple condiciones para sumar, salimos del ciclo de red
      if (!isEarning) return;

      try {
        const res = await rpc("beat_player", { p_device: DEV });
        if (res && res.length > 0) {
          const data = res[0];
          S.points = data.points;
          S.earnedToday = data.earned_today || 0;
          const badge = $("bx-badge");
          if (badge) { badge.textContent = S.points; badge.hidden = false; }
          if (S.tab === "puntos") renderPanel();
        }
      } catch (e) {}
    }, BX.BEAT_S * 1000);
  }

  async function loadTop() { try { S.top = await rpc("top_players"); } catch (e) { S.top = []; } if (S.tab === "puntos") renderPanel(); }
  async function loadRewards() {
    try { const { data } = await sb.from("rewards").select("*").eq("active", true); S.rewards = data || []; } catch (e) { S.rewards = []; }
    if (S.tab === "premios") renderPanel();
  }
  async function loadBets() { try { S.bets = await rpc("my_bets", { p_device: DEV }) || []; } catch (e) { S.bets = []; } if (S.tab === "apuestas") renderPanel(); }
  
  async function loadEvents() {
    S.evErr = "";
    try {
      const url = BX.getScoreboardUrl(S.league);
      const res = await fetch(url);
      const json = await res.json();
      const events = (json.events || []).map(ev => {
        const comp = ev.competitions?.[0] || {};
        const teams = comp.competitors || [];
        const homeComp = teams.find(t => t.homeAway === "home") || teams[0];
        const awayComp = teams.find(t => t.homeAway === "away") || teams[1];
        
        const homeTeam = homeComp?.team?.displayName || "Local";
        const awayTeam = awayComp?.team?.displayName || "Visita";
        
        const homeScore = parseInt(homeComp?.score ?? 0, 10);
        const awayScore = parseInt(awayComp?.score ?? 0, 10);
        
        let homeOdds = 2.10, drawOdds = 3.20, awayOdds = 2.80;
        if (homeScore > awayScore) {
          homeOdds = 1.35;
          awayOdds = 6.50;
        } else if (awayScore > homeScore) {
          homeOdds = 5.80;
          awayOdds = 1.45;
        }

        return { 
          id: ev.id, 
          name: `${homeTeam} ${homeScore} - ${awayScore} ${awayTeam}`, 
          home: homeTeam, 
          away: awayTeam, 
          status: ev.status?.type?.detail || "Programado",
          odds: { home: homeOdds, draw: drawOdds, away: awayOdds }
        };
      });
      S.events = events;
    } catch (e) {
      S.events = [];
      S.evErr = "No se pudieron cargar los partidos de esta liga.";
    }
    if (S.tab === "apuestas") renderPanel();
  }

  async function fetchNew() {
    if (!sb) return;
    const { data } = await sb.from("chat_messages").select("*").eq("hidden", false).order("created_at", { ascending: false }).limit(30);
    if (data) {
      S.msgs = data.reverse();
      const box = $("bx-msgs"); if (box) { box.innerHTML = S.msgs.map(m => msgHTML(m)).join(""); box.scrollTop = box.scrollHeight; }
    }
  }

  async function loadChat() { await fetchNew(); }
  function init() { build(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();