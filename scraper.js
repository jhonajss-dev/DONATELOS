const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const SUPABASE_URL = "https://vkmpazwqyfxhdrwvqirv.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrbXBhendxeWZ4aGRyd3ZxaXJ2Iiwicm9sZSI6InBhbm9uIiwiaWF0IjoxNzkyMTkzMDY2LCJleHAiOjIxMDc3NjkwNjZ9.rLf9KOY05NAj8R9vhRWge2B1G0lWdOTF8N17UaiaVJk";

const db = createClient(SUPABASE_URL, SUPABASE_KEY);

async function extraerSoloElIframeDelReproductor() {
  console.log("⚡ Iniciando extracción directa con selector id='embed'...");
  
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

    // 1. Extraer los enlaces base de la cartelera
    const enlacesPreliminares = await page.evaluate(() => {
      const resultados = [];
      const contenedores = Array.from(document.querySelectorAll('div, tr, section, li')).filter(el => {
        const txt = el.innerText || '';
        return txt.toLowerCase().includes('vs') && el.querySelectorAll('a').length > 0 && el.querySelectorAll('div, tr').length < 15;
      });

      contenedores.forEach(container => {
        const textFull = container.innerText || '';
        const lowerText = textFull.toLowerCase();

        if (lowerText.includes('finalizado')) return;

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
          const page_url = link.href;
          if (channel_name && page_url && !page_url.includes('#') && !page_url.startsWith('javascript')) {
            resultados.push({ home_team, away_team, channel_name, page_url });
          }
        });
      });

      return resultados;
    });

    console.log(`\n📋 Se encontraron ${enlacesPreliminares.length} opciones. Obteniendo iframe con id='embed'...\n`);

    const partidosFinales = [];
    const mapUnicos = new Set();

    // 2. Extraer directamente el selector id="embed"
    for (const item of enlacesPreliminares) {
      try {
        await page.goto(item.page_url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        
        // Espera a que el selector #embed esté listo en el DOM
        await page.waitForSelector('iframe#embed', { timeout: 8000 }).catch(() => {});

        const iframeSrc = await page.evaluate(() => {
          // Busca específicamente el iframe con id="embed"
          const embedIframe = document.querySelector('iframe#embed');
          return embedIframe ? embedIframe.src : null;
        });

        if (iframeSrc) {
          const key = `${item.home_team}-${item.away_team}-${item.channel_name}`;
          if (!mapUnicos.has(key)) {
            mapUnicos.add(key);
            partidosFinales.push({
              home_team: item.home_team,
              away_team: item.away_team,
              channel_name: item.channel_name,
              stream_url: iframeSrc
            });
            console.log(`[⚽] ${item.home_team} vs ${item.away_team} | [📺] ${item.channel_name} -> 🔗 ${iframeSrc}`);
          }
        }
      } catch (err) {
        console.log(`⚠️ No se pudo extraer el reproductor de: ${item.channel_name}`);
      }
    }

    if (partidosFinales.length > 0) {
      console.log("\nGuardando únicamente las URLs de los reproductores reales en Supabase...");

      await db.from('partidos_cartelera').delete().neq('id', 0);

      const { error } = await db.from('partidos_cartelera').insert(partidosFinales);
      
      if (error) {
        console.error(`Error al guardar en Supabase:`, error.message);
      } else {
        console.log(`\n✅ ¡Proceso completado! Se guardaron ${partidosFinales.length} reproductores reales.`);
      }
    } else {
      console.log("⚠️ No se encontraron reproductores válidos en este momento.");
    }

  } catch (error) {
    console.error("Error en el scraper:", error);
  } finally {
    await browser.close();
    process.exit(0);
  }
}

extraerSoloElIframeDelReproductor();