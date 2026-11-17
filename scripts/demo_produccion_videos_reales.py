"""Publica 20 videos reales y licenciados de Wikimedia Commons en cuentas demo.

Uso en el servidor, desde la raíz del release:
  PICO_DEMO_PRODUCCION=50 PICO_DEMO_VIDEOS_REALES=20 \
    python3 scripts/demo_produccion_videos_reales.py

La carga es reanudable, no crea usuarios, no elimina datos y nunca toca cuentas reales.
"""

from __future__ import annotations

import html
import json
import os
import re
import subprocess
import tempfile
import time
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / ".data" / "demo-produccion-50.json"
CONTAINER = os.environ.get("PICO_API_CONTAINER", "pico-criollo-api")
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
USER_AGENT = "PicoCriolloDemo/1.0 (licensed poultry demo videos; app.stereoface.online)"
MAX_SOURCE_BYTES = 78_000_000
STEP_SOURCE = "video-real-v1-source"
STEP_JOB = "video-real-v1-job"
STEP_POST = "post-video-real-v1"

# Material real, breve y no sensible. Los últimos elementos son reservas si algún
# archivo cambia de licencia, tamaño o disponibilidad en Commons.
TITULOS_PREFERIDOS = (
    "File:A mother hen with chicks.webm",
    "File:Baby Chick Hatching.webm",
    "File:20120616Domaene Mechtildshausen03.ogv",
    "File:52 n.webm",
    "File:A Hen and rooster.ogv",
    "File:A Rooster.webm",
    "File:Ayam ketawa v.ogg",
    'File:Barata pavo, anasoj kaj kokoj en la animala rehabilitejo "Ĉe Lukomorje" 01.webm',
    "File:Bijeli stari Kemo.webm",
    "File:Birdejo en montara vilaĝo en Vjetnamio.webm",
    "File:Chicken Close-up 1 2017-09-10.webm",
    "File:Chicken Hypnosis.webm",
    "File:Crni stari Eso.webm",
    "File:Hen With Chicks.webm",
    "File:Old-style chicken market.webm",
    "File:Peafowls and chickens.webm",
    "File:Porko kaj koko en vilaĝo apud Hue.webm",
    "File:Rooster.ogv",
    "File:Sedlasi stari Driton.webm",
    "File:Struta farmo (vilaĝo Ĉikĉa, Tjumena provinco) 09.webm",
    "File:Struta farmo (vilaĝo Ĉikĉa, Tjumena provinco) 11.webm",
    "File:Video - Natürliche Aufzucht.webm",
    "File:Walking-Like-Dinosaurs-Chickens-with-Artificial-Tails-Provide-Clues-about-Non-Avian-Theropod-pone.0088458.s001.ogv",
    "File:Chicks feed2.webm",
    "File:Chicks feed3.webm",
    "File:Hühnergruppe mit Hahn im Schnee CAM00023.ogv",
    "File:Alora, gallos.webm",
)


def _limpiar_html(valor: str) -> str:
    limpio = html.unescape(re.sub(r"<[^>]+>", " ", valor or ""))
    limpio = re.sub(r"[\w.+-]+@[\w-]+\.[\w.-]+", "", limpio)
    limpio = re.sub(r"\s+", " ", limpio).strip(" ·,;-")
    return limpio


def licencia_permitida(licencia: str) -> bool:
    normal = re.sub(r"\s+", " ", (licencia or "").strip().lower())
    if "noncommercial" in normal or "no derivatives" in normal or "-nc" in normal or "-nd" in normal:
        return False
    return normal == "cc0" or "public domain" in normal or normal.startswith("cc by ") or normal.startswith("cc by-sa ")


def seleccionar_candidatos(candidatos: list[dict], cantidad: int = 20) -> list[dict]:
    salida: list[dict] = []
    titulos: set[str] = set()
    urls: set[str] = set()
    for item in candidatos:
        titulo, url = item.get("title", ""), item.get("url", "")
        if (
            not titulo or not url or titulo in titulos or url in urls
            or not licencia_permitida(item.get("license", ""))
            or item.get("mime") not in {"video/webm", "video/ogg", "application/ogg"}
            or not 0 < int(item.get("size") or 0) <= MAX_SOURCE_BYTES
        ):
            continue
        salida.append(item)
        titulos.add(titulo)
        urls.add(url)
        if len(salida) == cantidad:
            break
    return salida


