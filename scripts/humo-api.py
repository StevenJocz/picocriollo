#!/usr/bin/env python3
"""
Prueba de humo de la API de Pico Criollo contra una API que ya está en marcha (con PostgreSQL real, en el servidor, o la de desarrollo).
Recorre lo esencial de punta a punta: registro, granja, mercado (compra directa con traspaso y subasta), perfil social y notificaciones.

    python3 scripts/humo-api.py http://127.0.0.1:5188

Crea dos cuentas nuevas con correos «humo-<hora>-…@correo.test» y algunos registros (no los borra: bórralos con tus herramientas si ya
no los quieres). Sale con código 0 si todo pasó y 1 si algo falló. No imprime contraseñas ni tokens.
"""
import json
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5188").rstrip("/")
SUFIJO = str(int(time.time()))
CLAVE = "una-clave-bien-larga-1"
fallos: list[str] = []
pasos = 0


def llamar(metodo, ruta, cuerpo=None, token=None, esperado=(200, 204)):
    peticion = urllib.request.Request(
        BASE + ruta, method=metodo, data=json.dumps(cuerpo).encode() if cuerpo is not None else None,
        headers={"Content-Type": "application/json", **({"Authorization": f"Bearer {token}"} if token else {})},
    )
    try:
        with urllib.request.urlopen(peticion, timeout=30) as r:
            texto = r.read()
            estado = r.status
    except urllib.error.HTTPError as e:
        texto, estado = e.read(), e.code
    datos = json.loads(texto) if texto else None
    if estado not in esperado:
        raise AssertionError(f"{metodo} {ruta} respondió {estado}: {datos}")
    return datos


def paso(nombre):
    def decorador(funcion):
        global pasos
        pasos += 1
        try:
            funcion()
            print(f"  ok   {nombre}")
        except Exception as e:  # noqa: BLE001 - el resumen debe seguir aunque un paso falle
            fallos.append(f"{nombre}: {e}")
            print(f"  FALLÓ {nombre}: {e}")
        return funcion
    return decorador


def registrar(nombre):
    r = llamar("POST", "/api/auth/registro", {"correo": f"humo-{SUFIJO}-{nombre}@correo.test", "password": CLAVE, "nombreUsuario": f"Humo {nombre} {SUFIJO[-5:]}", "ciudad": "Medellín", "departamento": "Antioquia"})
    return r["token"], r["datos"]["id"]


print(f"Probando {BASE}")
estado = {}


@paso("la API responde y ve la base de datos")
def _():
    assert llamar("GET", "/api/health")["database"] == "connected"


@paso("dos cuentas se registran")
def _():
    estado["ana"], estado["ana_id"] = registrar("ana")
    estado["beto"], estado["beto_id"] = registrar("beto")


@paso("ingresar con la contraseña y renovar la sesión")
def _():
    r = llamar("POST", "/api/auth/login", {"correo": f"humo-{SUFIJO}-ana@correo.test", "password": CLAVE})
    nuevo = llamar("POST", "/api/auth/refrescar", {"refreshToken": r["refreshToken"]})
    assert nuevo["token"] and nuevo["refreshToken"] != r["refreshToken"]


@paso("granja: gallinero, dos aves, anillo y evento de salud")
def _():
    ana = estado["ana"]
    g = llamar("POST", "/api/granja/gallineros", {"name": "Corral de humo", "capacity": 10}, ana)["id"]
    estado["ave1"] = llamar("POST", "/api/granja/aves", {"name": "Rojo", "sex": "Gallo", "coopId": g, "breed": "Pico criollo"}, ana)["id"]
    estado["ave2"] = llamar("POST", "/api/granja/aves", {"name": "Pintada", "sex": "Gallina", "coopId": g}, ana)["id"]
    llamar("POST", "/api/granja/anillos/asignar", {"number": 77, "birdId": estado["ave1"]}, ana)
    llamar("POST", "/api/granja/eventos-ave", {"birdId": estado["ave1"], "kind": "Salud", "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"), "title": "Revisión de humo"}, ana)
    granja = llamar("GET", "/api/granja", token=ana)
    assert any(r["number"] == 77 for r in granja["datos"]["rings"])


@paso("mercado: publicar a precio fijo y verlo sin sesión")
def _():
    estado["publicacion"] = llamar("POST", "/api/mercado/publicaciones", {"kind": "fixed", "birdId": estado["ave1"], "price": 150000, "publish": True}, estado["ana"])["id"]
    lista = llamar("GET", "/api/mercado?q=rojo")
    assert any(p["id"] == estado["publicacion"] for p in lista["items"])


@paso("mercado: compra directa hasta el traspaso, comprobante y factura")
def _():
    ana, beto = estado["ana"], estado["beto"]
    op = llamar("POST", f"/api/mercado/publicaciones/{estado['publicacion']}/solicitud", {"message": "¿Sigue disponible?"}, beto)["id"]
    llamar("POST", f"/api/operaciones/{op}/responder", {"decision": "accept"}, ana)
    llamar("POST", f"/api/operaciones/{op}/pago", {"method": "Nequi"}, beto)
    llamar("POST", f"/api/operaciones/{op}/confirmar-pago", token=ana)
    llamar("POST", f"/api/operaciones/{op}/entrega", token=ana)
    recibo = llamar("POST", f"/api/operaciones/{op}/recepcion", token=beto)
    assert recibo["status"] == "completada"
    assert llamar("GET", f"/api/comprobantes/{recibo['receiptCode']}", token=beto)["integrity"] is True
    factura = llamar("GET", "/api/facturas", token=ana)[0]["number"]
    assert llamar("GET", f"/api/facturas/{factura}", token=ana)["integrity"] is True
    aves_beto = llamar("GET", "/api/granja", token=beto)["datos"]["birds"]
    assert any(a["id"] == estado["ave1"] and a["status"] == "Activo" for a in aves_beto)
    assert llamar("GET", f"/api/aves/{estado['ave1']}/procedencia", token=beto)["owners"][-1]["mine"] is True


