const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = "https://vkmpazwqyfxhdrwvqirv.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrbXBhendxeWZ4aGRyd3ZxaXJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxOTMwNjYsImV4cCI6MjEwNzc2OTA2Nn0.rLf9KOY05NAj8R9vhRWge2B1G0lWdOTF8N17UaiaVJk";

const db = createClient(SUPABASE_URL, SUPABASE_KEY);

async function extraerConServidorPreciso() {
  console.log("⚡ Iniciando extracción precisa mediante etiqueta 'Server:'...");
  
  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  try {
    await page.goto('https://tudeporte.lat/agenda.php', { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 2500));

    // Obtener los nombres limpios de los partidos
    const partidosTextos = await page.evaluate(() => {
      const resultados = [];
      document.querySelectorAll('a, div, span, tr').forEach((el) => {
        const txt = el.innerText ? el.innerText.trim() : '';
        if (txt.toLowerCase().includes('vs') && txt.length < 100 && !txt.includes('\n\n')) {
          const limpio = txt.replace(/^[^:]*:\s*/, '').replace(/\s+EN VIVO.*/i, '').replace(/\n/g, ' ').trim();
          if (limpio.length > 3) resultados.push(limpio);
        }
      });
      return [...new Set(resultados)];
    });

    if (partidosTextos.length === 0) {
      console.log("⚠️ No se encontraron partidos en la agenda.");
      await browser.close();
      return;
    }

    console.log(`🏟️ Encontrados ${partidosTextos.length} partidos. Procesando...`);
    const partidosParaGuardar = [];

    for (let textoPartido of partidosTextos) {
      try {
        // Cargar la agenda limpia en cada iteración
        await page.goto('https://tudeporte.lat/agenda.php', { waitUntil: 'domcontentloaded', timeout: 20000 });
        await new Promise(r => setTimeout(r, 1000));

        // PASO 1: Clic en el partido para desplegar las opciones
        const desplegado = await page.evaluate((matchName) => {
          const elementos = Array.from(document.querySelectorAll('a, div, span, tr, td'));
          const target = elementos.find(el => el.innerText && el.innerText.toLowerCase().includes(matchName.toLowerCase()) && !el.innerText.includes('Server:'));
          if (target) {
            target.scrollIntoView();
            target.click();
            return true;
          }
          return false;
        }, textoPartido);

        if (!desplegado) continue;

        // Esperar a que aparezcan los botones con "Server:"
        await new Promise(r => setTimeout(r, 1500));

        // PASO 2: Hacer clic en la primera opción de servidor desplegada
        const servidorClickeado = await page.evaluate(() => {
          const opciones = Array.from(document.querySelectorAll('a, tr, div, td')).filter(el => {
            const txt = el.innerText || '';
            return txt.includes('Server:') && el.offsetParent !== null;
          });

          if (opciones.length > 0) {
            opciones[0].click();
            return opciones[0].innerText.replace(/\n/g, ' ').trim();
          }
          return null;
        });

        // Esperar a que el reproductor superior cargue el iframe de ese canal
        await new Promise(r => setTimeout(r, 2000));

        // PASO 3: Extraer la URL del iframe activo
        const streamUrl = await page.evaluate(() => {
          const iframes = Array.from(document.querySelectorAll('iframe'));
          for (let f of iframes) {
            const src = f.src || '';
            if (src && !src.includes('live-banner') && !src.includes('ads') && !src.includes('banner') && !src.includes('facebook') && !src.includes('google')) {
              return src;
            }
          }
          return null;
        });

        if (!streamUrl || streamUrl.includes('agenda.php')) {
          console.log(`⚠️ Sin stream válido para: ${textoPartido}`);
          continue;
        }

        const partes = textoPartido.split(/ vs /i);
        const homeTeam = partes[0] ? partes[0].trim() : textoPartido;
        const awayTeam = partes[1] ? partes[1].trim() : '';

        console.log(`▶️ [${homeTeam} vs ${awayTeam}] (${servidorClickeado || 'Servidor'}) -> ${streamUrl}`);

        partidosParaGuardar.push({
          home_team: homeTeam.substring(0, 50),
          home_logo: "https://via.placeholder.com/24",
          away_team: awayTeam.substring(0, 50),
          away_logo: "https://via.placeholder.com/24",
          match_time: "En Vivo",
          channel_name: (servidorClickeado || "Canal Principal").substring(0, 40),
          stream_url: streamUrl
        });

      } catch (err) {
        console.log(`⚠️ Error procesando: ${textoPartido}`);
      }
    }

    if (partidosParaGuardar.length > 0) {
      await db.from('partidos_cartelera').delete().neq('id', 0);
      await db.from('partidos_cartelera').insert(partidosParaGuardar);
      console.log(`\n✅ Cartelera actualizada en Supabase con canales independientes (${partidosParaGuardar.length} registros).`);
    }

  } catch (error) {
    console.error("❌ Error en el scraper:", error);
  } finally {
    await browser.close();
  }
}

extraerConServidorPreciso();