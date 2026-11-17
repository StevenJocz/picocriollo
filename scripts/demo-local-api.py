"""Carga demostraciones mediante la API local. No accede a producción ni borra datos.
Ejecutar: python scripts/demo-local-api.py
Las cuentas y sus contenidos desaparecen al reiniciar la API en memoria.
"""
import json
from pathlib import Path
from datetime import datetime, timedelta, timezone
from urllib.request import Request, urlopen
from urllib.error import HTTPError

BASE = 'http://127.0.0.1:5188'
ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / '.data' / 'demo-local-api.json'
PASSWORD = 'DemoCriollo2026!'
saved = json.loads(STATE.read_text(encoding='utf-8')) if STATE.exists() else {}
now = datetime.now(timezone.utc)
def day(offset=0):
    return (now + timedelta(days=offset)).strftime('%Y-%m-%d')

def call(method, route, body=None, token=None, image=None):
    data = image.read_bytes() if image else (json.dumps(body).encode() if body is not None else None)
    headers = {'Content-Type': 'image/jpeg' if image else 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    try:
        with urlopen(Request(BASE + route, data=data, headers=headers, method=method), timeout=30) as response:
            content = response.read()
            return json.loads(content) if content else None
    except HTTPError as error:
        raise RuntimeError(f'{method} {route}: {error.code} {error.read().decode()}') from error

def store():
    STATE.parent.mkdir(exist_ok=True)
    STATE.write_text(json.dumps(saved, ensure_ascii=False, indent=2), encoding='utf-8')

users = []
for index, (slug, name, city, region, kind) in enumerate([
    ('alba', 'Demo - Granja Alba', 'Medellín', 'Antioquia', 'fixed'),
    ('pradera', 'Demo - La Pradera', 'Pereira', 'Risaralda', 'auction'),
    ('robles', 'Demo - Los Robles', 'Manizales', 'Caldas', 'interest'),
]):
    email = f'demo.{slug}@picocriollo.test'
    try:
        auth = call('POST', '/api/auth/login', {'correo': email, 'password': PASSWORD})
    except RuntimeError as error:
        if ': 401 ' not in str(error):
            raise
        auth = call('POST', '/api/auth/registro', {'correo': email, 'password': PASSWORD,
                    'nombreUsuario': name, 'ciudad': city, 'departamento': region})
    token, uid = auth['token'], auth['datos']['id']
    if saved.get(slug, {}).get('id') != uid:
        saved[slug] = {'id': uid, 'steps': {}}
    steps = saved[slug]['steps']
    def step(key, route, body=None, image=None, method='POST'):
        if key not in steps:
            steps[key] = call(method, route, body, token, image)
            store()
        return steps[key]
    def photo(key, filename, purpose='post'):
        return step(key, '/api/media?uso=' + purpose, image=ROOT / 'public' / 'seed' / filename)

    photo('avatar', f'avatar-{slug}.jpg', 'avatar')
    coops = [step(f'coop-{n}', '/api/granja/gallineros', {'name': label, 'capacity': 30,
             'type': typ, 'status': 'Activo', 'startedAt': day(-180), 'location': city,
             'notes': 'Gallinero de demostración; datos ficticios.'})['id']
             for n, (label, typ) in enumerate([('Demo - Reproductores', 'Pastoril'), ('Demo - Cría', 'Cría')])]
    birds = []
    for n, (birdname, sex) in enumerate([('Trueno', 'Gallo'), ('Canela', 'Gallina'),
                                       ('Aurora', 'Gallina'), ('Pintada', 'Gallina'), ('Lucero', 'Gallo')]):
        picture = photo(f'bird-photo-{n}', f'bird-{1 + (index * 5 + n) % 7:02}.jpg', 'bird')
        body = {'name': birdname, 'sex': sex, 'coopId': coops[0], 'breed': 'Criolla',
                'status': 'Activo', 'bornAt': day(-600 if n < 2 else -240),
                'photo': picture['url'], 'origin': 'Nacimiento de demostración',
                'notes': 'Ave ficticia para probar la aplicación; foto ilustrativa.'}
        if n >= 2:
            body.update(fatherId=birds[0], motherId=birds[1])
        bird = step(f'bird-{n}', '/api/granja/aves', body)['id']
        birds.append(bird)
        step(f'ring-{n}', '/api/granja/anillos/asignar', {'number': n + 1, 'birdId': bird})
    step('group', '/api/granja/grupos-reproductores', {'name': 'Demo - Familia criolla',
         'coopId': coops[0], 'breed': 'Criolla', 'roosterId': birds[0], 'henIds': [birds[1]],
         'startedAt': day(-300), 'status': 'Activo'})
    collection = step('eggs', '/api/granja/recolecciones', {'date': day(), 'coopId': coops[0],
         'henId': birds[1], 'eggs': 12, 'sale': 6, 'consumption': 6, 'notes': 'Recolección de demostración.'})['id']
    egg_lot = step('egg-lot', '/api/granja/lotes-huevos', {'collectionId': collection,
         'quantity': 6, 'destination': 'Consumo', 'breed': 'Criolla'})['id']
    supply = step('supply', '/api/granja/productos', {'name': 'Demo - Maíz',
         'category': 'Alimento', 'unit': 'kg', 'price': 2500, 'available': 20})['id']
    incubation = step('incubation', '/api/granja/incubaciones', {'type': 'Artificial',
         'equipment': 'Incubadora demo', 'coopId': coops[1], 'startedAt': day(-28),
         'eggs': 15, 'hatched': 12, 'removed': 3, 'status': 'Finalizada'})['id']
    birth = step('birth', '/api/granja/nacimientos', {'incubationId': incubation, 'date': day(-7),
         'count': 12, 'motherId': birds[1], 'fatherId': birds[0], 'parentageStatus': 'Confirmada',
         'coopId': coops[1], 'breed': 'Criolla', 'notes': 'Linaje ficticio de demostración.'})['id']
    farm = call('GET', '/api/granja', token=token)['datos']
    lot = next(lot['id'] for lot in farm['chickLots'] if lot['birthId'] == birth)
    for typ, source, price in [('ave', {'birdId': birds[2]}, 90000),
                              ('lote_aves', {'birdIds': birds[3:5]}, 180000),
                              ('lote_pollitos', {'lotId': lot, 'quantity': 6}, 60000),
                              ('lote_huevos', {'lotId': egg_lot, 'quantity': 6}, 12000),
                              ('insumo', {'lotId': supply, 'quantity': 5}, 12500)]:
        body = {'kind': kind, 'itemType': typ, **source, 'publish': True,
                'price': price if kind == 'fixed' else 0,
                'terms': 'DEMOSTRACIÓN: anuncio ficticio. No realizar pagos ni coordinar entregas.',
                'consent': {'description': 'Ejemplo de publicación de prueba con procedencia registrada.',
                            'deliveryZone': city, 'showPhoto': True, 'showGenealogy': True,
                            'showReproduction': True, 'showBreeder': True}}
        if kind == 'auction':
            body['auction'] = {'startingPrice': price, 'minIncrement': 5000,
                               'closesAt': (now + timedelta(days=3)).isoformat(), 'antiSniping': True}
        step('listing-' + typ, '/api/mercado/publicaciones', body)
    posts = []
    for n, (text, filenames) in enumerate([
        ('Así conocemos a nuestras aves y su familia. #gallinas #linaje #PicoCriollo', ['bird-01.jpg']),
        ('Recorrido por nuestra crianza y sus nuevos pollitos. #pollitos #granja #PicoCriollo',
         ['raza-brahma-gallina.jpg', 'raza-sedosa-pollitos.jpg']),
        ('Hoy registramos la recolección y revisamos la procedencia de cada lote. #huevos #trazabilidad',
         ['huevos-fertiles-1.jpg']),
        ('Bienvenidos: aquí probamos registros, parentescos y mercado. #comunidad #PicoCriollo', []),
    ]):
        media = [photo(f'post-photo-{n}-{j}', filename)['id'] for j, filename in enumerate(filenames)]
        posts.append(step(f'post-{n}', '/api/publicaciones-perfil',
                          {'text': '[DEMOSTRACIÓN · contenido ficticio] ' + text, 'mediaIds': media})['id'])
    users.append({'slug': slug, 'id': uid, 'token': token, 'posts': posts})
    print(f'Preparada {email}: 2 gallineros, 5 aves, lotes de pollitos y huevos, insumos, 5 anuncios y 4 publicaciones.', flush=True)

for i, user in enumerate(users):
    other = users[(i + 1) % len(users)]
    call('POST', f"/api/perfiles/{other['id']}/seguir", token=user['token'])
    post = other['posts'][0]
    call('PUT', f'/api/publicaciones-perfil/{post}/me-gusta', {'liked': True}, user['token'])
    steps = saved[user['slug']]['steps']
    if 'comment' not in steps:
        steps['comment'] = call('POST', f'/api/publicaciones-perfil/{post}/comentarios',
                              {'text': 'Comentario de prueba: aquí podemos conversar sobre la crianza.'}, user['token'])
        store()
    if 'share' not in steps:
        steps['share'] = call('POST', f'/api/publicaciones-perfil/{post}/compartir',
                             {'text': '[DEMOSTRACIÓN] Compartiendo una publicación de otro criador.'}, user['token'])
        store()
    farm = call('GET', '/api/granja', token=user['token'])['datos']
    assert len(farm['coops']) >= 2 and len(farm['birds']) >= 5 and len(farm['chickLots']) >= 1
print('Verificadas las tres granjas. Carga completada; recarga Reels y Mercado.', flush=True)
