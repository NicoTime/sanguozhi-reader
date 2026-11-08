#!/usr/bin/env python3
"""Extract the visible source text and all Pei annotations of the configured EPUB chapters."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
BOOKS_DIR = ROOT / 'sources' / 'epub'
SIMPLIFIED = '三国志（陈寿撰裴松之注·简体转换版）.epub'
TRADITIONAL = '三国志（陈寿撰裴松之注）.epub'
PLAIN = '三国志（陈寿原文·简体无裴注阅读版）.epub'
NS = '{http://www.w3.org/1999/xhtml}'
CHAPTERS = {
    'wudi': ('OPS/c4_san_guo_zhi_juan01.xhtml', 0, 127),
    'xianzhu': ('OPS/c35_san_guo_zhi_juan32.xhtml', 1, 42),
    'wuzhu': ('OPS/c47_san_guo_zhi_juan47.xhtml', 2, 65),
    'wendi': ('OPS/c11_san_guo_zhi_juan02.xhtml', 0, 37),
    'mingdi': ('OPS/c12_san_guo_zhi_juan03.xhtml', 0, 43),
    'sanshaodi': ('OPS/c9_san_guo_zhi_juan04.xhtml', 0, 83),
    'erzhu-feizi': ('OPS/c37_san_guo_zhi_juan34.xhtml', 1, 10),
    'zhuge-liang': ('OPS/c38_san_guo_zhi_juan35.xhtml', 0, 43),
    'sansizhu': ('OPS/c48_san_guo_zhi_juan48.xhtml', 1, 47),
}
# Source-specific DOM configuration. These two evaluations are in dl > dd,
# while the native p indices are retained unchanged for editorial references.
TERMINAL_DD = {'wendi','mingdi'}
LAST_BODY = {'zhuge-liang':41, 'sansizhu':45}
DECLARED_EXCLUSIONS = {'sansizhu':{0:'卷首人物合题，非正文'}}
PUNCTUATION = re.compile(r'[，。；：！？「」『』《》、]')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def raw_text(node):
    return ''.join(node.itertext())


def hidden_marker(node):
    style = re.sub(r'\s+', '', node.get('style', '')).lower()
    if 'color:transparent' in style and 'font-size:0px' in style:
        marker = raw_text(node)
        require(marker in ('〈', '〉'), f'无法识别的隐藏标记：{marker!r}')
        return marker
    return ''


class Visible:
    """Store Unicode codepoint offsets, matching Python slices in editorial rows."""
    def __init__(self):
        self.text = ''
        self.variants = []

    def visit(self, node):
        self.text += node.text or ''
        for child in node:
            if 'variant-tooltip' in child.get('class', '').split():
                base = node.text or ''
                require(base and 'variant-text' in node.get('class', '').split(),
                        '异文 tooltip 缺少底文')
                offset = len(self.text) - len(base)
                require(self.text[offset:] == base, '异文底文偏移不可确定')
                self.variants.append({'baseText': base, 'reading': raw_text(child), 'textOffset': offset})
            elif not hidden_marker(child):
                require(child.tag != NS+'small', '意外嵌套 small，须核对源结构')
                self.visit(child)
            self.text += child.tail or ''

    def extend(self, other, separator=''):
        offset = len(self.text) + len(separator)
        self.text += separator + other.text
        self.variants.extend(dict(item, textOffset=item['textOffset']+offset) for item in other.variants)


def paragraph(node, continuation=False):
    body = Visible()
    body.text = node.text or ''
    fragments = []
    for child in node:
        if child.tag == NS+'small':
            types = child.get('typeof', '')
            require(types in ('', 'mw:Transclusion'), f'未知 small 类型：{types}')
            marks = ''.join(hidden_marker(item) for item in child.iter() if item is not child)
            require(marks in ('〈〉','〈','〉') or (not marks and (continuation or types=='mw:Transclusion')),
                    f'无法识别的小注边界：{marks!r}')
            note = Visible()
            note.visit(child)
            fragments.append((len(body.text), note, marks if continuation else marks or '〈〉', child.get('about', '')))
        else:
            body.visit(child)
        body.text += child.tail or ''
    return body, fragments


def parse_member(xml, member, start, end, last_prefix=('评曰：','評曰：'), declared_exclusions=None,
                 terminal_dd=False, last_body=None):
    document = ET.fromstring(xml)
    paragraphs = list(document.iter(NS+'p'))
    parents = {child: node for node in document.iter() for child in node}
    dom_order = {node:i for i,node in enumerate(document.iter())}
    native_count = len(paragraphs)
    if terminal_dd:
        reviews = [node for node in document.iter(NS+'dd') if raw_text(node).lstrip().startswith(last_prefix)]
        require(len(reviews)==1 and parents[reviews[0]].tag==NS+'dl' and
                dom_order[reviews[0]]>dom_order[paragraphs[end]], f'{member} 评语 dl/dd 结构改变')
        paragraphs.extend(reviews)
    indices = {node:i for i,node in enumerate(paragraphs)}
    headings, heading_path = [], []
    sections = {}
    for node in document.iter():
        index = indices.get(node)
        if index is not None:
            sections[index] = tuple(heading_path)
        level = re.fullmatch(r'h([1-6])',node.tag.removeprefix(NS))
        if level and node.get('id'):
            visible = Visible()
            visible.visit(node)
            title = visible.text.strip()
            if not title:
                continue
            heading = {'title':title,'id':node.get('id'),'level':int(level[1])}
            while heading_path and heading_path[-1]['level']>=heading['level']:
                heading_path.pop()
            heading_path.append(heading)
            headings.append(heading)
    units, excluded = [], []
    open_note = None
    nested_small = set()
    markerless_count = 0
    small_count = 0

    def exclude(index, reason, **details):
        excluded.append({'paragraphIndex': index, 'reason': reason, **details})

    def add_note(unit, body_offset, visible, anchor, first, last):
        require(visible.text.strip(), f'{member} p{first} 空注')
        unit['notes'].append({
            'blockIndex': len(unit['notes']), 'bodyOffset': body_offset, 'epubAnchor': anchor,
            'original': visible.text, 'variants': visible.variants, 'paragraphStart': first,
            'paragraphEnd': last,
        })

    require(end < len(paragraphs), f'{member} 正文范围超过源卷长度')
    for index, node in enumerate(paragraphs):
        if index<native_count and not start <= index <= end:
            text = raw_text(node).strip()
            declared = (declared_exclusions or {}).get(index)
            if declared:
                exclude(index, declared)
                continue
            require(not list(node.iter(NS+'small')), f'{member} p{index} 排除区含小注')
            require(not text or (index == 0 and text in ('孙权','孫權')) or
                    (index > end and ('公有领域' in text or text.startswith('Public domain'))),
                    f'{member} p{index} 有未知非正文内容：{text[:24]}')
            exclude(index, '空白排版' if not text else ('题名' if index < start else '卷末版权信息'))
            continue

        parent = parents.get(node)
        while parent is not None and parent.tag != NS+'small':
            parent = parents.get(parent)
        if parent is not None:
            require(open_note is not None and parent.get('about','')==open_note[3],
                    f'{member} p{index} 位于无起始锚点的小注')
            nested_small.add(parent)
            visible, extra = paragraph(node)
            require(not extra, f'{member} p{index} 跨段裴注出现嵌套注')
            open_note[2].extend(visible, '\n')
            exclude(index, '跨段裴注正文', anchorParagraphIndex=open_note[0]['paragraphIndex'])
            continue

        continuation = open_note is not None and node.get('about','')==open_note[3]
        body, fragments = paragraph(node,continuation)
        small_count += len(fragments)
        if member == CHAPTERS['xianzhu'][0] and index==13:
            # Wikisource's volume 32 breaks this citation around a blockquote:
            # p12 carries the introduction, p13 the quoted answer and p14 the
            # rest of the same source. Both exported fragments have local wrappers.
            host = units[-1]
            previous = host['notes'][-1]
            require(host['paragraphIndex']==12 and previous['epubAnchor']=='#mwt35' and
                    previous['original'].endswith(('拒答不听，曰：','拒答不聽，曰：')),
                    f'{member} p12 献帝春秋引语起点改变')
            require(parents[node].tag==NS+'blockquote' and parents[node].get('about')=='#mwt36' and
                    not fragments and body.text.startswith(('益州民富彊','益州民富強')),
                    f'{member} p13 献帝春秋引语结构改变')
            visible = Visible()
            visible.text, visible.variants = previous['original'], previous['variants']
            visible.extend(body,'\n')
            open_note = (host,previous['bodyOffset'],visible,previous['epubAnchor'],12)
            host['notes'].pop()
            exclude(index,'跨段裴注正文',anchorParagraphIndex=12)
            continue

        if member==CHAPTERS['xianzhu'][0] and open_note is not None and open_note[4]==12:
            require(index==14 and not body.text.strip() and len(fragments)==1 and fragments[0][2]=='〈〉' and
                    fragments[0][3]=='#mwt37' and fragments[0][1].text.startswith(('权不听','權不聽')),
                    f'{member} p14 献帝春秋引语结束结构改变')
            unit, offset, visible, anchor, first = open_note
            visible.extend(fragments[0][1], '\n')
            add_note(unit, offset, visible, anchor, first, index)
            exclude(index, '跨段裴注收束', anchorParagraphIndex=12)
            open_note = None
            continue

        if open_note is not None:
            require(continuation and not body.text.strip() and len(fragments)==1 and fragments[0][2] in ('','〉'),
                    f'{member} p{index} 跨段裴注结构改变')
            unit, offset, visible, anchor, first = open_note
            visible.extend(fragments[0][1], '\n')
            if fragments[0][2]=='〉':
                add_note(unit, offset, visible, anchor, first, index)
                exclude(index, '跨段裴注收束', anchorParagraphIndex=unit['paragraphIndex'])
                open_note = None
            else:
                markerless_count += 1
                exclude(index, '跨段裴注正文', anchorParagraphIndex=unit['paragraphIndex'])
            continue

        if not body.text.strip():
            if not fragments:
                exclude(index, '空白排版')
                continue
            require(units and all(fragment[2]=='〈〉' for fragment in fragments),
                    f'{member} p{index} 独立小注无完整锚点')
            previous = units[-1]
            for _, visible, _, anchor in fragments:
                add_note(previous, previous['contentEnd'], visible, anchor or node.get('about',''), index, index)
            exclude(index, '独立段裴注，已挂前段', anchorParagraphIndex=previous['paragraphIndex'])
            continue

        unit = {
            'paragraphIndex': index, 'original': body.text, 'variants': body.variants, 'notes': [],
            'contentStart': len(body.text)-len(body.text.lstrip()), 'contentEnd': len(body.text.rstrip()),
        }
        if index>=native_count:
            unit['sourceTag'] = 'dd'
        if sections[index]:
            unit['sectionTitle'] = sections[index][-1]['title']
            unit['sectionPath'] = [heading['title'] for heading in sections[index]]
            for heading in sections[index]:
                heading.setdefault('firstParagraphIndex',index)
        previous = units[-1] if units else None
        units.append(unit)
        for offset, visible, marks, anchor in fragments:
            if member==CHAPTERS['wendi'][0] and index==13 and anchor=='#mwt33':
                # This note on the transfer of power follows the abdication
                # edict, before the next paragraph's words about the altar.
                require(previous and previous['paragraphIndex']==12 and offset==0 and marks=='〈〉' and
                        visible.text.startswith(('《献帝传》载禅代众事曰：','《獻帝傳》載禪代衆事曰：')) and
                        unit['original'].startswith(('乃为坛于繁阳','乃爲壇於繁陽')),
                        f'{member} p13 禅代段首裴注结构改变')
                add_note(previous,previous['contentEnd'],visible,anchor,index,index)
                continue
            if marks=='〈〉':
                add_note(unit, offset, visible, anchor, index, index)
            else:
                require(marks=='〈' and not open_note and node.get('about') and offset>=unit['contentEnd'],
                        f'{member} p{index} 跨段小注缺少明确起点')
                open_note = (unit, offset, visible, anchor or node.get('about',''), index)
    require(open_note is None, f'{member} 跨段裴注未结束')
    expected_last = native_count if terminal_dd else end if last_body is None else last_body
    require(units[0]['paragraphIndex']==start and units[-1]['paragraphIndex']==expected_last and
            units[-1]['original'].lstrip().startswith(last_prefix), f'{member} 正文起讫未核定')
    notes = [note for unit in units for note in unit['notes']]
    continuation_count = sum(note['paragraphEnd']>note['paragraphStart'] for note in notes)
    excluded_smalls = sum(sum(1 for _ in paragraphs[i].iter(NS+'small'))
                          for i in (declared_exclusions or {}) if i<len(paragraphs))
    dom_smalls = sum(node.tag == NS+'small' for node in document.iter())-excluded_smalls
    require(small_count==len(notes)+continuation_count+markerless_count and dom_smalls==small_count+len(nested_small),
            f'{member} 小注计数不一致：DOM {dom_smalls}；已解析 {len(notes)}；跨段 {continuation_count}')
    return units, excluded, [heading for heading in headings if 'firstParagraphIndex' in heading]


def read_member(directory, filename, member):
    with ZipFile(directory/filename) as epub:
        return epub.read(member)


def source_chapter(chapter_id, directory=BOOKS_DIR, cross_check=True, source_spec=None):
    if source_spec is None and chapter_id in CHAPTERS:
        member, first, last = CHAPTERS[chapter_id]
        prefixes = ('评曰：','評曰：')
        exclusions = DECLARED_EXCLUSIONS.get(chapter_id)
        terminal_dd = chapter_id in TERMINAL_DD
        last_body = LAST_BODY.get(chapter_id)
    else:
        if source_spec is None:
            require(re.fullmatch(r'[A-Za-z0-9_-]+',chapter_id),'非法篇章 ID')
            path = ROOT/'content'/chapter_id/'editorial.json'
            source_spec = json.loads(path.read_text(encoding='utf-8')).get('sourceSpec')
        require(source_spec, f'{chapter_id} 缺 sourceSpec')
        member = source_spec['chapterPath']
        require(re.fullmatch(r'OPS/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_-]+\.xhtml',member),'非法 EPUB 卷内路径')
        first,last = source_spec['firstParagraph'],source_spec['lastParagraph']
        require(type(first) is int and type(last) is int and 0<=first<=last,'非法源段范围')
        value = source_spec.get('lastTextPrefix',['评曰：','評曰：'])
        prefixes = (value,) if isinstance(value,str) else tuple(value)
        require(prefixes and all(isinstance(x,str) and x.strip() for x in prefixes),'末段应有可核对文本前缀')
        exclusions = {int(k):v for k,v in source_spec.get('excludedParagraphs',{}).items()}
        require(all((0<=i<first or i>last) and isinstance(reason,str) and reason.strip() for i,reason in exclusions.items()),
                '声明排除段只能位于正文范围外且须给原因')
        terminal_dd = source_spec.get('terminalReviewDD',False)
        last_body = source_spec.get('lastBodyParagraph')
    raw = read_member(directory, SIMPLIFIED, member)
    units, excluded, headings = parse_member(raw, member, first, last, prefixes, exclusions,terminal_dd,last_body)
    checks = {}
    if cross_check:
        trad = read_member(directory, TRADITIONAL, member)
        traditional, trad_excluded, trad_headings = parse_member(trad,member,first,last,prefixes,exclusions,terminal_dd,last_body)
        require(excluded==trad_excluded, f'{member} 繁体版非正文段结构不同')
        require(len(units)==len(traditional), f'{member} 繁简正文段数不同')
        require([{k:v for k,v in item.items() if k!='title'} for item in headings] ==
                [{k:v for k,v in item.items() if k!='title'} for item in trad_headings], f'{member} 繁简标题位置不同')
        for a,b in zip(units,traditional):
            i = a['paragraphIndex']
            require(i==b['paragraphIndex'] and len(a['notes'])==len(b['notes']) and
                    PUNCTUATION.findall(a['original'])==PUNCTUATION.findall(b['original']),
                    f'{member} p{i} 繁简正文标点或注数不同')
            for x,y in zip(a['notes'],b['notes']):
                require(all(x[k]==y[k] for k in ('blockIndex','epubAnchor','paragraphStart','paragraphEnd')) and
                        PUNCTUATION.findall(x['original'])==PUNCTUATION.findall(y['original']) and
                        PUNCTUATION.findall(a['original'][:x['bodyOffset']])==PUNCTUATION.findall(b['original'][:y['bodyOffset']]),
                        f'{member} p{i} 繁简裴注或锚点不同')
        checks['traditional'] = {'sha256': hashlib.sha256(trad).hexdigest(), 'paragraphs': len(traditional),
                                 'matched': '同源繁简版本的段落、标点、注块、位置和跨段边界'}
        plain = read_member(directory, PLAIN, member)
        plain_root = ET.fromstring(plain)
        plain_paragraphs = list(plain_root.iter(NS+'p'))
        if terminal_dd:
            plain_paragraphs.extend(node for node in plain_root.iter(NS+'dd') if raw_text(node).lstrip().startswith(prefixes))
        simple = []
        for node in plain_paragraphs:
            plain_body, plain_notes = paragraph(node)
            require(not plain_notes, f'{member} 去注本仍含 small 注')
            simple.append(plain_body.text.strip())
        exact = sum(u['original'].strip() in simple for u in units)
        checks['plain'] = {'sha256': hashlib.sha256(plain).hexdigest(), 'paragraphs': len(plain_paragraphs),
                           'exactParagraphs': exact, 'matched': '同源去注派生版本仅作交叉参考'}
    notes = [note for unit in units for note in unit['notes']]
    return {
        'chapterId': chapter_id, 'book': SIMPLIFIED, 'chapterPath': member,
        'sha256': hashlib.sha256(raw).hexdigest(), 'paragraphs': units, 'excluded': excluded,
        'counts': {
            'paragraphs': len(units),
            'bodyCharacters': sum(u['contentEnd']-u['contentStart'] for u in units),
            'notes': len(notes), 'noteCharacters': sum(len(note['original']) for note in notes),
        },
        'crossChecks': checks,
        **({'headings':headings} if headings else {}),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--chapter')
    parser.add_argument('--epub-dir', type=Path, default=BOOKS_DIR)
    parser.add_argument('--output-dir', type=Path, default=ROOT/'.local/full-source')
    parser.add_argument('--check', action='store_true', help='比对已有清单，不写文件')
    args = parser.parse_args()
    for chapter_id in [args.chapter] if args.chapter else CHAPTERS:
        chapter = source_chapter(chapter_id, args.epub_dir)
        payload = json.dumps(chapter, ensure_ascii=False, indent=2)+'\n'
        output = args.output_dir/f'{chapter_id}.json'
        if args.check:
            require(output.read_text()==payload, f'{output} 与源 EPUB 重提取不一致')
        else:
            output.parent.mkdir(parents=True, exist_ok=True)
            temporary = output.with_suffix('.json.tmp')
            temporary.write_text(payload)
            temporary.replace(output)
        print(chapter_id, json.dumps(chapter['counts'], ensure_ascii=False), 'excluded', len(chapter['excluded']))


if __name__ == '__main__':
    main()