def texto_publicacion(indice: int, meta: dict) -> str:
    enfoques = (
        "Gallinas recorriendo su entorno y mostrando su comportamiento natural",
        "Un registro real de aves para conocer su movimiento, porte y plumaje",
        "Pollitos y aves de corral vistos en una escena cotidiana",
        "Diversidad avícola documentada en video para nuestra comunidad",
        "Una escena real del mundo de las gallinas y sus cuidados",
    )
    autor = _limpiar_html(meta.get("author", ""))[:80] or "autor indicado en la fuente"
    licencia = _limpiar_html(meta.get("license", ""))[:40]
    fuente = meta["source"]
    texto = (
        f"[DEMOSTRACIÓN · VIDEO REAL {indice + 1:02}] {enfoques[indice % len(enfoques)]}. "
        f"Autor: {autor}. Licencia: {licencia}. Fuente: {fuente} "
        "#Gallinas #VideoReal #PicoCriollo"
    )
    return texto[:600]


def _descargar(url: str, destino: Path) -> None:
    peticion = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(peticion, timeout=180) as respuesta, destino.open("wb") as archivo:
        while True:
            bloque = respuesta.read(1024 * 1024)
            if not bloque:
                break
            archivo.write(bloque)
            if archivo.tell() > MAX_SOURCE_BYTES:
                raise RuntimeError("El archivo de origen supera el límite permitido.")


def consultar_commons() -> list[dict]:
    parametros = {
        "action": "query", "format": "json", "formatversion": 2,
        "titles": "|".join(TITULOS_PREFERIDOS), "prop": "imageinfo",
        "iiprop": "url|size|mime|extmetadata",
    }
    peticion = Request(COMMONS_API + "?" + urlencode(parametros), headers={"User-Agent": USER_AGENT})
    with urlopen(peticion, timeout=120) as respuesta:
        paginas = json.load(respuesta).get("query", {}).get("pages", [])
    por_titulo = {pagina.get("title"): pagina for pagina in paginas}
    salida = []
    for titulo in TITULOS_PREFERIDOS:
        pagina = por_titulo.get(titulo)
        if not pagina or pagina.get("missing"):
            continue
        info = (pagina.get("imageinfo") or [{}])[0]
        extra = info.get("extmetadata") or {}
        salida.append({
            "title": titulo,
            "url": info.get("url", ""),
            "source": "https://commons.wikimedia.org/?curid=" + str(pagina["pageid"]),
            "mime": info.get("mime", ""),
            "size": info.get("size", 0),
            "license": _limpiar_html((extra.get("LicenseShortName") or {}).get("value", "")),
            "licenseUrl": (extra.get("LicenseUrl") or {}).get("value", ""),
            "author": _limpiar_html((extra.get("Artist") or {}).get("value", "")),
        })
    return salida


def api_base() -> str:
    ip = subprocess.check_output(
        ["docker", "inspect", "--format", '{{(index .NetworkSettings.Networks "backend").IPAddress}}', CONTAINER],
        text=True,
    ).strip()
    return f"http://{ip}:8080"


def llamar(base: str, metodo: str, ruta: str, *, token: str | None = None,
           cuerpo: dict | None = None, archivo: Path | None = None,
           tipo: str = "application/json", aceptar_404: bool = False):
    datos = archivo.read_bytes() if archivo else (json.dumps(cuerpo).encode() if cuerpo is not None else None)
    cabeceras = {"Content-Type": tipo}
    if token:
        cabeceras["Authorization"] = "Bearer " + token
    while True:
        try:
            with urlopen(Request(base + ruta, data=datos, headers=cabeceras, method=metodo), timeout=240) as respuesta:
                contenido = respuesta.read()
                return json.loads(contenido) if contenido else None
        except HTTPError as error:
            if error.code == 429:
                time.sleep(10)
                continue
            if error.code == 404 and aceptar_404:
                return None
            detalle = error.read().decode(errors="replace")
            raise RuntimeError(f"{metodo} {ruta}: {error.code} {detalle}") from error


def normalizar_video(origen: Path, destino: Path, indice: int) -> None:
    entrada = f"/tmp/pico-video-real-{indice:02}.input"
    salida = f"/tmp/pico-video-real-{indice:02}.mp4"
    subprocess.run(["docker", "cp", str(origen), f"{CONTAINER}:{entrada}"], check=True)
    subprocess.run(["docker", "exec", "-u", "0", CONTAINER, "chmod", "644", entrada], check=True)
    try:
        subprocess.run([
            "docker", "exec", CONTAINER, "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-i", entrada, "-t", "48", "-map", "0:v:0", "-map", "0:a?", "-vf",
            "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-c:v", "libx264", "-preset", "veryfast",
            "-crf", "25", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k",
            "-movflags", "+faststart", salida,
        ], check=True)
        subprocess.run(["docker", "cp", f"{CONTAINER}:{salida}", str(destino)], check=True)
    finally:
        subprocess.run(["docker", "exec", "-u", "0", CONTAINER, "rm", "-f", entrada, salida], check=False)
    if not destino.exists() or not 0 < destino.stat().st_size < 80_000_000:
        raise RuntimeError("El video normalizado no cumple el límite de 80 MB.")


