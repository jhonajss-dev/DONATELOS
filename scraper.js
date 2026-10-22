const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = "https://vkmpazwqyfxhdrwvqirv.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrbXBhendxeWZ4aGRyd3ZxaXJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxOTMwNjYsImV4cCI6MjEwNzc2OTA2Nn0.rLf9KOY05NAj8R9vhRWge2B1G0lWdOTF8N17UaiaVJk";

const db = createClient(SUPABASE_URL, SUPABASE_KEY);

async function extraerTodosLosCanalesAislados() {
  console.log("⚡ Iniciando extracción completa de múltiples canales por partido (Aislada)...");
  
  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  try {
    await page.goto('https://tudeporte.lat/agenda.php', { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 2500));

    // Obtener la lista total de partidos y sus índices y textos limpios
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

    console.log(`🏟️ Encontrados ${unicosMap.size} partidos únicos. Extrayendo canales reales...`);
    const partidosParaGuardar = [];

    for (let [textoPartido, domIndex] of unicosMap.entries()) {
      try {
        // Cargar agenda limpia en cada iteración
        await page.goto('https://tudeporte.lat/agenda.php', { waitUntil: 'domcontentloaded', timeout: 20000 });
        await new Promise(r => setTimeout(r, 1000));

        // PASO 1: Clic en el partido por su índice exacto
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

        // PASO 2: Obtener la cantidad de servidores desplegados específicamente debajo de este partido
        const totalOpciones = await page.evaluate((idx) => {
          const elementos = Array.from(document.querySelectorAll('a, div, span, tr')).filter(el => {
            const txt = el.innerText || '';
            return txt.toLowerCase().includes('vs') && txt.length < 100 && !txt.includes('Server:');
          });

          const targetMatch = elementos[idx];
          if (!targetMatch) return 0;

          // Recorrer los elementos hermanos siguientes hasta el próximo partido
          let current = targetMatch.nextElementSibling;
          let opcionesEncontradas = [];

          while (current) {
            const t = current.innerText || '';
            if (t.toLowerCase().includes('vs') && !t.includes('Server:')) break;
            
            if (t.includes('Server:')) {
              opcionesEncontradas.push(current);
            }
            const subOps = Array.from(current.querySelectorAll('a, button, div, tr')).filter(el => (el.innerText || '').includes('Server:'));
            subOps.forEach(so => {
              if (!opcionesEncontradas.includes(so)) opcionesEncontradas.push(so);
            });

            current = current.nextElementSibling;
          }

          return opcionesEncontradas.length;
        }, domIndex);

        const limiteOpciones = totalOpciones > 0 ? totalOpciones : 1;

        // PASO 3: Iterar estrictamente sobre las opciones de este partido
        for (let j = 0; j < limiteOpciones; j++) {
          try {
            // Re-abrir el acordeón del partido si se cerró
            await page.evaluate((idx) => {
              const elementos = Array.from(document.querySelectorAll('a, div, span, tr')).filter(el => {
                const txt = el.innerText || '';
                return txt.toLowerCase().includes('vs') && txt.length < 100 && !txt.includes('Server:');
              });
              if (elementos[idx]) elementos[idx].click();
            }, domIndex);

            await new Promise(r => setTimeout(r, 500));

            // Hacer clic en la opción 'j' específica de este partido
            const servidorInfo = await page.evaluate(([idx, optIdx]) => {
              const elementos = Array.from(document.querySelectorAll('a, div, span, tr')).filter(el => {
                const txt = el.innerText || '';
                return txt.toLowerCase().includes('vs') && txt.length < 100 && !txt.includes('Server:');
              });

              const targetMatch = elementos[idx];
              if (!targetMatch) return null;

              let current = targetMatch.nextElementSibling;
              let opcionesEncontradas = [];

              while (current) {
                const t = current.innerText || '';
                if (t.toLowerCase().includes('vs') && !t.includes('Server:')) break;
                
                if (t.includes('Server:')) opcionesEncontradas.push(current);
                const subOps = Array.from(current.querySelectorAll('a, button, div, tr')).filter(el => (el.innerText || '').includes('Server:'));
                subOps.forEach(so => {
                  if (!opcionesEncontradas.includes(so)) opcionesEncontradas.push(so);
                });

                current = current.nextElementSibling;
              }

              const listaFinal = opcionesEncontradas.length > 0 ? opcionesEncontradas : Array.from(document.querySelectorAll('a, button, tr, div, td')).filter(el => (el.innerText || '').includes('Server:') && el.offsetParent !== null);

              if (listaFinal[optIdx]) {
                const objetivo = listaFinal[optIdx].tagName === 'A' || listaFinal[optIdx].tagName === 'BUTTON' ? listaFinal[optIdx] : (listaFinal[optIdx].querySelector('a, button') || listaFinal[optIdx]);
                objetivo.click();
                return listaFinal[optIdx].innerText.replace(/\n/g, ' ').trim();
              }
              return null;
            }, [domIndex, j]);

            if (!servidorInfo) continue;
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

            console.log(`  ▶️ [${homeTeam} vs ${awayTeam}] (${servidorInfo}) -> ${streamUrl}`);

            partidosParaGuardar.push({
              home_team: homeTeam.substring(0, 50),
              home_logo: "https://via.placeholder.com/24",
              away_team: awayTeam.substring(0, 50),
              away_logo: "https://via.placeholder.com/24",
              match_time: "En Vivo",
              channel_name: servidorInfo.substring(0, 40),
              stream_url: streamUrl
            });

          } catch (subErr) {
            // Ignorar errores individuales por servidor
          }
        }

      } catch (err) {
        console.log(`⚠️ Error procesando partido: ${textoPartido}`);
      }
    }

    if (partidosParaGuardar.length > 0) {
      console.log("\n🧹 Limpiando tabla anterior en Supabase...");
      await db.from('partidos_cartelera').delete().not('home_team', 'is', null);

      console.log("📥 Insertando cartelera completa con múltiples canales...");
      const { error: insertError } = await db.from('partidos_cartelera').insert(partidosParaGuardar);
      
      if (insertError) {
        console.error("❌ Error al insertar en Supabase:", insertError.message);
      } else {
        console.log(`\n✅ ¡Cartelera actualizada con múltiples canales! (${partidosParaGuardar.length} registros en total).`);
      }
    } else {
      console.log("⚠️ No se recolectaron canales válidos para guardar.");
    }

  } catch (error) {
    console.error("❌ Error general en el scraper:", error);
  } finally {
    await browser.close();
  }
}

extraerTodosLosCanalesAislados();