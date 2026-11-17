"""Carga autorizada de 50 cuentas ficticias mediante API. Estado privado para reanudar sin duplicar pasos. No ejecutar simultáneamente. No modifica usuarios reales."""
import json
import secrets
import time
import os
import subprocess
import re
from temas_demo import caption as texto_demo
from pathlib import Path
from datetime import datetime, timedelta, timezone
from urllib.request import Request, urlopen
from urllib.error import HTTPError

if os.environ.get('PICO_DEMO_PRODUCCION') != '50':
    raise SystemExit('Requiere PICO_DEMO_PRODUCCION=50 para cargar 50 cuentas de muestra.')
ip = subprocess.check_output(['docker', 'inspect', '--format', '{{(index .NetworkSettings.Networks "backend").IPAddress}}', 'pico-criollo-api'], text=True).strip()
BASE = 'http://' + ip + ':8080'
ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / '.data' / 'demo-produccion-50.json'
os.umask(0o077)
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
        if error.code == 404 and method == 'DELETE':
            return None
        if error.code == 429:
            time.sleep(10)
            return call(method, route, body, token, image)
        raise RuntimeError(f'{method} {route}: {error.code} {error.read().decode()}') from error

def store():
    STATE.parent.mkdir(exist_ok=True)
    STATE.write_text(json.dumps(saved, ensure_ascii=False, indent=2), encoding='utf-8')

manifest = json.loads((ROOT / 'public/demo50/manifest.json').read_text('utf-8'))
assert len(manifest['birds']) >= 400 and len(manifest['eggs']) >= 100
assert len(manifest['chicks']) >= 50 and len(manifest['supplies']) >= 50
assert len({a['sha256'] for a in manifest['birds']}) == len(manifest['birds'])
def credit(meta):
    author = re.sub(r'[\w.+-]+@[\w-]+\.[\w.-]+|\b\d{10}\b', '', meta['author']).strip()[:80]
    return f"Foto ilustrativa: {author or 'Autor en la fuente'} · {meta['license']} · {meta['source']}"
