import { deepEqual, equal, throws } from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { dramaSchema,indexDrama } from '../src/drama.ts'
import { normalizeChapter } from '../src/types.ts'

const chapter = normalizeChapter(JSON.parse(await readFile(new URL('../public/data/chapters/wudi/chapter.json',import.meta.url),'utf8')))
const samples = [
  {id:'eastward-decision',sceneId:'wudi-p45',textOffset:62,text:'夫刘备，人杰也，今不击，必为后患。袁绍虽有大志，而见事遟，必不动也。'},
  {id:'wuchao-command',sceneId:'wudi-wuchao-night-raid',textOffset:145,text:'贼在背后，乃白！'},
  {id:'wisdom-of-the-realm',sceneId:'wudi-p60',textOffset:81,text:'吾任天下之智力，以道御之，无所不可。'},
  {id:'gather-heroes',sceneId:'wudi-p32',textOffset:50,text:'方今收英雄时也，杀一人而失天下之心，不可。'},
  {id:'recognize-bi-chen',sceneId:'wudi-p39',textOffset:88,text:'夫人孝于其亲者，岂不亦忠于君乎！吾所求也。'},
  {id:'remit-hebei-tax',sceneId:'wudi-p61',textOffset:7,text:'河北罹袁氏之难，其令无出今年租赋！'},
  {id:'warn-surrendered-civilian',sceneId:'wudi-p63',textOffset:132,text:'听汝则违令，杀汝则诛首，归深自藏，无为吏所获。'},
]
const fixture = {
  schemaVersion:1,chapterId:'wudi',endHoldMs:4000,disclaimer:'测试用演绎清单',
  clips:samples.map(({id,sceneId,textOffset,text})=>({
    id,sceneId,speakerId:'cao-cao',title:'测试引文',quote:{textOffset,text},
    audio:{path:`media/drama-v8/audio/${id}.mp3`,mimeType:'audio/mpeg',durationSeconds:2},
    illustration:{path:`media/drama-v8/images/${id}.webp`,alt:'测试图'},
    contextNote:'测试数据',sourceIds:['epub-simplified'],
  })),
}

const parseAndIndex = (raw:unknown) => indexDrama(dramaSchema.parse(raw),chapter)

test('v10 十一条批准 ID 与四段长引文完整绑定，不截短字幕正文',()=>{
  const additions = [
    {id:'acknowledge-defeat',sceneId:'wudi-p34',textOffset:81,length:38,text:'吾降张绣等，失不便取其质，以至于此。吾知所以败。诸卿观之，自今已后不复败矣。'},
    {id:'care-for-bereaved',sceneId:'wudi-p53',textOffset:14,length:104,text:'吾起义兵，为天下除暴乱。旧土人民，死丧略尽，国中终日行，不见所识，使吾凄怆伤怀。其举义兵已来，将士绝无后者，求其亲戚以后之，授上田，官给耕牛，置学师以教之。为存者立庙，使祀其先人，魂而有灵，吾百年之后何恨哉！'},
    {id:'share-credit',sceneId:'wudi-p69',textOffset:21,length:71,text:'吾起义兵诛暴乱，于今十九年，所征必克，岂吾功哉？乃贤士大夫之力也。天下虽未悉定，吾当要与贤士大夫共定之；而专飨其劳，吾何以安焉！其促定功行封。'},
    {id:'final-instructions',sceneId:'wudi-p121',textOffset:19,length:53,text:'天下尚未安定，未得遵古也。葬毕，皆除服。其将兵屯戍者，皆不得离屯部。有司各率乃职。敛以时服，无藏金玉珍宝。'},
  ]
  const bundle=dramaSchema.parse({...fixture,clips:[...fixture.clips,...additions.map(item=>({
    ...fixture.clips[0],id:item.id,sceneId:item.sceneId,quote:{textOffset:item.textOffset,text:item.text},
    audio:{path:`media/drama-v8/audio/${item.id}.wav`,mimeType:'audio/wav',durationSeconds:60},
    illustration:{path:`media/drama-v8/images/${item.id}.webp`,alt:'测试图'},
  }))]})
  const indexed=[...indexDrama(bundle,chapter).values()].flat()
  deepEqual(indexed.map(item=>item.id),[
    'eastward-decision','wuchao-command','wisdom-of-the-realm','gather-heroes',
    'recognize-bi-chen','remit-hebei-tax','warn-surrendered-civilian',
    'acknowledge-defeat','care-for-bereaved','share-credit','final-instructions',
  ])
  for (const addition of additions) {
    const item=indexed.find(clip=>clip.id===addition.id)!
    equal(item.quote.text,addition.text)
    equal(Array.from(item.quote.text).length,addition.length)
  }
})

test('清单支持冻结七条及原三条，不把 ID 或数量写死',()=>{
  deepEqual([...parseAndIndex(fixture).values()].flat().map(clip=>clip.id),samples.map(item=>item.id))
  const original = {...fixture,clips:fixture.clips.slice(0,3)}
  equal(parseAndIndex(original).size,3)
  const future = structuredClone({...fixture,clips:fixture.clips.slice(3,4)})
  future.clips[0].id='future-direct-speech'
  future.clips[0].audio.path='media/drama-v8/audio/future-direct-speech.mp3'
  future.clips[0].illustration.path='media/drama-v8/images/future-direct-speech.webp'
  equal(parseAndIndex(future).get('wudi-p32')?.[0].id,'future-direct-speech')
  equal(dramaSchema.safeParse({...fixture,clips:[]}).success,false)
})

