#!/usr/bin/env python3
"""Compile independent reader packages from checked EPUB text and editorial JSON."""
import argparse
import hashlib
import json
import re
from pathlib import Path

from epub_source import BOOKS_DIR, require, source_chapter

ROOT = Path(__file__).resolve().parents[1]


def sha(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def dedupe(values):
    return list(dict.fromkeys(value for value in values if value is not None))


def variants_in(variants, start, stop):
    return [dict(v, textOffset=v['textOffset']-start) for v in variants if start<=v['textOffset']<stop]


def references(config, source_id, complete):
    people = {}
    aliases = {}
    details = config.get('personDetails', {})
    for name, pid in config.get('people', []):
        aliases[name] = pid
        metadata = details.get(pid, details.get(name, {}))
        if isinstance(metadata,str):
            metadata = {'description':metadata}
        people.setdefault(pid, {'id':pid,'name':name,
            'description':metadata.get('description',f'{name}，见本篇所引《三国志》正文或裴注。'),
            'sourceIds':[source_id],**metadata})
    for person in config.get('persons', []):
        people[person['id']] = {'sourceIds':[source_id],**person}
        aliases[person['name']] = person['id']
    aliases.update(config.get('personAliases', {}))

    locations = {}
    for item in config.get('places', []):
        if isinstance(item,dict):
            place = {'sourceIds':[source_id],**item}
        else:
            pid,name,modern,coordinates,kind,note,place_source = item
            extra = config.get('placeDetails',{}).get(pid,{})
            place = {'id':pid,'name':name,'modernName':modern,'kind':kind,'coordinates':coordinates,
                'precision':'unlocated' if coordinates is None else extra.get('precision','approximate-area'),
                'note':note,'sourceIds':dedupe([source_id,place_source]),**extra}
        locations[place['id']] = place
    place_aliases = {place['name']:pid for pid,place in locations.items()}
    place_aliases.update(config.get('placeAliases',{}))
    require(all(pid in people for pid in aliases.values()),'人物别名引用未知 ID')
    require(all(pid in locations for pid in place_aliases.values()),'地点别名引用未知 ID')
    if complete:
        for person in people.values():
            description = person.get('description','')
            require(description.strip() and not re.search(r'见本篇所引|^见正文[。.]?$',description),
                    f"人物 {person['id']} 缺具体身份说明")
    return people, aliases, locations, place_aliases


def split_parts(original, person_aliases, place_aliases, attachments, mentions):
    terms = [(alias,pid,'personId') for alias,pid in person_aliases.items() if len(alias)>1]
    terms += [(alias,pid,'placeId') for alias,pid in place_aliases.items()]
    terms.sort(key=lambda item: -len(item[0]))
    by_first = {}
    for term in terms:
        require(term[0], '人物和地点别名不能是空字符串')
        by_first.setdefault(term[0][0],[]).append(term)
    parts, pos = [], 0
    while pos<len(original):
        stop = min((i for i in [*attachments,*mentions] if i>pos),default=len(original))
        match = mentions.get(pos) or next(((text,pid,key) for text,pid,key in by_first.get(original[pos],[])
                                            if original.startswith(text,pos) and pos+len(text)<=stop),None)
        if match:
            text,pid,key = match
            part = {'text':text,key:pid}
        else:
            part = {'text':original[pos]}
        pos += len(part['text'])
        if pos in attachments:
            part['noteIds'] = attachments[pos]
        if parts and set(parts[-1])=={'text'} and set(part)=={'text'}:
            parts[-1]['text'] += part['text']
        else:
            parts.append(part)
    return parts


def slice_bounds(row, unit, previous):
    original = unit['original']
    index = unit['paragraphIndex']
    lower, upper = unit['contentStart'], unit['contentEnd']
    start = row.get('startOffset', max(lower, previous))
    if row.get('startMarker'):
        require('startOffset' not in row,f'p{index} 同时指定两种起点')
        start = original.index(row['startMarker'],max(lower,previous))
    stop = row.get('endOffsetExclusive',upper)
    if row.get('endMarker'):
        require('endOffsetExclusive' not in row,f'p{index} 同时指定两种终点')
        stop = original.index(row['endMarker'],start)+len(row['endMarker'])
    require(type(start) is int and type(stop) is int and lower<=start<stop<=upper,
            f'p{index} 选段偏移超出正文 [{lower},{upper})：[{start},{stop})')
    require(start>=previous, f'p{index} 选段区间重叠')
    return start, stop


def build_tactics(row, scene_id, source_id, people_aliases, locations):
    explicit_phases = row.get('battlePhases')
    explicit_marches = row.get('marches')
    flags, route = row.get('flags',[]), row.get('route')
    phase_id = scene_id+'-phase'
    deployments = []
    for i,(name,faction,pid) in enumerate(flags,1):
        place = locations.get(pid)
        coordinates = place['coordinates'] if place else None
        deployments.append({
            'id':f'{scene_id}-flag-{i}', 'label':name, 'faction':faction, 'commanderId':people_aliases[name],
            'role':'区域位置示意' if coordinates else '未定位','placeId':pid,'coordinates':coordinates,
            'precision':('unlocated' if coordinates is None else
                         'relative-only' if place['precision']=='uncertain' else 'approximate-area'),
            'positionBasis':('本传所叙相关行动的区域参照，具体军营和阵位未定位。'+place['note'])
                            if place else '原文未明确旗帜位置。',
            'action':row['summary'], 'sourceIds':dedupe([source_id]+(place['sourceIds'] if place else [])),
        })
    marches = []
    if route:
        name,faction,a,b = route
        pa,pb = locations[a],locations[b]
        can_draw = pa['coordinates'] is not None and pb['coordinates'] is not None and a!=b
        marches = [{
            'id':scene_id+'-march','order':1,'faction':faction,'commanderId':people_aliases[name],
            'from':a,'to':b,'fromLabel':pa['name']+'一带','toLabel':pb['name']+'一带',
            'label':name+'由'+pa['name']+'方向至'+pb['name'],
            'description':'依据本传相继记载的两处行动区域。'+(
                '只表达方向，不表示所走道路、岸线、营址或渡口。' if can_draw else '地望未定位，未绘路线。'),
            'phaseIds':[phase_id],'precision':'schematic' if can_draw else 'unlocated',
            'sourceIds':dedupe([source_id]+pa['sourceIds']+pb['sourceIds']),
        }]
    phase = {'id':phase_id,'title':row['title'],'summary':row['summary'],'deployments':deployments,'sourceIds':[source_id]}
    return (explicit_phases if explicit_phases is not None else [phase] if flags or route else None,
            explicit_marches if explicit_marches is not None else marches if flags or route else None)


def anchor_offset(unit, note):
    offset = note['bodyOffset']
    while offset>unit['contentStart'] and unit['original'][offset-1].isspace():
        offset -= 1
    return offset


def coverage_for(source, spans, notes, complete, has_sections=False):
    entries = []
    expected_note_ids = set()
    for unit in source['paragraphs']:
        i = unit['paragraphIndex']
        ranges = spans.get(i,[])
        lower,upper = unit['contentStart'],unit['contentEnd']
        if complete:
            require(ranges and ranges[0][0]==lower and ranges[-1][1]==upper and
                    all(a[1]==b[0] for a,b in zip(ranges,ranges[1:])),
                    f"{source['chapterId']} p{i} 全文区间缺失：期望 [{lower},{upper})，实际 {ranges}")
        note_entries = []
        for note in unit['notes']:
            offset = anchor_offset(unit,note)
            if complete or any(a<offset<=b for a,b in ranges):
                note_id = f"{source['chapterId']}-p{i}-note{note['blockIndex']}"
                expected_note_ids.add(note_id)
                note_entries.append({'id':note_id,'offset':offset,'sha256':sha(note['original']),
                    'paragraphStart':note['paragraphStart'],'paragraphEnd':note['paragraphEnd'],
                    **({'sourceTag':unit['sourceTag']} if 'sourceTag' in unit else {})})
        if complete:
            entries.append({'paragraphIndex':i,'startOffset':lower,'endOffsetExclusive':upper,
                            'sha256':sha(unit['original'][lower:upper]),'notes':note_entries,
                            **({'sourceTag':unit['sourceTag']} if 'sourceTag' in unit else {}),
                            **({'sectionPath':unit['sectionPath']} if has_sections and 'sectionPath' in unit else {})})
    note_ids = [note['id'] for note in notes]
    require(len(note_ids)==len(set(note_ids)) and set(note_ids)==expected_note_ids,
            f"{source['chapterId']} 裴注覆盖缺失或重复：缺 {expected_note_ids-set(note_ids)}；多 {set(note_ids)-expected_note_ids}")
    return {
        'sourceSha256':source['sha256'],'paragraphs':entries,'excluded':source['excluded'],
        'bodyCharacters':source['counts']['bodyCharacters'],'noteCount':source['counts']['notes'],
    }


def build(config, epub_dir=BOOKS_DIR):
    cid = config['id']
    source = source_chapter(cid,epub_dir,source_spec=config.get('sourceSpec'))
    path = source['chapterPath']
    require(config['chapterPath']==path,f'{cid} 卷内路径与书目不一致')
    complete = config['meta']['coverage']=='complete'
    source_id = config.get('sourceId', 'epub' if any(s['id']=='epub' for s in config['sources']) else 'epub-simplified')
    require(any(s['id']==source_id and s['kind']=='epub' for s in config['sources']), '缺原文 EPUB 来源')
    people, aliases, locations, place_aliases = references(config,source_id,complete)
    rows = {unit['paragraphIndex']:unit for unit in source['paragraphs']}
    # A single body heading plus a closing appraisal needs no separate
    # navigation. Retain the source headings in the source inventory.
    has_sections = sum(heading['title'] not in ('评','評','【评】','【評】') for heading in source.get('headings',[]))>1
    section_titles = {}
    for row in config['scenes']:
        if 'sectionTitle' not in row:
            continue
        path_parts = tuple(rows.get(row['paragraphIndex'],{}).get('sectionPath',[]))
        title = row['sectionTitle']
        require(has_sections and path_parts and isinstance(title,str) and title.strip(),
                f"{cid} p{row['paragraphIndex']} 自定分节标题缺少对应原卷标题")
        title = title.strip()
        require(section_titles.setdefault(path_parts,title)==title,
                f'{cid} 同一原卷分节不能使用多个显示标题：{path_parts}')
    spans, notes, scenes = {}, [], []
    previous_index = -1
    for number,row in enumerate(config['scenes'],1):
        index = row['paragraphIndex']
        require(index in rows and index>=previous_index,f'{cid} p{index} 不属于正文或不按源顺序')
        previous_index = index
        unit = rows[index]
        ranges = spans.setdefault(index,[])
        start,stop = slice_bounds(row,unit,ranges[-1][1] if ranges else 0)
        ranges.append((start,stop))
        original = unit['original'][start:stop]
        translation = row['translation']
        require(isinstance(translation,str) and translation.strip(),f'{cid} p{index} 缺白话义注')
        if complete:
            require(translation.strip() not in (original.strip(),row['summary'].strip()) and
                    len(translation.strip())>=max(3,len(original.strip())*.55),
                    f'{cid} p{index} 白话过短、沿用摘要或照抄原文')
        scene_id = row.get('id',f'{cid}-p{index}'+(f'-c{start}' if start>unit['contentStart'] else '')
                           if complete else f'{cid}-scene-{number}')
        attachments = {}
        for note in unit['notes']:
            offset = anchor_offset(unit,note)
            if not start<offset<=stop:
                continue
            note_id = f"{cid}-p{index}-note{note['blockIndex']}"
            source_titles = dedupe(re.findall(r'《([^》]+)》',note['original']))
            notes.append({
                'id':note_id,'kind':'pei','anchorText':unit['original'][start:offset][-22:],
                'original':note['original'],'sourceTitles':source_titles,'sourceIds':[source_id],'variants':note['variants'],
                'provenance':{'sourceId':source_id,'chapterPath':path,'paragraphIndex':index,
                    'blockIndex':note['blockIndex'],'bodyOffset':note['bodyOffset'],'epubAnchor':note['epubAnchor'],
                    'paragraphStart':note['paragraphStart'],'paragraphEnd':note['paragraphEnd'],
                    **({'sourceTag':unit['sourceTag']} if 'sourceTag' in unit else {})},
            })
            attachments.setdefault(offset-start,[]).append(note_id)
        mentions = {}
        for mention in row.get('personMentions',[]):
            off,term,pid = mention['offset']-start,mention['text'],mention['personId']
            require(term and 0<=off<len(original) and off not in mentions and original.startswith(term,off) and
                    not any(off<i<off+len(term) for i in attachments),f'{cid} p{index} 人物显式标记不在原文或跨注锚')
            mentions[off] = (term,pid,'personId')
        require(all(off+len(mentions[off][0])<=nxt for off,nxt in zip(sorted(mentions),sorted(mentions)[1:])),
                f'{cid} p{index} 人物显式标记重叠')
        parts = split_parts(original,aliases,place_aliases,attachments,mentions)
        phases,marches = build_tactics(row,scene_id,source_id,aliases,locations)
        flags = [flag for phase in phases or [] for flag in phase['deployments']]
        focus = row.get('focusPlaceId')
        pids = dedupe([p.get('placeId') for p in parts]+row.get('placeIds',[])+[focus]+
                      [f.get('placeId') for f in flags]+[m.get(end) for m in marches or [] for end in ('from','to')])
        person_ids = dedupe([p.get('personId') for p in parts]+config.get('defaultPersonIds',[])+row.get('personIds',[])+
                            [f.get('commanderId') for f in flags]+[m.get('commanderId') for m in marches or []])
        require(all(pid in locations for pid in pids),f'{cid} p{index} 有未知地点')
        require(all(pid in people for pid in person_ids),f'{cid} p{index} 有未知人物')
        scene = {
            'id':scene_id,'title':row['title'],'time':row['time'],'originalText':original,'parts':parts,
            'translation':translation,'summary':row['summary'],'placeIds':pids,'personIds':person_ids,
            'noteIds':[x for group in attachments.values() for x in group],'focusPlaceId':focus,
            'historicalRiverIds':row.get('historicalRiverIds',[]),'movements':row.get('movements',[]),
            'variants':variants_in(unit['variants'],start,stop),
            'provenance':{'sourceId':source_id,'chapterPath':path,'paragraphIndex':index,
                'excerptStart':original[:12].strip(),'excerptEnd':original[-12:].strip(),
                'startOffset':start,'endOffsetExclusive':stop,'note':'按 EPUB 可见正文取段，裴注按原始注锚保留。',
                **({'sourceTag':unit['sourceTag']} if 'sourceTag' in unit else {})},
        }
        if has_sections and 'sectionPath' in unit:
            scene['sectionTitle'] = section_titles.get(tuple(unit['sectionPath']),unit['sectionTitle'])
            scene['sectionPath'] = unit['sectionPath']
        for key in ('kind','mapProfileId','glosses'):
            if key in row:
                scene[key] = row[key]
        if phases:
            scene['battlePhases'] = phases
        if marches is not None:
            scene['marches'] = marches
        scenes.append(scene)

    coverage = coverage_for(source,spans,notes,complete,has_sections)
    sources = []
    for entry in config['sources']:
        item = dict(entry)
        if item['id']==source_id:
            item['locator'] = source['book']+' → '+path
            item['note'] = (item.get('note','')+' 源卷 XHTML SHA-256 '+source['sha256']+'；维基文库导出简体转换版。').strip()
        sources.append(item)
    profiles = config.get('mapProfiles') or [config['mapProfile']]
    used_places = {pid for scene in scenes for pid in scene['placeIds']}
    used_people = {pid for scene in scenes for pid in scene['personIds']}
    chapter = {
        'schemaVersion':2,'id':cid,'title':config['title'],'subtitle':config['subtitle'],
        'editorialNote':config['editorialNote'],'meta':config['meta'],'factions':config['factions'],
        'mapProfiles':profiles,'defaultMapProfileId':config.get('defaultMapProfileId',profiles[0]['id']),
        'sources':sources,'persons':[p for pid,p in people.items() if pid in used_people],
        'places':[p for pid,p in locations.items() if pid in used_places],
        'notes':notes,'scenes':scenes,'historicalRiver':config['historicalRiver'],
    }
    if complete:
        chapter['coverageAudit'] = coverage
    return chapter,source['counts']


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--check',action='store_true')
    cli.add_argument('--chapter')
    cli.add_argument('--epub-dir',type=Path,default=BOOKS_DIR)
    args = cli.parse_args()
    require(not args.chapter or re.fullmatch(r'[A-Za-z0-9_-]+',args.chapter),'非法篇章 ID')
    folder = ROOT/'content'
    configs = [folder/args.chapter/'editorial.json'] if args.chapter else sorted(folder.glob('*/editorial.json'))
    require(configs,'没有编排文件')
    for config_path in configs:
        config = read_json(config_path)
        cid = config['id']
        require(re.fullmatch(r'[A-Za-z0-9_-]+',cid) and cid==config_path.parent.name,'篇章 ID 与目录不符')
        chapter, counts = build(config,args.epub_dir)
        output = ROOT/'public/data/chapters'/cid
        outputs = {output/'chapter.json':chapter}
        modern = config_path.parent/'modern-cities.json'
        if modern.is_file():
            outputs[output/'modern-cities.json'] = read_json(modern)
        for path,data in outputs.items():
            payload = json.dumps(data,ensure_ascii=False,indent=2)+'\n'
            if args.check:
                require(path.is_file() and path.read_text(encoding='utf-8')==payload,f'{path} 与重提取结果不一致')
            else:
                path.parent.mkdir(parents=True,exist_ok=True)
                temporary = path.with_suffix('.json.tmp')
                temporary.write_text(payload,encoding='utf-8')
                temporary.replace(path)
        seen_paragraphs = {scene['provenance']['paragraphIndex'] for scene in chapter['scenes']}
        chars = sum(len(scene['originalText']) for scene in chapter['scenes'])
        print(f"{cid}: 源正文 {counts['paragraphs']} 段/{counts['bodyCharacters']} 字符/{counts['notes']} 裴注；"
              f"输出 {len(seen_paragraphs)} 源段/{chars} 字符/{len(chapter['notes'])} 裴注；阅读片段 {len(chapter['scenes'])}。")


if __name__=='__main__':
    main()