@paso("mercado: subasta con oferta idempotente")
def _():
    ana, beto = estado["ana"], estado["beto"]
    cierra = (datetime.now(timezone.utc) + timedelta(days=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
    id_ = llamar("POST", "/api/mercado/publicaciones", {"kind": "auction", "birdId": estado["ave2"], "publish": True, "auction": {"startingPrice": 80000, "closesAt": cierra}}, ana)["id"]
    clave = f"humo-{SUFIJO}-1"
    llamar("POST", f"/api/mercado/publicaciones/{id_}/ofertas", {"amount": 80000, "idempotencyKey": clave}, beto)
    llamar("POST", f"/api/mercado/publicaciones/{id_}/ofertas", {"amount": 80000, "idempotencyKey": clave}, beto)
    detalle = llamar("GET", f"/api/mercado/{id_}", token=beto)
    assert len(detalle["bids"]) == 1 and detalle["viewer"]["isTopBidder"] is True
    llamar("POST", f"/api/mercado/publicaciones/{id_}/ofertas", {"amount": 200000, "idempotencyKey": f"{clave}-propia"}, ana, esperado=(403,))


@paso("perfil social: publicar, me gusta, comentar, seguir y reels")
def _():
    ana, beto = estado["ana"], estado["beto"]
    post = llamar("POST", "/api/publicaciones-perfil", {"text": "Mis gallos al amanecer #gallos"}, ana)["id"]
    llamar("PUT", f"/api/publicaciones-perfil/{post}/me-gusta", {"liked": True}, beto)
    llamar("POST", f"/api/publicaciones-perfil/{post}/comentarios", {"text": "¡Qué hermosos!"}, beto)
    seguir = llamar("POST", f"/api/perfiles/{estado['ana_id']}/seguir", token=beto)
    assert seguir["followers"] == 1
    feed = llamar("GET", "/api/reels?limite=10", token=beto)
    assert any(i["id"] == post for i in feed["items"])
    assert llamar("GET", f"/api/publicaciones-perfil/{post}", token=ana)["likes"] == 1


@paso("notificaciones: llegan los avisos de las acciones anteriores")
def _():
    ana = estado["ana"]
    limite = time.time() + 60
    while time.time() < limite:
        avisos = llamar("GET", "/api/notificaciones?limite=50", token=ana)
        tipos = {a["type"] for a in avisos}
        if {"market.purchase.requested", "profile.post.liked"} <= tipos:
            return
        time.sleep(3)
    raise AssertionError(f"no llegaron los avisos esperados en 60 s (llegaron: {sorted({a['type'] for a in avisos})})")


@paso("mercado: huevos e insumos transfieren existencias y generan comprobante")
def _():
    ana, beto = estado["ana"], estado["beto"]
    gallinero = llamar("GET", "/api/granja", token=ana)["datos"]["coops"][0]["id"]
    recoleccion = llamar("POST", "/api/granja/recolecciones", {
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"), "coopId": gallinero,
        "eggs": 12, "consumption": 12,
    }, ana)["id"]
    huevos = llamar("POST", "/api/granja/lotes-huevos", {
        "collectionId": recoleccion, "quantity": 12, "destination": "Consumo",
    }, ana)["id"]
    insumo = llamar("POST", "/api/granja/productos", {
        "name": "Maiz de humo", "category": "Alimento", "unit": "kg", "price": 2500, "available": 12,
    }, ana)["id"]
    for tipo, origen, coleccion in [("lote_huevos", huevos, "fertileLots"), ("insumo", insumo, "customProducts")]:
        publicacion = llamar("POST", "/api/mercado/publicaciones", {
            "kind": "fixed", "itemType": tipo, "lotId": origen, "quantity": 4, "price": 10000, "publish": True,
        }, ana)["id"]
        llamar("POST", "/api/mercado/publicaciones", {
            "kind": "fixed", "itemType": tipo, "lotId": origen, "quantity": 9, "price": 20000, "publish": True,
        }, ana, esperado=(409,))
        op = llamar("POST", f"/api/mercado/publicaciones/{publicacion}/solicitud", {}, beto)["id"]
        llamar("POST", f"/api/operaciones/{op}/responder", {"decision": "accept"}, ana)
        llamar("POST", f"/api/operaciones/{op}/pago", {"method": "Efectivo"}, beto)
        llamar("POST", f"/api/operaciones/{op}/confirmar-pago", token=ana)
        llamar("POST", f"/api/operaciones/{op}/entrega", token=ana)
        recibo = llamar("POST", f"/api/operaciones/{op}/recepcion", token=beto)
        assert recibo["status"] == "completada"
        assert llamar("GET", f"/api/comprobantes/{recibo['receiptCode']}", token=beto)["integrity"] is True
        vendedor = llamar("GET", "/api/granja", token=ana)["datos"][coleccion]
        comprador = llamar("GET", "/api/granja", token=beto)["datos"][coleccion]
        assert next(i for i in vendedor if i["id"] == origen)["available"] == 8
        assert sum(i["available"] for i in comprador) == 4


print()
if fallos:
    print(f"{len(fallos)} de {pasos} pasos fallaron:")
    for f in fallos:
        print(f"  - {f}")
    sys.exit(1)
print(f"Todo bien: {pasos} pasos.")