def esperar_video(base: str, token: str, trabajo: dict) -> str:
    for _ in range(180):
        actual = llamar(base, "GET", f"/api/media/videos/{trabajo['jobId']}", token=token, aceptar_404=True)
        if actual is None:
            raise RuntimeError("El trabajo de video ya no está disponible.")
        if actual["status"] == "ready":
            return actual["mediaId"]
        if actual["status"] == "failed":
            raise RuntimeError(actual.get("error") or "Falló el procesamiento del video.")
        time.sleep(2)
    raise TimeoutError("El video tardó más de seis minutos en procesarse.")


def guardar(estado: dict) -> None:
    STATE.write_text(json.dumps(estado, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    if os.environ.get("PICO_DEMO_PRODUCCION") != "50" or os.environ.get("PICO_DEMO_VIDEOS_REALES") != "20":
        raise SystemExit("Requiere PICO_DEMO_PRODUCCION=50 y PICO_DEMO_VIDEOS_REALES=20.")
    os.umask(0o077)
    estado = json.loads(STATE.read_text(encoding="utf-8"))
    usuarios = sorted(estado.items())[:20]
    if len(estado) != 50 or len(usuarios) != 20 or any(not slug.startswith("muestra-") for slug, _ in usuarios):
        raise RuntimeError("El estado no contiene las 50 cuentas ficticias esperadas.")
    fuentes = seleccionar_candidatos(consultar_commons(), 20)
    if len(fuentes) != 20:
        raise RuntimeError(f"Commons solo devolvió {len(fuentes)} videos aptos de los 20 requeridos.")
    base = api_base()
    completos = 0
    with tempfile.TemporaryDirectory(prefix="pico-videos-reales-") as temporal:
        carpeta = Path(temporal)
        for indice, ((slug, usuario), meta) in enumerate(zip(usuarios, fuentes)):
            if usuario.get("email") != f"{slug}@picocriollo.test":
                raise RuntimeError(f"La cuenta {slug} no coincide con el patrón ficticio.")
            auth = llamar(base, "POST", "/api/auth/login", cuerpo={"correo": usuario["email"], "password": usuario["password"]})
            token = auth["token"]
            if auth["datos"]["id"] != usuario["id"]:
                raise RuntimeError(f"La identidad de {slug} no coincide con el estado.")
            pasos = usuario["steps"]
            if STEP_POST in pasos:
                existente = llamar(base, "GET", "/api/publicaciones-perfil/" + pasos[STEP_POST]["id"], token=token, aceptar_404=True)
                if existente and any(m.get("kind") == "video" for m in existente.get("media", [])):
                    completos += 1
                    print(f"[{completos:02}/20] {slug}: video real ya publicado", flush=True)
                    continue
                pasos.pop(STEP_POST, None)
                guardar(estado)
            pasos[STEP_SOURCE] = meta
            if STEP_JOB not in pasos:
                original = carpeta / f"{indice:02}.origen"
                video = carpeta / f"{slug}.mp4"
                _descargar(meta["url"], original)
                normalizar_video(original, video, indice + 1)
                pasos[STEP_JOB] = llamar(base, "POST", "/api/media/videos", token=token, archivo=video, tipo="video/mp4")
                guardar(estado)
            try:
                media_id = esperar_video(base, token, pasos[STEP_JOB])
            except RuntimeError as error:
                if "ya no está disponible" not in str(error):
                    raise
                pasos.pop(STEP_JOB, None)
                guardar(estado)
                original = carpeta / f"{indice:02}.origen"
                video = carpeta / f"{slug}.mp4"
                _descargar(meta["url"], original)
                normalizar_video(original, video, indice + 1)
                pasos[STEP_JOB] = llamar(base, "POST", "/api/media/videos", token=token, archivo=video, tipo="video/mp4")
                guardar(estado)
                media_id = esperar_video(base, token, pasos[STEP_JOB])
            pasos[STEP_POST] = llamar(
                base, "POST", "/api/publicaciones-perfil", token=token,
                cuerpo={"text": texto_publicacion(indice, meta), "mediaIds": [media_id]},
            )
            guardar(estado)
            verificado = llamar(base, "GET", "/api/publicaciones-perfil/" + pasos[STEP_POST]["id"], token=token)
            if not any(m.get("kind") == "video" for m in verificado.get("media", [])):
                raise RuntimeError(f"La publicación de {slug} no devolvió un video.")
            completos += 1
            print(f"[{completos:02}/20] {slug}: video real publicado", flush=True)
    print("20 videos reales, únicos, acreditados y verificados.", flush=True)


if __name__ == "__main__":
    main()
