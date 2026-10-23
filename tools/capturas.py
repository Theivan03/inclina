# Genera las capturas de tienda y el gráfico de portada a partir de la propia app (www/),
# con una salida simulada y dos salidas de ejemplo en el histórico.
# Uso: pip install playwright && playwright install chromium && python3 tools/capturas.py
import asyncio, subprocess, sys, time, os, json
from playwright.async_api import async_playwright

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "www")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tienda", "capturas")
GFX = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tienda", "graficos")
PORT = 8766

def example_rides(now_ms):
    day = 86400000
    def ride(start, maxL, maxR, vmax, dist, corners):
        cs, t = [], start + 240000
        for side, peak, v, dur in corners:
            t += 45000
            cs.append({"t": t, "side": side, "peak": peak, "v": v, "dur": dur})
        return {"id": start, "start": start, "end": start + 52 * 60000, "maxL": maxL, "maxR": maxR, "vMax": vmax, "dist": dist, "corners": cs}
    return [
        ride(now_ms - 3 * day + 3600000 * 9, 38.4, 41.2, 112, 46.3, [("D", 41.2, 78, 4.1), ("I", 38.4, 71, 3.6), ("I", 33.0, 64, 5.2), ("D", 36.7, 69, 3.9), ("D", 29.5, 58, 2.8), ("I", 35.1, 66, 4.4)]),
        ride(now_ms - 8 * day + 3600000 * 10, 34.9, 37.8, 104, 39.0, [("I", 34.9, 69, 4.0), ("D", 37.8, 74, 3.7), ("D", 31.2, 61, 3.1), ("I", 30.6, 63, 4.6)]),
    ]

async def main():
    os.makedirs(OUT, exist_ok=True); os.makedirs(GFX, exist_ok=True)
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1"], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
    base = f"http://127.0.0.1:{PORT}/index.html"
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch()
            for tag, vw, vh in (("android", 360, 800), ("ios", 430, 932)):
                for scheme in ("dark", "light"):
                    ctx = await b.new_context(viewport={"width": vw, "height": vh}, device_scale_factor=3, color_scheme=scheme, is_mobile=True, has_touch=True)
                    page = await ctx.new_page()
                    await page.goto(base, wait_until="networkidle")
                    now_ms = int(time.time() * 1000)
                    await page.evaluate("r => localStorage.setItem('inclina.rides', JSON.stringify(r))", example_rides(now_ms))
                    await page.reload(wait_until="networkidle")
                    await page.click(".tab[data-view=settings]")
                    await page.click("#btnDemo")
                    await page.wait_for_timeout(9800)   # curva izquierda mantenida a 60 km/h
                    await page.screenshot(path=f"{OUT}/{tag}-{scheme}-1-marcha.png")
                    if scheme == "dark":
                        await page.wait_for_timeout(31000)  # fin de la salida → resumen
                        await page.screenshot(path=f"{OUT}/{tag}-{scheme}-2-resumen.png")
                        await page.click("#btnBack")
                        await page.wait_for_timeout(300)
                        await page.screenshot(path=f"{OUT}/{tag}-{scheme}-3-salidas.png")
                        await page.click(".tab[data-view=settings]")
                        await page.wait_for_timeout(300)
                        await page.screenshot(path=f"{OUT}/{tag}-{scheme}-4-ajustes.png")
                    await ctx.close()
            # Gráfico de portada de Google Play (1024 × 500) renderizado con las fuentes de la app
            ctx = await b.new_context(viewport={"width": 1024, "height": 500}, device_scale_factor=1, color_scheme="dark")
            page = await ctx.new_page()
            await page.goto(base, wait_until="networkidle")
            await page.evaluate("""() => {
              document.querySelector('.app').hidden = true; document.querySelector('.tabs').hidden = true;
              const d = document.createElement('div');
              d.innerHTML = `<div style="position:fixed;inset:0;background:#0d1014;display:grid;grid-template-columns:460px 1fr;align-items:center;padding:0 64px;gap:24px">
                <div class="gauge" style="max-width:460px;margin:0"><svg viewBox="0 0 320 192" id="fgSvg"></svg>
                  <div class="readout"><span class="num" style="font-size:112px">36</span><span class="deg">°</span><div class="side r">Derecha</div></div></div>
                <div style="font-family:var(--font-display);color:#f2f4f7">
                  <div style="font-weight:700;font-size:92px;line-height:.95;letter-spacing:-.01em">INCLINA</div>
                  <div style="font-weight:500;font-size:34px;color:#98a2ae;margin-top:10px;line-height:1.15">Ángulo de inclinación en vivo.<br>Máximos por curva. Sin anuncios.</div>
                </div></div>`;
              document.body.appendChild(d);
              const g = document.querySelector('#gaugeSvg'); const f = document.querySelector('#fgSvg'); f.innerHTML = g.innerHTML;
              const CX=160,CY=178,R=140; const pt=(a,r)=>[CX+r*Math.sin(a*Math.PI/180),CY-r*Math.cos(a*Math.PI/180)];
              const arc=(r,a0,a1)=>{const p0=pt(a0,r),p1=pt(a1,r);return 'M'+p0[0]+' '+p0[1]+' A'+r+' '+r+' 0 0 1 '+p1[0]+' '+p1[1]};
              f.querySelector('.fill').setAttribute('d', arc(R,0,36));
              const mk=(a)=>{const t=pt(a,R+8),b1=pt(a-2.2,R+24),b2=pt(a+2.2,R+24);return 'M'+t[0]+' '+t[1]+' L'+b1[0]+' '+b1[1]+' L'+b2[0]+' '+b2[1]+' Z'};
              f.querySelector('.mark.l').setAttribute('d', mk(-30)); f.querySelector('.mark.r').setAttribute('d', mk(36));
            }""")
            await page.wait_for_timeout(500)
            await page.screenshot(path=f"{GFX}/portada-1024x500.png")
            await ctx.close()
            await b.close()
    finally:
        srv.terminate()
    print("ok")

asyncio.run(main())
