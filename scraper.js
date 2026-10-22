const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = "https://vkmpazwqyfxhdrwvqirv.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrbXBhendxeWZ4aGRyd3ZxaXJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxOTMwNjYsImV4cCI6MjEwNzc2OTA2Nn0.rLf9KOY05NAj8R9vhRWge2B1G0lWdOTF8N17UaiaVJk";

const db = createClient(SUPABASE_URL, SUPABASE_KEY);

async function extraerTodosLosCanalesCorregido() {
  console.log("⚡ Iniciando extracción corregida de múltiples canales por partido...");
  
  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  try {
    await page.goto('https://tudeporte.lat/agenda.php', { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 2500));

    const totalPartidos = await page.evaluate(() => {
      const elementos = Array.from(document.querySelectorAll('a, div, span, tr')).filter(el => {
        const txt = el.innerText || '';
        return txt.toLowerCase().includes('vs') && txt.length < 100 && !txt.includes('Server:');
      });
      
      const lista = [];
      elementos.forEach((el, index) => {
        const txt = el.innerText.replace(/\n/g, ' ').trim();
        const limpio = txt.replace(/^[^:]*:\s*/, '').replace(/\s+EN VIVO.*/i, '').trim();
        if (limpio.length > 3) {
          lista.push({ index, texto: limpio });
        }
      });
      return lista;
    });

    const unicosMap = new Map();
    totalPartidos.forEach(p => {
      if (!unicosMap.has(p.texto)) {
        unicosMap.set(p.texto, p.index);
      }
    });

    console.log(`🏟️ Encontrados ${unicosMap.size} partidos únicos. Procesando...`);
    const partidosParaGuardar = [];

    for (let [textoPartido, domIndex] of unicosMap.entries()) {
      try {
        await page.goto('https://tudeporte.lat/agenda.php', { waitUntil: 'domcontentloaded', timeout: 20000 });
        await new Promise(r => setTimeout(r, 1000));

        // 1. Clic en el partido UNA SOLA VEZ para abrir el acordeón
        const clickExitoso = await page.evaluate((idx) => {
          const elementos = Array.from(document.querySelectorAll('a, div, span, tr')).filter(el => {
            const txt = el.innerText || '';
            return txt.toLowerCase().includes('vs') && txt.length < 100 && !txt.includes('Server:');
          });

          if (elementos[idx]) {
            elementos[idx].scrollIntoView();
            elementos[idx].click();
            return true;
          }
          return false;
        }, domIndex);

        if (!clickExitoso) continue;
        await new Promise(r => setTimeout(r, 1500));

        // 2. Contar cuántos botones de servidor hay disponibles en pantalla
        const totalServidores = await page.evaluate(() => {
          const botones = Array.from(document.querySelectorAll('a, button, div, span')).filter(el => {
            const t = el.innerText || '';
            return (t.includes('Server') || t.includes('OPC') || t.includes('Disney') || t.includes('ESPN')) && el.offsetParent !== null;
          });
          return botones.length;
        });

        const limite = totalServidores > 0 ? totalServidores : 1;

        // 3. Iterar sobre cada opción de servidor sin cerrar el partido
        for (let j = 0; j < limite; j++) {
          try {
            const infoServidor = await page.evaluate((optIndex) => {
              const botones = Array.from(document.querySelectorAll('a, button, div, span')).filter(el => {
                const t = el.innerText || '';
                return (t.includes('Server') || t.includes('OPC') || t.includes('Disney') || t.includes('ESPN')) && el.offsetParent !== null;
              });

              if (botones[optIndex]) {
                botones[optIndex].click();
                let raw = botones[optIndex].innerText || `Servidor ${optIndex + 1}`;
                return raw.split('\n')[0].replace(/Server:.*/gi, '').replace(/Calidad.*/gi, '').trim() || `Servidor ${optIndex + 1}`;
              }
              return null;
            }, j);

            if (!infoServidor) continue;
            await new Promise(r => setTimeout(r, 2000));

            // Extraer el iframe activo correspondiente
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

            if (!streamUrl || streamUrl.includes('agenda.php')) continue;

            const partes = textoPartido.split(/ vs /i);
            const homeTeam = partes[0] ? partes[0].trim() : textoPartido;
            const awayTeam = partes[1] ? partes[1].trim() : '';

            console.log(`  ▶️ [${homeTeam} vs ${awayTeam}] (${infoServidor}) -> ${streamUrl}`);

            partidosParaGuardar.push({
              home_team: homeTeam.substring(0, 50),
              home_logo: "https://via.placeholder.com/24",
              away_team: awayTeam.substring(0, 50),
              away_logo: "https://via.placeholder.com/24",
              match_time: "En Vivo",
              channel_name: infoServidor.substring(0, 40),
              stream_url: streamUrl
            });

          } catch (subErr) {
            // Ignorar error individual de servidor
          }
        }

      } catch (err) {
        console.log(`⚠️ Error procesando partido: ${textoPartido}`);
      }
    }

    if (partidosParaGuardar.length > 0) {
      console.log("\n🧹 Limpiando tabla anterior en Supabase...");
      await db.from('partidos_cartelera').delete().not('home_team', 'is', null);

      console.log("📥 Insertando todos los canales extraídos...");
      const { error: insertError } = await db.from('partidos_cartelera').insert(partidosParaGuardar);
      
      if (insertError) {
        console.error("❌ Error en Supabase:", insertError.message);
      } else {
        console.log(`\n✅ ¡Cartelera actualizada con éxito! (${partidosParaGuardar.length} registros totales).`);
      }
    } else {
      console.log("⚠️ No se recolectaron canales válidos.");
    }

  } catch (error) {
    console.error("❌ Error general:", error);
  } finally {
    await browser.close();
  }
}

extraerTodosLosCanalesCorregido();