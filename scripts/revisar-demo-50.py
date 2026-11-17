"""Retira versiones antiguas SOLO de posts creados por demo-produccion-50.py y verifica sus muestras."""
import json, os, subprocess, time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

assert os.environ.get('PICO_DEMO_PRODUCCION') == '50'
os.umask(0o077)
root = Path(__file__).resolve().parents[1]
path = root / '.data/demo-produccion-50.json'
saved = json.loads(path.read_text('utf-8'))
manifest = json.loads((root / 'public/demo50/manifest.json').read_text('utf-8'))
ip = subprocess.check_output(['docker','inspect','-f','{{(index .NetworkSettings.Networks "backend").IPAddress}}','pico-criollo-api'], text=True).strip()
base = 'http://' + ip + ':8080'

def call(method, route, token=None, body=None, image=None):
    headers = {'Content-Type': 'image/jpeg' if image else 'application/json'}
    if token: headers['Authorization'] = 'Bearer ' + token
    while True:
        try:
            raw = image.read_bytes() if image else json.dumps(body).encode() if body is not None else None
            with urlopen(Request(base+route, data=raw, headers=headers, method=method), timeout=45) as r:
                data = r.read()
                return json.loads(data) if data else None
        except HTTPError as e:
            if e.code == 429: time.sleep(10); continue
            if e.code == 404 and method == 'DELETE': return None
            raise RuntimeError(f'{method} {route}: {e.code} {e.read().decode()}')

def save(): path.write_text(json.dumps(saved, ensure_ascii=False, indent=2), 'utf-8')

replace = [0,1,2,10,14,19,20,21,27,28,29,32,36,37,38,39,40,48]
assert len(manifest['supplies_clean']) >= len(replace)
counts = dict(users=0, coops=0, birds=0, posts=0, listings=0, old_removed=0)
captions, media, bird_media = set(), set(), set()
for index, (slug, user) in enumerate(sorted(saved.items())):
    assert slug.startswith('muestra-') and user['email'] == slug+'@picocriollo.test'
    auth = call('POST','/api/auth/login',body={'correo':user['email'],'password':user['password']})
    token = auth['token']; assert auth['datos']['id'] == user['id']
    steps = user['steps']
    for n in range(4):
        for key in [f'post-{n}',f'post-unique-{n}']:
            if key in steps and key+'-retired-v2' not in steps:
                call('DELETE','/api/publicaciones-perfil/'+steps[key]['id'],token)
                steps[key+'-retired-v2'] = True; save(); counts['old_removed'] += 1
        post = call('GET','/api/publicaciones-perfil/'+steps[f'post-distinct-{n}']['id'],token)
        assert post['authorId'] == user['id'] and post['text'] not in captions
        captions.add(post['text']); counts['posts'] += 1
        for photo in post['media']:
            assert photo['id'] not in media
            media.add(photo['id'])
    if index in replace:
        meta = manifest['supplies_clean'][replace.index(index)]
        if 'supply-reviewed-photo' not in steps:
            steps['supply-reviewed-photo'] = call('POST','/api/media?uso=post',token,image=root/'public/demo50'/meta['file']); save()
        listing_id = steps['listing-insumo']['id']
        current = call('GET','/api/mercado/'+listing_id,token)['listing']
        snap = current['snapshot']
        description = snap['description'].split('Foto ilustrativa:')[0] + f"Foto ilustrativa: {meta['author'][:60]} · {meta['license']} · {meta['source']}"
        if 'supply-reviewed-listing' not in steps:
            call('PUT','/api/mercado/publicaciones/'+listing_id,token,{'photoIds':[steps['supply-reviewed-photo']['id']], 'consent':{'description':description[:1200], 'deliveryZone':snap.get('deliveryZone',''), 'showPhoto':True, 'showGenealogy':True, 'showReproduction':True, 'showBreeder':True}})
            steps['supply-reviewed-listing'] = True; save()
    farm = call('GET','/api/granja',token)['datos']
    counts['users'] += 1; counts['coops'] += len(farm['coops']); counts['birds'] += len(farm['birds'])
    for bird in farm['birds']:
        assert bird['photo'] and bird['photo'] not in bird_media
        bird_media.add(bird['photo'])
    for typ in ['ave','lote_aves','lote_pollitos','lote_huevos','insumo']:
        listing = call('GET','/api/mercado/'+steps['listing-'+typ]['id'],token)['listing']
        photos = set(listing['snapshot'].get('photoUrls') or [])
        assert len(photos) >= (2 if typ == 'lote_aves' else 1), (slug,typ)
        counts['listings'] += 1
    print('Verificada',slug,flush=True)
print(json.dumps(counts),flush=True)
(root/'.data/demo50-verificacion.json').write_text(json.dumps(counts,indent=2),'utf-8')