users = []
places = [('Medellín', 'Antioquia'), ('Pereira', 'Risaralda'), ('Manizales', 'Caldas')]
labels = ['Alba', 'Pradera', 'Robles', 'Aurora', 'Ceiba', 'Mirador', 'Nogales', 'Palmas', 'Paraíso', 'Esperanza']
for index in range(50):
    slug = f'muestra-{index+1:02}'
    name = f'Demo {index+1:02} - Granja {labels[index % len(labels)]}'
    city, region = places[index % len(places)]
    kind = ['fixed', 'auction', 'interest'][index % 3]
    email = f'{slug}@picocriollo.test'
    if slug not in saved:
        saved[slug] = {'password': secrets.token_urlsafe(32), 'steps': {}}
        store()
    password = saved[slug]['password']
    if saved[slug].get('id'):
        auth = call('POST', '/api/auth/login', {'correo': email, 'password': password})
    else:
        auth = call('POST', '/api/auth/registro', {'correo': email, 'password': password,
                    'nombreUsuario': name, 'ciudad': city, 'departamento': region})
        saved[slug]['id'] = auth['datos']['id']
        saved[slug]['email'] = email
        store()
    token, uid = auth['token'], auth['datos']['id']
    steps = saved[slug]['steps']
    def step(key, route, body=None, image=None, method='POST'):
        if key not in steps:
            steps[key] = call(method, route, body, token, image)
            store()
        return steps[key]
    def photo(key, filename, purpose='post'):
        return step(key, '/api/media?uso=' + purpose, image=ROOT / 'public' / 'seed' / filename)

    photo('avatar', ['avatar-alba.jpg', 'avatar-pradera.jpg', 'avatar-robles.jpg'][index % 3], 'avatar')
    coops = [step(f'coop-{n}', '/api/granja/gallineros', {'name': label, 'capacity': 30,
             'type': typ, 'status': 'Activo', 'startedAt': day(-180), 'location': city,
             'notes': 'Gallinero de demostración; datos ficticios.'})['id']
             for n, (label, typ) in enumerate([('Demo - Reproductores', 'Pastoril'), ('Demo - Cría', 'Cría')])]
    birds = []
    portraits = manifest['birds'][index*5:index*5+5]
    eggmeta = manifest['eggs'][index]
    breed = portraits[0]['breed']
    def uniquephoto(key, meta, purpose='post'):
        return step(key, '/api/media?uso=' + purpose, image=ROOT / 'public/demo50' / meta['file'])
    uniquephoto('avatar-unique', portraits[0], 'avatar')
    birdphotos = []
    for n, (birdname, sex) in enumerate([('Trueno', 'Gallo'), ('Canela', 'Gallina'),
                                       ('Aurora', 'Gallina'), ('Pintada', 'Gallina'), ('Lucero', 'Gallo')]):
        picture = uniquephoto(f'bird-unique-photo-{n}', portraits[n], 'bird')
        birdphotos.append(picture)
        body = {'name': f'Demo {index+1:02} - {birdname}', 'sex': sex, 'coopId': coops[0], 'breed': portraits[n]['breed'],
                'status': 'Activo', 'bornAt': day(-600 if n < 2 else -240),
                'photo': picture['url'], 'origin': 'Nacimiento de demostración',
                'notes': 'Ave ficticia de demostración. ' + credit(portraits[n])}
        if n >= 2:
            body.update(fatherId=birds[0], motherId=birds[1])
        bird = step(f'bird-{n}', '/api/granja/aves', body)['id']
        step(f'bird-unique-update-{n}', f'/api/granja/aves/{bird}', body, method='PUT')
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
    eggphoto = uniquephoto('egg-unique-photo', eggmeta)
    chickmeta, supplymeta = manifest['chicks'][index], manifest['supplies'][index]
    chickphoto = uniquephoto('chick-distinct-photo', chickmeta)
    supplyphoto = uniquephoto('supply-distinct-photo', supplymeta)
    for typ, source, price in [('ave', {'birdId': birds[2]}, 90000),
                              ('lote_aves', {'birdIds': birds[3:5]}, 180000),
                              ('lote_pollitos', {'lotId': lot, 'quantity': 6}, 60000),
                              ('lote_huevos', {'lotId': egg_lot, 'quantity': 6}, 12000),
                              ('insumo', {'lotId': supply, 'quantity': 5}, 12500)]:
        images = {'ave': [birdphotos[2]['id']], 'lote_aves': [birdphotos[3]['id'], birdphotos[4]['id']], 'lote_pollitos': [chickphoto['id']], 'lote_huevos': [eggphoto['id']], 'insumo': [supplyphoto['id']]}[typ]
        sources = {'ave': [portraits[2]], 'lote_aves': portraits[3:5], 'lote_huevos': [eggmeta], 'lote_pollitos': [chickmeta], 'insumo': [supplymeta]}[typ]
        description = f'DEMOSTRACIÓN · {name} en {city}. ' + {'ave': 'Conoce esta ave y su familia registrada.', 'lote_aves': 'Dos aves con fotos individuales para explorar su procedencia.', 'lote_pollitos': 'Lote de seis pollitos para probar el seguimiento de un nacimiento.', 'lote_huevos': 'Seis huevos de consumo con recolección registrada y foto ilustrativa.', 'insumo': 'Cinco kilogramos de maíz: ejemplo de existencias disponibles.'}[typ]
        description += ' No realizar pagos. ' + ' | '.join(credit(m) for m in sources)
        body = {'photoIds': images, 'kind': kind, 'itemType': typ, **source, 'publish': True,
                'price': price if kind == 'fixed' else 0,
                'terms': 'DEMOSTRACIÓN: anuncio ficticio. No realizar pagos ni coordinar entregas.',
                'consent': {'description': description[:1200],
                            'deliveryZone': city, 'showPhoto': True, 'showGenealogy': True,
                            'showReproduction': True, 'showBreeder': True}}
        if kind == 'auction':
            body['auction'] = {'startingPrice': price, 'minIncrement': 5000,
                               'closesAt': (now + timedelta(days=3)).isoformat(), 'antiSniping': True}
        listing = step('listing-' + typ, '/api/mercado/publicaciones', body)['id']
        step('listing-distinct-photos-' + typ, f'/api/mercado/publicaciones/{listing}', {'photoIds': images, 'consent': body['consent']}, method='PUT')
        current = call('GET', f'/api/mercado/{listing}', token=token)['listing']
        if current['status'] == 'pausada':
            step('listing-resume-' + typ, f'/api/mercado/publicaciones/{listing}/reanudar')
    posts = []
    topics = [
        f"{name}: conocemos a {portraits[0]['breed']} y observamos su plumaje en el corral de {city}. #razas #gallinas",
        f"En {name} registramos la familia de {portraits[2]['breed']}. Esta ficha permite recorrer padres y descendientes. #linaje #granja",
        f"La recolección de {name} ya tiene lote: seis huevos para explorar su procedencia desde {city}. #huevos #trazabilidad",
        f"Desde {name} compartimos esta ave {portraits[4]['breed']}: un ejemplo para conectar criadores y descubrir otras granjas. #comunidad #aves",
    ]
    for n, meta in enumerate([*manifest['birds'][250+index*3:253+index*3], manifest['eggs'][50+index]]):
        media = uniquephoto(f'post-distinct-photo-{n}', meta)
        caption = texto_demo(index, n, name) + '\n' + credit(meta)
        posts.append(step(f'post-distinct-{n}', '/api/publicaciones-perfil', {'text': caption[:600], 'mediaIds': [media['id']]})['id'])
        for old in [f'post-{n}', f'post-unique-{n}']:
            removal = old + '-removed'
            if old in steps and removal not in steps and old + '-retired-v2' not in steps:
                call('DELETE', '/api/publicaciones-perfil/' + steps[old]['id'], token=token)
                steps[removal] = True
                store()
    users.append({'slug': slug, 'id': uid, 'token': token, 'posts': posts})
    print(f'Preparada {email}: 2 gallineros, 5 aves, lotes de pollitos y huevos, insumos, 5 anuncios y 4 publicaciones.', flush=True)

