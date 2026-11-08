#!/usr/bin/env python3
"""Compile manually reviewed, context-matched reading aids; never alter chapter text."""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RULES = ROOT / 'docs/content/pronunciation-v7-rules.json'
OUTPUT = ROOT / 'public/data/pronunciation-v7.json'
CHAPTERS = ('wudi', 'wendi', 'mingdi', 'sanshaodi', 'xianzhu', 'zhuge-liang', 'erzhu-feizi', 'wuzhu', 'sansizhu')


def compile_entries():
    rules = json.loads(RULES.read_text(encoding='utf-8'))
    source_ids = {s['id'] for s in rules['sources']}
    if rules['schemaVersion'] != 1 or len(source_ids) != len(rules['sources']):
        raise ValueError('规则版本或来源 ID 有误')
    entries = []
    for chapter_id in CHAPTERS:
        chapter = json.loads((ROOT / f'public/data/chapters/{chapter_id}/chapter.json').read_text(encoding='utf-8'))
        targets = [('scene', s['id'], s['originalText']) for s in chapter['scenes']]
        targets += [('note', n['id'], n['original']) for n in chapter['notes']]
        for target_type, target_id, text in targets:
            candidates = []
            for rule in rules['rules']:
                if rule.get('targets') and target_id not in rule['targets']:
                    continue
                match, base = rule['match'], rule['base']
                if not match or not base or match.count(base) != 1 or not set(rule['sourceIds']) <= source_ids:
                    raise ValueError(f"不合法规则 {rule['id']}")
                start = 0
                while (index := text.find(match, start)) != -1:
                    offset = index + match.index(base)
                    candidates.append((offset, len(base), len(match), rule))
                    start = index + 1
            # Longest supporting context wins; identical spans with conflicting readings fail.
            candidates.sort(key=lambda v: (-v[2], v[0], v[3]['id']))
            accepted = []
            for offset, length, _, rule in candidates:
                overlaps = [(i, j, r) for i, j, r in accepted if offset < j and i < offset + length]
                if overlaps:
                    if any(r['pinyin'] != rule['pinyin'] for _, _, r in overlaps):
                        raise ValueError(f'{target_id} 读音规则冲突，须人工处理')
                    continue
                accepted.append((offset, offset + length, rule))
            for offset, end, rule in sorted(accepted, key=lambda x: x[0]):
                base = text[offset:end]
                if base != rule['base']:
                    raise ValueError(f'{target_id} 原文偏移不匹配')
                key = f"{chapter_id}|{target_type}|{target_id}|{offset}|{base}"
                entry = {'id': 'pr-' + hashlib.sha256(key.encode()).hexdigest()[:16],
                         'chapterId': chapter_id, 'targetType': target_type, 'targetId': target_id,
                         'textOffset': offset, 'baseText': base, 'pinyin': rule['pinyin'],
                         'sourceIds': rule['sourceIds']}
                if rule.get('explanation'):
                    entry['explanation'] = rule['explanation']
                entries.append(entry)
    ids = [entry['id'] for entry in entries]
    if len(ids) != len(set(ids)):
        raise ValueError('读音条目 ID 重复')
    return {'schemaVersion': 1, 'sources': rules['sources'], 'entries': entries}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true', help='验证现有文件可重建，不写入')
    args = parser.parse_args()
    result = compile_entries()
    data = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text(encoding='utf-8') != data:
            raise SystemExit('注音文件与审核规则重建结果不一致')
    else:
        OUTPUT.write_text(data, encoding='utf-8')
    for chapter_id in CHAPTERS:
        subset = [e for e in result['entries'] if e['chapterId'] == chapter_id]
        print(f"{chapter_id}: 正文 {sum(e['targetType']=='scene' for e in subset)}，裴注 {sum(e['targetType']=='note' for e in subset)}")
    print(f"共 {len(result['entries'])} 条；{'重建一致' if args.check else '已生成'}")


if __name__ == '__main__':
    main()
