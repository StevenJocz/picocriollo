"""Descarga fotos distintas de Commons con fuente, autor y licencia conservados."""
import hashlib
import sys
sys.stdout.reconfigure(errors='replace')
import html
import json
import re
import time
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[1] / 'public' / 'demo50'
ROOT.mkdir(parents=True, exist_ok=True)
MANIFEST = ROOT / 'manifest.json'
data = json.loads(MANIFEST.read_text('utf-8')) if MANIFEST.exists() else {'birds': [], 'eggs': []}
seen = {x['sha1'] for group in data.values() for x in group}
data.setdefault('chicks', [])
data.setdefault('supplies', [])
data.setdefault('supplies_clean', [])
categories = [
    ('Brahma', 'Brahma (chicken)'), ('Sedosa', 'Silkie'), ('Orpington', 'Orpington (chicken)'),
    ('Sussex', 'Sussex (chicken)'), ('Wyandotte', 'Wyandotte (chicken)'),
    ('Leghorn', 'Leghorn (chicken)'), ('Plymouth Rock', 'Plymouth Rock (chicken)'),
    ('Rhode Island Red', 'Rhode Island Red'), ('Cochin', 'Cochin (chicken)'),
    ('Araucana', 'Araucana'), ('Marans', 'Marans'), ('Polaca', 'Polish (chicken)'),
    ('Hamburgo', 'Hamburg (chicken)'), ('Sebright', 'Sebright (chicken)'),
    ('Australorp', 'Australorp'), ('Faverolles', 'Faverolles (chicken)'),
    ('Appenzeller', 'Appenzeller Spitzhauben'), ('Barnevelder', 'Barnevelder'),
    ('Welsumer', 'Welsummer'), ('New Hampshire', 'New Hampshire (chicken)'),
    ('Brahma', 'Light Brahma'), ('Brahma', 'Dark Brahma'), ('Orpington', 'Buff Orpington'),
    ('Ayam Cemani', 'Ayam Cemani'), ('Fénix', 'Phoenix (chicken)'), ('Serama', 'Serama'), ('Dorking', 'Dorking (chicken)'), ('Frisona', 'Friesian (chicken)'), ('Criolla / raza sin confirmar', 'Hens'), ('Criolla / raza sin confirmar', 'Roosters'),
]

def request(url):
    for attempt in range(4):
        try:
            with urlopen(Request(url, headers={'User-Agent': 'PicoCriolloDemo/1.0 (licensed poultry demo images)'}), timeout=40) as r:
                return r.read()
        except Exception as exc:
            if isinstance(exc, HTTPError) and exc.code == 429:
                time.sleep(min(120, max(30, int(exc.headers.get('Retry-After', '60')))))
            if isinstance(exc, HTTPError) and exc.code in (403, 404):
                raise
            if attempt == 3:
                raise
            time.sleep(3 * (attempt + 1))

def clean(value):
    return html.unescape(re.sub('<[^>]+>', '', value)).strip()

def category(breed, name, group, limit):
    params = dict(action='query', format='json', generator='categorymembers', gcmtitle='Category:' + name,
                  gcmtype='file', gcmlimit=200, prop='imageinfo', iiprop='url|sha1|extmetadata|size|mime', iiurlwidth=960)
    if group == 'supplies_clean': params['gcmstartsortkey'] = 'J'
    pages = json.loads(request('https://commons.wikimedia.org/w/api.php?' + urlencode(params))).get('query', {}).get('pages', {})
    added = 0
    for p in pages.values():
        if len(data[group]) >= limit or added >= 50:
            break
        info = p.get('imageinfo', [{}])[0]
        meta = info.get('extmetadata', {})
        license = clean(meta.get('LicenseShortName', {}).get('value', ''))
        title = p['title']
        if group == 'supplies_clean' and (not re.search(r'corn grains|corn kernel|maize|mais|maïs|kernels', title, re.I) or re.search(r'cooked|boil|grill|fry|damage|salad|pot pie|explos|starch', title, re.I)):
            continue
        if info.get('mime') != 'image/jpeg' or info.get('sha1') in seen or min(info.get('width', 0), info.get('height', 0)) < 400:
            continue
        if not any(x in license.lower() for x in ('cc by', 'cc0', 'public domain')):
            continue
        if re.search(r'illustration|drawing|engraving|museum specimen|skeleton|poultry book|standard of perfection|diagram|embryo|fried|boiled|omelet|recipe', title, re.I):
            continue
        url = info.get('thumburl', info['url'])
        file = f'{group}-{len(data[group])+1:03}.jpg'
        try:
            raw = request(url)
            if not raw.startswith(b'\xff\xd8'):
                continue
            digest = hashlib.sha256(raw).hexdigest()
            if any(x['sha256'] == digest for g in data.values() for x in g):
                continue
            (ROOT / file).write_bytes(raw)
        except Exception as e:
            print('Skip', title, type(e).__name__, flush=True)
            continue
        entry = dict(file=file, breed=breed, title=title, source='https://commons.wikimedia.org/?curid=' + str(p['pageid']),
                     author=clean(meta.get('Artist', {}).get('value', 'Autor en la fuente')),
                     license=license, licenseUrl=meta.get('LicenseUrl', {}).get('value', ''),
                     sha1=info['sha1'], sha256=digest)
        data[group].append(entry)
        seen.add(info['sha1'])
        MANIFEST.write_text(json.dumps(data, ensure_ascii=False, indent=2), 'utf-8')
        added += 1
        time.sleep(.15)
    print(group, name, 'total', len(data[group]), flush=True)

for breed, name in categories:
    if len(data['birds']) >= 400:
        break
    category(breed, name, 'birds', 400)
for name in ['Chicken eggs', 'Brown chicken eggs', 'Egg cartons with chicken eggs']:
    if len(data['eggs']) >= 100:
        break
    category('Huevos de gallina', name, 'eggs', 100)
for name in ['Chicks of unidentified chicken breeds', 'Chicks', 'Chicks in Vogelpark Steinen']:
    if len(data['chicks']) >= 50: break
    category('Pollitos', name, 'chicks', 50)
for label, name in [('Maíz', 'Maize kernels'), ('Maíz', 'Maize kernel textures'), ('Maíz', 'Maize grains')]:
    if len(data['supplies']) >= 50: break
    category(label, name, 'supplies', 50)
# Enlaces cortos por ID evitan confundir números de archivos con teléfonos.
for name in ['Maize kernels', 'Maize kernel textures']:
    if len(data['supplies_clean']) >= 20: break
    category('Maíz', name, 'supplies_clean', 20)
pending = [x for group in data.values() for x in group if '?curid=' not in x['source']]
for offset in range(0, len(pending), 40):
    batch = pending[offset:offset+40]
    params = dict(action='query', format='json', titles='|'.join(x['title'] for x in batch))
    pages = json.loads(request('https://commons.wikimedia.org/w/api.php?' + urlencode(params)))['query']['pages']
    ids = {p['title']: p['pageid'] for p in pages.values() if 'pageid' in p}
    for item in batch:
        if item['title'] in ids: item['source'] = 'https://commons.wikimedia.org/?curid=' + str(ids[item['title']])
    MANIFEST.write_text(json.dumps(data, ensure_ascii=False, indent=2), 'utf-8')
    time.sleep(3)
MANIFEST.write_text(json.dumps(data, ensure_ascii=False, indent=2), 'utf-8')
print('TOTAL', {k: len(v) for k, v in data.items()}, flush=True)