for i, user in enumerate(users):
    auth = call('POST', '/api/auth/login', {'correo': saved[user['slug']]['email'], 'password': saved[user['slug']]['password']})
    user['token'] = auth['token']
    other = users[(i + 1) % len(users)]
    steps = saved[user['slug']]['steps']
    if 'follow' not in steps:
        steps['follow'] = call('POST', f"/api/perfiles/{other['id']}/seguir", token=user['token'])
        store()
    post = other['posts'][0]
    call('PUT', f'/api/publicaciones-perfil/{post}/me-gusta', {'liked': True}, user['token'])
    steps = saved[user['slug']]['steps']
    if 'comment' not in steps:
        steps['comment'] = call('POST', f'/api/publicaciones-perfil/{post}/comentarios',
                              {'text': f'[Demo {i+1:02}] Me interesa conocer el registro de esta familia y comparar la crianza de nuestras granjas.'}, user['token'])
        store()
    if i < 5 and 'share' not in steps:
        steps['share'] = call('POST', f'/api/publicaciones-perfil/{post}/compartir',
                             {'text': f'[DEMOSTRACIÓN {i+1:02}] Una visita al perfil de {other["slug"]}: descubrimos sus aves y registros.'}, user['token'])
        store()
    farm = call('GET', '/api/granja', token=user['token'])['datos']
    assert len(farm['coops']) >= 2 and len(farm['birds']) >= 5 and len(farm['chickLots']) >= 1
print('Verificadas las 50 granjas. Carga completada; recarga Reels y Mercado.', flush=True)