test('连续引文跨裴注锚及人物链接，偏移按 Unicode 码点计数',()=>{
  const bundle = dramaSchema.parse(fixture)
  const first = chapter.scenes.find(scene=>scene.id==='wudi-p45')!
  const anchor = first.parts.findIndex(part=>part.noteIds?.includes('wudi-p45-note0'))
  equal(first.parts.slice(0,anchor+1).map(part=>part.text).join('').endsWith('后患。'),true)
  equal(first.parts[anchor+1].personId,'yuan-shao')
  const supplement = structuredClone(chapter)
  supplement.scenes.find(scene=>scene.id===first.id)!.originalText='𬘭'+first.originalText
  throws(()=>indexDrama(bundle,supplement),/引文与原文偏移/)
  bundle.clips[0].quote.textOffset++
  equal(indexDrama(bundle,supplement).size,7)
})

test('同 scene 两处引文全部保留，并按原文偏移排列而不修改清单顺序',()=>{
  const early = structuredClone(fixture.clips[0])
  early.quote.text='夫刘备，人杰也，今不击，必为后患。'
  const late = structuredClone(fixture.clips[0])
  late.id='judge-yuan-shao'
  late.audio.path='media/drama-v8/audio/judge-yuan-shao.mp3'
  late.illustration.path='media/drama-v8/images/judge-yuan-shao.webp'
  late.quote.text='袁绍虽有大志，而见事遟，必不动也。'
  late.quote.textOffset+=Array.from(early.quote.text).length
  const bundle=dramaSchema.parse({...fixture,clips:[late,early]})
  deepEqual(indexDrama(bundle,chapter).get('wudi-p45')?.map(item=>item.id),['eastward-decision','judge-yuan-shao'])
  deepEqual(bundle.clips.map(item=>item.id),['judge-yuan-shao','eastward-decision'])
})

test('重复 ID 及同 scene 重叠引文必须报错',()=>{
  equal(dramaSchema.safeParse({...fixture,clips:[...fixture.clips,fixture.clips[0]]}).success,false)
  const duplicateQuote=structuredClone(fixture.clips[0])
  duplicateQuote.id='duplicate-quote'
  duplicateQuote.audio.path='media/drama-v8/audio/duplicate-quote.mp3'
  duplicateQuote.illustration.path='media/drama-v8/images/duplicate-quote.webp'
  throws(()=>parseAndIndex({...fixture,clips:[fixture.clips[0],duplicateQuote]}),/引文范围重叠/)
})

test('场景不存在、引文错配、错字和偏移越界均不能跳过',()=>{
  for (const change of [
    {sceneId:'missing-scene'},
    {sceneId:'wudi-p60'},
    {quote:{textOffset:62,text:'夫刘备，人杰也，今不击，必为后思。'}},
    {quote:{textOffset:999999,text:fixture.clips[0].quote.text}},
  ]) {
    const invalid=structuredClone(fixture)
    Object.assign(invalid.clips[0],change)
    throws(()=>parseAndIndex(invalid),/场景或说话人不存在|引文与原文偏移/)
  }
})

test('来源必须存在且唯一，说话人必须属于篇章及所选场景',()=>{
  for (const sourceIds of [['missing-source'],['epub-simplified','epub-simplified']]) {
    const invalid=structuredClone(fixture)
    invalid.clips[0].sourceIds=sourceIds
    throws(()=>parseAndIndex(invalid),/来源不存在或重复/)
  }
  const bundle=dramaSchema.parse(fixture)
  const absentPerson=structuredClone(chapter)
  absentPerson.persons=absentPerson.persons.filter(item=>item.id!=='cao-cao')
  throws(()=>indexDrama(bundle,absentPerson),/场景或说话人不存在/)
  const absentScenePerson=structuredClone(chapter)
  absentScenePerson.scenes.find(item=>item.id==='wudi-p45')!.personIds=[]
  throws(()=>indexDrama(bundle,absentScenePerson),/场景或说话人不存在/)
  throws(()=>indexDrama(bundle,{...chapter,id:'another-chapter'}),/所属篇章不匹配/)
})

test('拒绝外部和穿越路径、错误文件名及 MIME',()=>{
  for (const path of ['https://example.invalid/voice.mp3','media/drama-v8/audio/../voice.mp3','media/drama-v8/audio/wrong-id.mp3']) {
    const invalid=structuredClone(fixture)
    invalid.clips[0].audio.path=path
    equal(dramaSchema.safeParse(invalid).success,false)
  }
  const invalid=structuredClone(fixture)
  invalid.clips[0].audio.mimeType='audio/wav'
  equal(dramaSchema.safeParse(invalid).success,false)
  invalid.clips[0].audio.mimeType='audio/mpeg'
  invalid.clips[0].illustration.path='media/drama-v8/images/wrong-id.webp'
  equal(dramaSchema.safeParse(invalid).success,false)
  invalid.clips[0].id='../invalid-id'
  equal(dramaSchema.safeParse(invalid).success,false)
})
