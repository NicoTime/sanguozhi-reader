#!/usr/bin/env python3
"""Build the local modern relief and reference layers. See public/maps/README.md."""
import argparse
import concurrent.futures
import bisect
import json
import math
import subprocess
import time
import urllib.request
from pathlib import Path

from array import array

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/maps'
CACHE = ROOT / '.local/map-cache'
PROFILES = {
    'central-plains': (8, 205, 215, 97, 108, 'central-plains-relief.jpg', 'bounds.json', ''),
    'eastern-china': (7, 98, 111, 46, 58, 'eastern-china-relief.jpg', 'eastern-china-bounds.json', 'eastern-china-'),
    'national': (5, 22, 29, 9, 16, 'national-relief.jpg', 'national-bounds.json', 'national-'),
}
ZOOM, X0, X1, Y0, Y1, RELIEF, BOUNDS, PREFIX = PROFILES['central-plains']
TILE_BASE = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium'
NE_BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson'


def fetch(url, filename):
    path = CACHE / filename
    if not path.exists():
        for attempt in range(3):
            try:
                with urllib.request.urlopen(url, timeout=18) as response:
                    data = response.read()
                path.write_bytes(data)
                break
            except OSError:
                if attempt == 2:
                    raise
                time.sleep(1 + attempt)
    return path.read_bytes()


def longitude(x):
    return 360 * x / (2 ** ZOOM) - 180


def latitude(y):
    return math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / (2 ** ZOOM)))))


def tile(pair):
    x, y = pair
    data = fetch(f'{TILE_BASE}/{ZOOM}/{x}/{y}.png', f'{ZOOM}-{x}-{y}.png')
    return x, y, data


def ffmpeg(arguments, data):
    process = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', *arguments],
                             input=data, capture_output=True)
    if process.returncode:
        raise RuntimeError(process.stderr.decode(errors='replace'))
    return process.stdout


