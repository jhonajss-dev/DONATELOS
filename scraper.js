const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const SUPABASE_URL = "https://vkmpazwqyfxhdrwvqirv.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrbXBhendxeWZ4aGRyd3ZxaXJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxOTMwNjYsImV4cCI6MjEwNzc2OTA2Nn0.rLf9KOY05NAj8R9vhRWge2B1G0lWdOTF8N17UaiaVJk";

const db = createClient(SUPABASE_URL, SUPABASE_KEY);

async function extraerAgendaVivosYConHora() {
  console.log("⚡ Iniciando extracción precisa y limpieza de iframes de video...");
  
  const bravePath = 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe';
  const useBrave = process.platform === 'win32' && fs.existsSync(bravePath);

  const launchOptions = {
    headless: true,
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ]
  };

  if (useBrave) {
    launchOptions.executablePath = bravePath;
  }

  const browser = await puppeteer.launch(launchOptions);
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  try {
    await page.goto('https://tudeporte.lat/agenda.php', { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 4000));

    const partidosExtraidos = await page.evaluate(() => {
      const resultados = [];
      const contenedores = Array.from(document.querySelectorAll('div, tr, section, li')).filter(el => {
        const txt = el.innerText || '';
        return txt.toLowerCase().includes('vs') && el.querySelectorAll('a').length > 0 && el.querySelectorAll('div, tr').length < 15;
      });

      contenedores.forEach(container => {
        const textFull = container.innerText || '';
        const lowerText = textFull.toLowerCase();

        // 🛑 FILTRO 1: Ignorar de forma absoluta si dice "finalizado"
        if (lowerText.includes('finalizado')) return;

        // ✅ FILTRO 2: Validar que sea EN VIVO o contenga formato de hora (ej: 19:15, 20:30)
        const hasLive = lowerText.includes('en vivo');
        const hasTime = /\d{1,2}:\d{2}/.test(textFull);

        if (!hasLive && !hasTime) return;

        const lines = textFull.split('\n').map(l => l.trim()).filter(Boolean);
        const vsLine = lines.find(l => l.toLowerCase().includes('vs'));
        if (!vsLine) return;

        const teams = vsLine.split(/vs/i);
        if (teams.length < 2) return;
        
        let home_team = teams[0].trim().replace(/^(en vivo|\d{1,2}:\d{2})\s*/i, '');
        let away_team = teams[1].trim().replace(/(\s*(en vivo|\d{1,2}:\d{2}))$/i, '');

        if (!home_team || !away_team) return;

        const links = container.querySelectorAll('a');
        links.forEach(link => {
          const channel_name = link.innerText.trim();
          let stream_url = link.href;

          if (channel_name && stream_url && !stream_url.includes('#') && !stream_url.startsWith('javascript')) {
            // Extraer la URL interna del iframe si viene envuelta en el parámetro ?iframe=
            try {
              const urlObj = new URL(stream_url);
              const iframeParam = urlObj.searchParams.get('iframe');
              if (iframeParam) {
                stream_url = iframeParam;
              }
            } catch (e) {
              // Mantener la URL original si no se puede parsear
            }

            resultados.push({ home_team, away_team, channel_name, stream_url });
          }
        });
      });

      // Eliminar duplicados exactos
      const unicos = [];
      const map = new Set();
      resultados.forEach(r => {
        const key = `${r.home_team}-${r.away_team}-${r.channel_name}`;
        if (!map.has(key)) {
          map.add(key);
          unicos.push(r);
        }
      });

      return unicos;
    });

    console.log(`\nTotal de canales/partidos válidos encontrados: ${partidosExtraidos.length}\n`);

    if (partidosExtraidos.length > 0) {
      partidosExtraidos.forEach((item, index) => {
        console.log(`[${index + 1}] ⚽ ${item.home_team} vs ${item.away_team} | 📺 Canal: ${item.channel_name} | 🔗 Iframe: ${item.stream_url}`);
      });

      console.log("\nGuardando datos en Supabase...");

      await db.from('partidos_cartelera').delete().neq('id', 0);

      const { error } = await db.from('partidos_cartelera').insert(partidosExtraidos);
      
      if (error) {
        console.error(`Error al guardar en Supabase:`, error.message);
      } else {
        console.log(`\n✅ ¡Proceso completado! Se guardaron ${partidosExtraidos.length} registros con los enlaces de video directos.`);
      }
    } else {
      console.log("⚠️ No se encontraron partidos válidos en este momento.");
    }

  } catch (error) {
    console.error("Error en el scraper:", error);
  } finally {
    await browser.close();
    process.exit(0);
  }
}

extraerAgendaVivosYConHora();