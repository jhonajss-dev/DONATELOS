function slugify(text) {
  return text.toString().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

function obtenerLogoRespaldo(nombreEquipo) {
  if (!nombreEquipo) return '';
  const slug = slugify(nombreEquipo);
  return `https://football-logos.cc/img/${slug}.png`;
}


async function renderizarAgendaDeportes() {
  const sportsContainer = document.getElementById('sports-container');
  const mainGrid = document.getElementById('channels-grid');
  
  if (mainGrid) mainGrid.style.display = 'none';
  if (sportsContainer) sportsContainer.style.display = 'block';

  if (!sportsContainer) return;

  const existingView = document.getElementById('donatelo-cartelera-view');
  if (existingView) {
    existingView.remove();
  }

  const carteleraView = document.createElement('div');
  carteleraView.id = 'donatelo-cartelera-view';
  carteleraView.style.cssText = 'padding: 0 var(--pad, 24px); width: 100%; max-width: 1400px; margin: 0 auto;';

  carteleraView.innerHTML = `
    <div style="margin: 10px 0 30px 0; color: var(--text); font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      
      <!-- Banner estilo alerta de terceros -->
<div style="background: #12141a; border: 1px solid rgba(255, 255, 255, 0.06); color: #9ca3af; padding: 14px 18px; border-radius: 14px; margin-bottom: 28px; display: flex; align-items: center; gap: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.4); font-family: 'Plus Jakarta Sans', system-ui, sans-serif;">
  
  <!-- Icono cuadrado de Brave (puedes reemplazar la URL de la imagen si prefieres otra) -->
  <div style="flex-shrink: 0; width: 42px; height: 42px; background: #1a1d26; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 10px; display: flex; align-items: center; justify-content: center; overflow: hidden;">
    <img src="https://pngdownload.io/wp-content/uploads/2024/02/Brave-web-browser-logo-transparent-PNG-image-jpg.webp" alt="Brave" style="width: 26px; height: 26px; object-fit: contain;">
  </div>

  <!-- Contenido de texto -->
  <div style="display: flex; flex-direction: column; gap: 2px; line-height: 1.4;">
    <div style="display: flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 700; color: #9ca3af; letter-spacing: 0.05em; text-transform: uppercase;">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      AVISO
    </div>
    <div style="font-size: 14px; font-weight: 700; color: #ffffff; letter-spacing: -0.01em;">
      Anuncios de terceros
    </div>
    <div style="font-size: 12px; color: #9ca3af;">
      Utiliza Brave para evitar los anuncios de terceros y mejorar tu experiencia de navegación
    </div>
  </div>

</div>

      <!-- REPRODUCTOR HALLOWEEN CON MARCO DE ESQUELETO Y GÁRGOLAS -->
      <div id="donatelo-player-container" style="margin-bottom: 40px; display: none; position: relative;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; flex-wrap: wrap; gap: 10px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <button id="btn-volver-cartelera" class="btn" style="padding: 6px 14px; font-size: 13px; cursor: pointer; background: rgba(38, 42, 54, 0.8);">← Volver</button>
            <h2 id="current-match-title" style="margin: 0; font-size: 1.2rem; font-weight: 800; color: #34d399; text-shadow: 0 0 10px rgba(16,185,129,0.4);">Reproductor en Vivo</h2>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="chip" style="background: #d92d12; box-shadow: 0 0 10px rgba(217,45,18,0.5);">EN VIVO</span>
            <button onclick="navigator.clipboard.writeText(window.location.href); alert('¡Enlace del canal copiado al portapapeles!');" class="btn" style="padding: 6px 14px; font-size: 13px;">Compartir Canal</button>
          </div>
        </div>

        <!-- REPRODUCTOR LIMPIO -->
      <div id="donatelo-player-container" style="margin-bottom: 40px; display: none; position: relative;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; flex-wrap: wrap; gap: 10px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <button id="btn-volver-cartelera" class="btn" style="padding: 6px 14px; font-size: 13px; cursor: pointer; background: rgba(38, 42, 54, 0.8);">← Volver</button>
            <h2 id="current-match-title" style="margin: 0; font-size: 1.2rem; font-weight: 800; color: #34d399; text-shadow: 0 0 10px rgba(16,185,129,0.4);">Reproductor en Vivo</h2>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="chip" style="background: #d92d12; box-shadow: 0 0 10px rgba(217,45,18,0.5);">EN VIVO</span>
            <button onclick="navigator.clipboard.writeText(window.location.href); alert('¡Enlace del canal copiado al portapapeles!');" class="btn" style="padding: 6px 14px; font-size: 13px;">Compartir Canal</button>
          </div>
        </div>

        <!-- CONTENEDOR ESTÁNDAR -->
        <div style="position: relative; width: 100%; max-width: 860px; margin: 0 auto;">
          
          <div style="position: relative; width: 100%; aspect-ratio: 16/9; background: #000; border-radius: 12px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
            <iframe id="donatelo-player" src="" scrolling="no" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; overflow: hidden; z-index: 1;" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen="true"></iframe>
          </div>

        </div>
      </div>

      <!-- Header & Categorías -->
      <div style="display: flex; flex-direction: column; gap: 18px; margin-bottom: 24px;">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <h3 id="agenda-titulo" style="color: #ffffff; margin: 0; font-size: 1.5rem; font-weight: 800; tracking-tight: -0.02em; display: flex; align-items: center; gap: 10px;">
            <span style="width: 10px; height: 22px; background: linear-gradient(180deg, #10b981 0%, #059669 100%); border-radius: 4px; display: inline-block;"></span>
            Cartelera Deportiva
          </h3>
        </div>
        
        <!-- Botones de categorías -->
        <div id="deportes-filtros-bar" style="display: flex; flex-wrap: wrap; items-center; gap: 10px;"></div>
      </div>

      <!-- Buscador Minimalista Aesthetic -->
      <div style="margin-bottom: 30px; width: 100%;">
        <div style="position: relative; display: flex; align-items: center; background: rgba(18, 20, 29, 0.7); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; padding: 12px 18px; backdrop-filter: blur(8px); transition: border-color 0.2s ease, box-shadow 0.2s ease;">
          <span style="font-size: 15px; margin-right: 12px; opacity: 0.5; filter: grayscale(1);">🔍</span>
          <input 
            type="text" 
            id="sportsSearchInput" 
            placeholder="Buscar por equipo, liga o canal..." 
            oninput="filtrarPartidosDeporte()"
            style="width: 100%; background: transparent; border: none; outline: none; color: #f3f4f6; font-size: 14px; font-weight: 500;"
          >
          <button id="clearSearchBtn" onclick="limpiarBuscadorDeportes()" style="background: rgba(255,255,255,0.1); border: none; color: #a1a1aa; font-size: 12px; cursor: pointer; display: none; padding: 2px 8px; border-radius: 50px;">✕</button>
        </div>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <span style="font-size: 11px; font-weight: 800; color: #64748b; letter-spacing: 0.1em; text-transform: uppercase;">Eventos Destacados</span>
      </div>

      <div id="partidos-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 20px;"></div>
    </div>
  `;

  sportsContainer.innerHTML = '';
  sportsContainer.appendChild(carteleraView);

  const [res1, res2] = await Promise.all([
    db.from('partidos_cartelera').select('*').range(0, 999),
    db.from('partidos_scraper2').select('*').range(0, 999)
  ]);

  const partidos = [...(res1.data || []), ...(res2.data || [])];
  const error = res1.error || res2.error;

  const partidosGrid = carteleraView.querySelector('#partidos-grid');
  const filtrosBar = carteleraView.querySelector('#deportes-filtros-bar');
  
  if (error || !partidos || partidos.length === 0) {
    partidosGrid.innerHTML = '<p style="color: #94a3b8; padding: 20px; text-align: center; width: 100%;">No hay partidos disponibles en este momento.</p>';
  } else {
    const playerContainer = carteleraView.querySelector('#donatelo-player-container');
    const player = carteleraView.querySelector('#donatelo-player');
    const titleElem = carteleraView.querySelector('#current-match-title');
    const btnVolver = carteleraView.querySelector('#btn-volver-cartelera');
    const agendaTitulo = carteleraView.querySelector('#agenda-titulo');

    if (btnVolver) {
      btnVolver.onclick = () => {
        player.src = ''; 
        playerContainer.style.display = 'none'; 
        
        if (window._iframeTimer) {
          clearInterval(window._iframeTimer);
          window._iframeTimer = null;
        }
        
        const url = new URL(window.location);
        url.searchParams.delete('partido');
        url.searchParams.delete('canal');
        window.history.pushState({}, '', url);

        if (agendaTitulo) {
          agendaTitulo.scrollIntoView({ behavior: 'smooth' });
        }
      };
    }

    const partidosAgrupados = {};
    const conteoDeportes = { 'Todo': 0, 'Fútbol': 0, 'NBA / Basket': 0, 'Fútbol Am.': 0, 'NHL': 0 };

    partidos.forEach(p => {
      const key = `${p.home_team} vs ${p.away_team}`;
      const deporteVal = p.deporte || p.sport || 'Fútbol';

      if (!partidosAgrupados[key]) {
        partidosAgrupados[key] = {
          home_team: p.home_team,
          away_team: p.away_team,
          home_logo: p.home_logo || '',
          away_logo: p.away_logo || '',
          deporte: deporteVal,
          liga: p.liga || p.league || '',
          hora: p.hora || 'Lun, 15:00',
          tiempo_restante: p.tiempo_restante || 'En vivo',
          thumbnail: p.thumbnail || p.bg_image || '',
          channels: []
        };

        conteoDeportes['Todo']++;
        if (conteoDeportes[deporteVal] !== undefined) {
          conteoDeportes[deporteVal]++;
        } else {
          conteoDeportes[deporteVal] = 1;
        }
      } else {
        if (!partidosAgrupados[key].home_logo && p.home_logo) {
          partidosAgrupados[key].home_logo = p.home_logo;
        }
        if (!partidosAgrupados[key].away_logo && p.away_logo) {
          partidosAgrupados[key].away_logo = p.away_logo;
        }
        if (!partidosAgrupados[key].thumbnail && p.thumbnail) {
          partidosAgrupados[key].thumbnail = p.thumbnail;
        }
      }

      partidosAgrupados[key].channels.push({
        channel_name: p.channel_name,
        stream_url: p.stream_url
      });
    });

    let deporteActivo = 'Todo';
    const categoriasList = ['Todo', 'Fútbol', 'NBA / Basket', 'Fútbol Am.', 'NHL'];

    function renderizarBotonesFiltro() {
      filtrosBar.innerHTML = '';
      categoriasList.forEach(cat => {
        const cantidad = conteoDeportes[cat] || 0;
        if (cat !== 'Todo' && cantidad === 0) return;

        const btn = document.createElement('button');
        const isActive = deporteActivo === cat;
        btn.setAttribute('data-active', isActive ? 'true' : 'false');

        btn.style.cssText = `
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          border-radius: 50px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          border: 1px solid ${isActive ? '#10b981' : 'rgba(255, 255, 255, 0.08)'};
          background: ${isActive ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'rgba(255, 255, 255, 0.03)'};
          color: ${isActive ? '#ffffff' : '#94a3b8'};
          box-shadow: ${isActive ? '0 4px 16px rgba(16, 185, 129, 0.3)' : 'none'};
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        `;

        btn.innerHTML = `
          <span>${cat}</span>
          <span style="
            background: ${isActive ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.06)'};
            padding: 2px 8px;
            border-radius: 50px;
            font-size: 11px;
            color: ${isActive ? '#ffffff' : '#64748b'};
          ">${cantidad}</span>
        `;

        btn.onclick = () => {
          deporteActivo = cat;
          renderizarBotonesFiltro();
          window.filtrarPartidosDeporte();
        };

        filtrosBar.appendChild(btn);
      });
    }

    renderizarBotonesFiltro();

    partidosGrid.innerHTML = '';
    
    const gradientBanners = [
      'linear-gradient(135deg, #064e3b 0%, #022c22 100%)',
      'linear-gradient(135deg, #0f766e 0%, #042f2e 100%)',
      'linear-gradient(135deg, #14532d 0%, #052e16 100%)',
      'linear-gradient(135deg, #0f172a 0%, #020617 100%)'
    ];

    Object.values(partidosAgrupados).forEach((match, idx) => {
      const card = document.createElement('div');
      card.setAttribute('data-deporte', match.deporte);
      card.style.cssText = `
        background: #0d0f14;
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 20px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        transition: transform 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
        box-shadow: 0 12px 32px rgba(0,0,0,0.4);
      `;

      card.onmouseover = () => {
        card.style.transform = 'translateY(-4px)';
        card.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        card.style.boxShadow = '0 16px 40px rgba(0, 0, 0, 0.6), 0 0 20px rgba(16, 185, 129, 0.15)';
      };
      card.onmouseout = () => {
        card.style.transform = 'translateY(0)';
        card.style.borderColor = 'rgba(255, 255, 255, 0.06)';
        card.style.boxShadow = '0 12px 32px rgba(0,0,0,0.4)';
      };

      const bgImage = match.thumbnail;
      const bgFallback = gradientBanners[idx % gradientBanners.length];
      const backgroundStyle = bgImage 
        ? `background-image: url('${bgImage}'), ${bgFallback}; background-size: cover; background-position: center;`
        : `background: ${bgFallback};`;

      const cantidadServidores = match.channels.length;

      let canalesHtml = '';
      match.channels.forEach((ch) => {
        const matchNameStr = `${match.home_team} vs ${match.away_team}`;
        const channelSlug = slugify(ch.channel_name);
        canalesHtml += `
          <div style="display: flex; gap: 4px; align-items: center;">
            <button class="channel-btn" data-url="${ch.stream_url}" data-name="${matchNameStr} (${ch.channel_name})" data-slug="${channelSlug}" style="
              background: rgba(255, 255, 255, 0.03);
              color: #cbd5e1;
              border: 1px solid rgba(255, 255, 255, 0.08);
              padding: 10px 10px;
              font-size: 12px;
              font-weight: 700;
              border-radius: 12px;
              cursor: pointer;
              transition: all 0.25s ease;
              width: 100%;
              text-align: center;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            " title="${ch.channel_name}">[${ch.channel_name}]</button>
            <button class="share-channel-btn" data-match="${slugify(matchNameStr)}" data-channel="${channelSlug}" style="
              background: rgba(16, 185, 129, 0.1);
              color: #34d399;
              border: 1px solid rgba(16, 185, 129, 0.3);
              padding: 10px 8px;
              font-size: 12px;
              border-radius: 12px;
              cursor: pointer;
              transition: all 0.25s ease;
            " title="Copiar enlace de este canal">🔗</button>
          </div>
        `;
      });

      const logoHome = match.home_logo || obtenerLogoRespaldo(match.home_team);
      const logoAway = match.away_logo || obtenerLogoRespaldo(match.away_team);

      card.innerHTML = `
        <div style="${backgroundStyle} position: relative; padding: 18px; overflow: hidden; text-align: center;">
          <span style="position: absolute; inset: 0; background: linear-gradient(160deg, rgba(16, 185, 129, 0.2), rgba(11, 13, 17, 0.55)); z-index: 1;"></span>
          
          <div style="position: relative; z-index: 2;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
              <span style="background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.1); backdrop-filter: blur(8px); border-radius: 50px; padding: 4px 12px; font-size: 11px; font-weight: 700; color: #e2e8f0;">
                🕒 ${match.hora}
              </span>
              <span style="background: rgba(16, 185, 129, 0.2); border: 1px solid rgba(16, 185, 129, 0.4); backdrop-filter: blur(8px); border-radius: 50px; padding: 4px 12px; font-size: 11px; font-weight: 800; color: #34d399; letter-spacing: 0.03em;">
                ${match.tiempo_restante || 'EN VIVO'}
              </span>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-around; gap: 10px; margin-bottom: 8px; min-height: 55px;">
              
              <div style="display: flex; flex-direction: column; align-items: center; width: 35%;">
                <img src="${logoHome}" style="width: 52px; height: 52px; object-fit: contain; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.5));" onerror="this.style.display='none'">
              </div>
              
              <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 30%;">
                <div style="background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.1); backdrop-filter: blur(6px); border-radius: 12px; padding: 4px 8px; display: flex; flex-direction: column; align-items: center; gap: 2px;">
                  <span style="font-size: 9px; font-weight: 800; color: #34d399; text-transform: uppercase; letter-spacing: 0.05em;">${match.deporte.substring(0, 5)}</span>
                  <span style="font-size: 11px; font-weight: 900; color: rgba(255,255,255,0.9); font-style: italic;">VS</span>
                </div>
              </div>
              
              <div style="display: flex; flex-direction: column; align-items: center; width: 35%;">
                <img src="${logoAway}" style="width: 52px; height: 52px; object-fit: contain; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.5));" onerror="this.style.display='none'">
              </div>

            </div>

            <div style="display: flex; justify-content: space-between; text-align: center; font-size: 12px; font-weight: 800; color: #f3f4f6; padding-top: 8px; border-top: 1px solid rgba(255, 255, 255, 0.08); margin-top: 8px;">
              <div style="width: 44%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${match.home_team}">${match.home_team}</div>
              <div style="width: 12%; color: #94a3b8; font-weight: 600;">-</div>
              <div style="width: 44%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${match.away_team}">${match.away_team}</div>
            </div>

          </div>
        </div>

        <div style="padding: 16px; flex-grow: 1; display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
              <span style="font-size: 11px; font-weight: 800; color: #10b981; text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; gap: 5px;">
                ⚽ ${match.deporte} <span style="color: #64748b; font-weight: 600;">${match.liga}</span>
              </span>
              <span style="font-size: 11px; color: #64748b; font-weight: 600;">
                ${cantidadServidores} opción${cantidadServidores > 1 ? 'es' : ''} →
              </span>
            </div>

            <div style="font-size: 10px; font-weight: 800; color: #475569; text-transform: uppercase; margin-bottom: 10px; letter-spacing: 0.08em;">
              OPCIONES DISPONIBLES
            </div>

            <div style="display: grid; grid-template-columns: repeat(1, 1fr); gap: 8px;">
              ${canalesHtml}
            </div>
          </div>
        </div>
      `;

      card.querySelectorAll('.share-channel-btn').forEach(sBtn => {
        sBtn.onclick = (e) => {
          e.stopPropagation();
          const matchSlug = sBtn.getAttribute('data-match');
          const channelSlug = sBtn.getAttribute('data-channel');
          const shareUrl = new URL(window.location.origin + window.location.pathname);
          shareUrl.searchParams.set('partido', matchSlug);
          shareUrl.searchParams.set('canal', channelSlug);
          
          navigator.clipboard.writeText(shareUrl.toString());
          alert('¡Enlace directo del canal copiado al portapapeles!');
        };
      });

      card.querySelectorAll('.channel-btn').forEach(btn => {
        btn.onmouseover = () => { 
          btn.style.background = '#10b981'; 
          btn.style.borderColor = '#10b981'; 
          btn.style.color = '#ffffff';
          btn.style.boxShadow = '0 4px 14px rgba(16, 185, 129, 0.4)';
        };
        btn.onmouseout = () => { 
          btn.style.background = 'rgba(255, 255, 255, 0.03)'; 
          btn.style.borderColor = 'rgba(255, 255, 255, 0.08)'; 
          btn.style.color = '#cbd5e1';
          btn.style.boxShadow = 'none';
        };
        
        btn.onclick = () => {
          playerContainer.style.display = 'block';
          const matchUrl = btn.getAttribute('data-url');
          const matchName = btn.getAttribute('data-name');
          const channelSlug = btn.getAttribute('data-slug');
          player.src = matchUrl;
          titleElem.textContent = matchName;
          
          const url = new URL(window.location);
          url.searchParams.set('partido', slugify(matchName.split('(')[0].trim()));
          url.searchParams.set('canal', channelSlug);
          window.history.pushState({ matchName }, '', url);

          if (window._iframeTimer) {
            clearInterval(window._iframeTimer);
            window._iframeTimer = null;
          }

          window._iframeTimer = setInterval(() => {
            if (playerContainer.style.display !== 'none' && player.src) {
              let puntos = parseInt(localStorage.getItem('donatelo_points') || '0', 10);
              let hoyPuntos = parseInt(localStorage.getItem('donatelo_today_points') || '0', 10);
              
              if (hoyPuntos < 180) {
                puntos += 1;
                hoyPuntos += 1;
                localStorage.setItem('donatelo_points', puntos);
                localStorage.setItem('donatelo_today_points', hoyPuntos);
                
                document.querySelectorAll('.puntos-val, #user-points, [data-points]').forEach(el => {
                  el.textContent = puntos;
                });

                window.dispatchEvent(new CustomEvent('donatelo:point-added', { detail: { puntos, hoyPuntos } }));
              }
            }
          }, 60000);

          playerContainer.scrollIntoView({ behavior: 'smooth' });
        };
      });

      partidosGrid.appendChild(card);
    });
  }
}

window.filtrarPartidosDeporte = function() {
  const input = document.getElementById('sportsSearchInput');
  const clearBtn = document.getElementById('clearSearchBtn');
  const query = input ? input.value.toLowerCase().trim() : '';

  if (clearBtn) {
    clearBtn.style.display = query.length > 0 ? 'block' : 'none';
  }

  const filtrosBar = document.getElementById('deportes-filtros-bar');
  let deporteSeleccionado = 'Todo';
  if (filtrosBar) {
    const btnActivo = Array.from(filtrosBar.children).find(b => b.getAttribute('data-active') === 'true');
    if (btnActivo) {
      deporteSeleccionado = btnActivo.querySelector('span').innerText.trim();
    }
  }

  const tarjetas = document.querySelectorAll('#partidos-grid > div');
  tarjetas.forEach(card => {
    const textoTarjeta = card.innerText.toLowerCase();
    const deporteCard = card.getAttribute('data-deporte') || 'Fútbol';

    const coincideBusqueda = query === '' || textoTarjeta.includes(query);
    const coincideDeporte = deporteSeleccionado === 'Todo' || deporteCard === deporteSeleccionado;

    card.style.display = (coincideBusqueda && coincideDeporte) ? '' : 'none';
  });
};

window.limpiarBuscadorDeportes = function() {
  const input = document.getElementById('sportsSearchInput');
  if (input) {
    input.value = '';
    window.filtrarPartidosDeporte();
    input.focus();
  }
};

document.addEventListener('click', (e) => {
  const target = e.target.closest('button, a');
  if (target) {
    const text = target.innerText ? target.innerText.toLowerCase() : '';
    const view = target.getAttribute('data-view');
    const sportsContainer = document.getElementById('sports-container');
    const mainGrid = document.getElementById('channels-grid');

    if (text.includes('deportes') || view === 'sports') {
      e.stopImmediatePropagation();
      if (mainGrid) mainGrid.style.display = 'none';
      if (sportsContainer) sportsContainer.style.display = 'block';
      renderizarAgendaDeportes();
    } else if (view && view !== 'sports') {
      if (sportsContainer) sportsContainer.style.display = 'none';
      if (mainGrid) mainGrid.style.display = 'block';
      
      if (window._iframeTimer) {
        clearInterval(window._iframeTimer);
        window._iframeTimer = null;
      }
    }
  }
}, true);

window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const params = new URLSearchParams(location.search);
    const partidoSlug = params.get('partido');
    const canalSlug = params.get('canal');
    if (!partidoSlug) return;
    
    const sportsContainer = document.getElementById('sports-container');
    const mainGrid = document.getElementById('channels-grid');
    if (mainGrid) mainGrid.style.display = 'none';
    if (sportsContainer) sportsContainer.style.display = 'block';
    
    renderizarAgendaDeportes();
    
    const checkInterval = setInterval(() => {
      const buttons = document.querySelectorAll('.channel-btn');
      for (const btn of buttons) {
        const btnMatchName = btn.getAttribute('data-name');
        const btnChannelSlug = btn.getAttribute('data-slug');
        
        if (btnMatchName && slugify(btnMatchName).includes(partidoSlug)) {
          if (!canalSlug || btnChannelSlug === canalSlug) {
            btn.click();
            clearInterval(checkInterval);
            break;
          }
        }
      }
    }, 500);
  }, 1200);
});