def modern_land_mask(width, height):
    data = json.loads(fetch(f'{NE_BASE}/ne_50m_land.geojson', 'land-50m.geojson'))
    mask = bytearray(width * height)
    world = 256 * 2 ** ZOOM

    def project(point):
        lon, lat = point
        lat = min(85.05, max(-85.05, lat))
        return (world * (lon + 180) / 360 - X0 * 256,
                world * (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 - Y0 * 256)

    for feature in data['features']:
        geometry = feature['geometry']
        polygons = [geometry['coordinates']] if geometry['type'] == 'Polygon' else geometry['coordinates']
        for polygon in polygons:
            outer = [project(point) for point in polygon[0]]
            if (max(x for x, _ in outer) < 0 or min(x for x, _ in outer) >= width or
                    max(y for _, y in outer) < 0 or min(y for _, y in outer) >= height):
                continue
            crossings = [[] for _ in range(height)]
            for ring in [outer, *[[project(point) for point in hole] for hole in polygon[1:]]]:
                for (x0, y0), (x1, y1) in zip(ring, ring[1:]):
                    if y0 == y1:
                        continue
                    first = max(0, math.ceil(min(y0, y1) - .5))
                    last = min(height, math.ceil(max(y0, y1) - .5))
                    for y in range(first, last):
                        crossings[y].append(x0 + (y + .5 - y0) * (x1 - x0) / (y1 - y0))
            for y, row in enumerate(crossings):
                row.sort()
                for start, stop in zip(row[::2], row[1::2]):
                    left, right = max(0, math.ceil(start - .5)), min(width, math.ceil(stop - .5))
                    if right > left:
                        mask[y * width + left:y * width + right] = b'\x01' * (right - left)
    return mask


def build_relief(national=False):
    width, height = (X1-X0)*256, (Y1-Y0)*256
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        tiles = list(pool.map(tile, [(x,y) for x in range(X0,X1) for y in range(Y0,Y1)]))
    images = ffmpeg(['-f', 'image2pipe', '-c:v', 'png', '-i', 'pipe:0',
                     '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], b''.join(data for x,y,data in tiles))
    if len(images) != 256*256*3*len(tiles):
        raise ValueError('Unexpected length of decoded Terrarium tiles')

    dem = array('f', [0]) * (width*height)
    for tile_i, (x,y,_) in enumerate(tiles):
        offset = tile_i*256*256*3
        for j in range(256):
            target = ((y-Y0)*256+j)*width + (x-X0)*256
            start = offset+j*256*3
            dem[target:target+256] = array('f', (images[i]*256+images[i+1]+images[i+2]/256-32768
                                                for i in range(start,start+256*3,3)))

    # Shade local slope from the northwest, exaggerating relief. The palette
    # is elevation based, with no waterways, borders, roads or settlements.
    scale = 4 / (40075016.7 / (256 * 2**ZOOM) * math.cos(math.radians(35)))
    ramp = [0, 95, 230, 420, 800, 1350, 2200, 3400]
    colors = [(228,223,199),(221,219,192),(207,210,180),(191,199,169),
              (174,183,152),(162,168,139),(178,171,147),(201,190,163)]
    palette = []
    for value in range(ramp[-1]+1):
        hi = min(len(ramp)-1, bisect.bisect_right(ramp, value))
        lo = hi-1
        ratio = (value-ramp[lo])/(ramp[hi]-ramp[lo])
        palette.append(tuple(a+(b-a)*ratio for a,b in zip(colors[lo],colors[hi])))

    relief = bytearray(width*height*3)
    land = modern_land_mask(width, height) if national else None
    ocean = bytes((197, 209, 201))
    for y in range(height):
        row = y*width
        north_row, south_row = max(0,row-width), min(width*(height-1),row+width)
        for x in range(width):
            i = row+x
            if land is not None and not land[i]:
                relief[3*i:3*i+3] = ocean
                continue
            gx = (dem[row+min(width-1,x+1)]-dem[row+max(0,x-1)])*scale*0.5
            gy = (dem[south_row+x]-dem[north_row+x])*scale*0.5
            shade = (0.66+0.53*(gx+gy))/math.sqrt(1+gx*gx+gy*gy)
            light = 0.79+0.29*min(1.05,max(-0.45,shade))
            r,g,b = palette[min(ramp[-1],max(0,round(dem[i])))]
            relief[3*i], relief[3*i+1], relief[3*i+2] = int(r*light),int(g*light),int(b*light)
    ffmpeg(['-f','rawvideo','-pixel_format','rgb24','-video_size',f'{width}x{height}',
            '-i','pipe:0','-frames:v','1','-c:v','mjpeg','-q:v','3','-pix_fmt','yuvj444p',
            str(OUT / RELIEF)], relief)
    west, south, east, north = longitude(X0), latitude(Y1), longitude(X1), latitude(Y0)
    (OUT / BOUNDS).write_text(json.dumps({
        'west': west, 'south': south, 'east': east, 'north': north,
        'width': width, 'height': height
    }, indent=2) + '\n')
    return west, south, east, north


def intersects(a, b, bounds):
    west, south, east, north = bounds
    return (min(a[0],b[0]) <= east and max(a[0],b[0]) >= west and
            min(a[1],b[1]) <= north and max(a[1],b[1]) >= south)


def save_json(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, separators=(',',':')) + '\n')


def build_reference(bounds):
    rivers = json.loads(fetch(f'{NE_BASE}/ne_10m_rivers_lake_centerlines.geojson', 'rivers.geojson'))
    features = []
    for feature in rivers['features']:
        geom, props = feature['geometry'], feature['properties']
        if geom is None:
            continue
        paths = [geom['coordinates']] if geom['type'] == 'LineString' else geom['coordinates']
        for line in paths:
            if any(intersects(a,b,bounds) for a,b in zip(line, line[1:])):
                features.append({'type':'Feature', 'properties':{'name':props.get('name_zh') or props.get('name')},
                                 'geometry':{'type':'LineString','coordinates':[[round(x,5),round(y,5)] for x,y in line]}})
    save_json(PREFIX+'modern-rivers.geojson', {'type':'FeatureCollection','features':features})

    places = json.loads(fetch(f'{NE_BASE}/ne_10m_populated_places.geojson', 'cities.geojson'))
    selected = {'郑州','开封','新乡','安阳','濮阳','焦作','洛阳','许昌','鹤壁','济源','菏泽','商丘','邯郸','聊城','周口','漯河','长治','晋城','平顶山','新郑'}
    if PREFIX:
        selected |= {'成都','绵阳','德阳','广元','汉中','安康','重庆','宜昌','荆州','襄阳','武汉','黄冈','黄石',
                     '岳阳','长沙','常德','九江','南昌','合肥','六安','安庆','南京','镇江','苏州','无锡','杭州',
                     '北京','天津','保定','石家庄','沈阳','辽阳','鞍山','大连','丹东','秦皇岛','西安','宝鸡','天水',
                     '洛阳','徐州','济南','连云港','扬州','镇江','嘉兴','宁波','绍兴','台州','温州','福州','广州','梧州'}
    modern = []
    for feature in places['features']:
        props, coord = feature['properties'], feature['geometry']['coordinates']
        name = props.get('NAME_ZH') or props.get('name_zh')
        if name in selected and intersects(coord, coord, bounds):
            modern.append({'name':name,'coordinates':[round(x,5) for x in coord]})
    if len(modern) < 8 or len(features) < 3:
        raise ValueError('Unexpectedly sparse modern reference data')
    save_json(PREFIX+'modern-cities.json', modern)


if __name__ == '__main__':
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--profile', choices=PROFILES, default='central-plains')
    cli.add_argument('--bounds-only', action='store_true')
    args = cli.parse_args()
    ZOOM, X0, X1, Y0, Y1, RELIEF, BOUNDS, PREFIX = PROFILES[args.profile]
    if args.bounds_only:
        print(json.dumps({'west':longitude(X0),'south':latitude(Y1),'east':longitude(X1),'north':latitude(Y0)},indent=2))
        raise SystemExit(0)
    OUT.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    bounds = build_relief(national=args.profile == 'national')
    if args.profile != 'national':
        build_reference(bounds)
