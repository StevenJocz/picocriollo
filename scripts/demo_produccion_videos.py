"""Publica un video vertical distinto en cada cuenta creada por demo-produccion-50.py.

Uso en el servidor, desde la raíz del release:
  PICO_DEMO_PRODUCCION=50 python3 scripts/demo_produccion_videos.py

Es reanudable: registra cada trabajo y publicación en el estado privado ya creado.
No crea usuarios, no toca cuentas reales y no elimina publicaciones.
"""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
import time
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / ".data" / "demo-produccion-50.json"
CONTAINER = os.environ.get("PICO_API_CONTAINER", "pico-criollo-api")
STEP_JOB = "video-demo-v1-job"
STEP_POST = "post-video-demo-v1"


def filtro_vertical() -> str:
    """Fondo lleno + foto completa: ocupa 9:16 sin cortar el contenido principal."""
    return (
        "[0:v]scale=720:1280:force_original_aspect_ratio=increase,"
        "crop=720:1280,boxblur=24:2[bg];"
        "[0:v]scale=670:1200:force_original_aspect_ratio=decrease[fg];"
        "[bg][fg]overlay=(W-w)/2:(H-h)/2,format=yuv420p"
    )


def texto_video(indice: int, nombre: str, raza: str) -> str:
    enfoques = (
        "Un vistazo al plumaje y porte de nuestras aves",
        "Así documentamos cada ave para conservar su procedencia",
        "Conoce una de las razas registradas en nuestra granja",
        "Registro visual para acompañar la historia y el linaje",
        "Una muestra de la diversidad de aves de la comunidad",
    )
    return (
        f"[DEMOSTRACIÓN · VIDEO {indice + 1:02}] {enfoques[indice % len(enfoques)]} "
        f"en {nombre}. Raza ilustrativa: {raza}. Contenido ficticio para explorar Pico Criollo. "
        "#VideoDemo #Gallinas #PicoCriollo"
    )


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
            with urlopen(Request(base + ruta, data=datos, headers=cabeceras, method=metodo), timeout=180) as respuesta:
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


def generar_video(foto: Path, destino: Path, indice: int) -> None:
    entrada = f"/tmp/pico-demo-video-{indice:02}.input"
    salida = f"/tmp/pico-demo-video-{indice:02}.mp4"
    subprocess.run(["docker", "cp", str(foto), f"{CONTAINER}:{entrada}"], check=True)
    try:
        subprocess.run(
            [
                "docker", "exec", CONTAINER, "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-loop", "1", "-i", entrada, "-t", "6", "-r", "30", "-filter_complex", filtro_vertical(),
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-pix_fmt", "yuv420p",
                "-an", "-movflags", "+faststart", salida,
            ],
            check=True,
        )
        subprocess.run(["docker", "cp", f"{CONTAINER}:{salida}", str(destino)], check=True)
    finally:
        subprocess.run(["docker", "exec", "-u", "0", CONTAINER, "rm", "-f", entrada, salida], check=False)


def guardar(estado: dict) -> None:
    STATE.write_text(json.dumps(estado, ensure_ascii=False, indent=2), encoding="utf-8")


def esperar_video(base: str, token: str, trabajo: dict) -> str:
    for _ in range(120):
        actual = llamar(base, "GET", f"/api/media/videos/{trabajo['jobId']}", token=token, aceptar_404=True)
        if actual is None:
            raise RuntimeError("El trabajo de video ya no está disponible.")
        if actual["status"] == "ready":
            return actual["mediaId"]
        if actual["status"] == "failed":
            raise RuntimeError(actual.get("error") or "Falló el procesamiento del video.")
        time.sleep(2)
    raise TimeoutError("El video tardó más de cuatro minutos en procesarse.")


def main() -> None:
    if os.environ.get("PICO_DEMO_PRODUCCION") != "50":
        raise SystemExit("Requiere PICO_DEMO_PRODUCCION=50 para limitar la carga a las cuentas ficticias.")
    os.umask(0o077)
    estado = json.loads(STATE.read_text(encoding="utf-8"))
    manifiesto = json.loads((ROOT / "public" / "demo50" / "manifest.json").read_text(encoding="utf-8"))
    usuarios = sorted(estado.items())
    if len(usuarios) != 50 or any(not slug.startswith("muestra-") for slug, _ in usuarios):
        raise RuntimeError("El estado no contiene exactamente las 50 cuentas ficticias esperadas.")
    fuentes = manifiesto["birds"][350:400]
    if len(fuentes) != 50 or len({m["sha256"] for m in fuentes}) != 50:
        raise RuntimeError("No hay 50 imágenes distintas para producir los videos.")
    base = api_base()
    completos = 0
    with tempfile.TemporaryDirectory(prefix="pico-demo-videos-") as temporal:
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
                    print(f"[{completos:02}/50] {slug}: video ya publicado", flush=True)
                    continue
                pasos.pop(STEP_POST, None)
                guardar(estado)
            if STEP_JOB not in pasos:
                video = carpeta / f"{slug}.mp4"
                generar_video(ROOT / "public" / "demo50" / meta["file"], video, indice + 1)
                pasos[STEP_JOB] = llamar(
                    base, "POST", "/api/media/videos", token=token, archivo=video, tipo="video/mp4"
                )
                guardar(estado)
            try:
                media_id = esperar_video(base, token, pasos[STEP_JOB])
            except RuntimeError as error:
                if "ya no está disponible" not in str(error):
                    raise
                pasos.pop(STEP_JOB, None)
                guardar(estado)
                video = carpeta / f"{slug}.mp4"
                generar_video(ROOT / "public" / "demo50" / meta["file"], video, indice + 1)
                pasos[STEP_JOB] = llamar(base, "POST", "/api/media/videos", token=token, archivo=video, tipo="video/mp4")
                guardar(estado)
                media_id = esperar_video(base, token, pasos[STEP_JOB])
            nombre = auth["datos"].get("nombreUsuario") or f"Demo {indice + 1:02}"
            texto = texto_video(indice, nombre, meta.get("breed") or "Criolla")
            pasos[STEP_POST] = llamar(
                base, "POST", "/api/publicaciones-perfil", token=token,
                cuerpo={"text": texto[:600], "mediaIds": [media_id]},
            )
            guardar(estado)
            verificado = llamar(base, "GET", "/api/publicaciones-perfil/" + pasos[STEP_POST]["id"], token=token)
            if not any(m.get("kind") == "video" for m in verificado.get("media", [])):
                raise RuntimeError(f"La publicación de {slug} no devolvió un video.")
            completos += 1
            print(f"[{completos:02}/50] {slug}: video vertical publicado", flush=True)
    print("50 videos ficticios distintos publicados y verificados.", flush=True)


if __name__ == "__main__":
    main()
