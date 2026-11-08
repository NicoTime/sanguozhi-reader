import { readFile, realpath, stat } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { ZodError } from 'zod'
import { catalogSchema, checkCatalogEntry } from '../src/catalog.ts'
import type { CatalogEntry } from '../src/catalog.ts'
import { verifyCoverage } from './coverage-audit.ts'
import { normalizeChapter, parseHistoricalRivers } from '../src/types.ts'
import type { Chapter } from '../src/types.ts'
import { atlasViewport } from '../src/atlas-viewport.ts'
import { atlasManifestSchema, parseAtlas } from '../src/historical-atlas.ts'
import { indexPronunciations, portraitSchema, pronunciationSchema } from '../src/reading-aids.ts'
import { dramaRegistrations, dramaSchema, indexDrama } from '../src/drama.ts'

const publicDir = await realpath(new URL('../public/',import.meta.url))
const manifests = new Map([
  ['/maps/central-plains-relief.jpg','maps/bounds.json'],
  ['/maps/eastern-china-relief.jpg','maps/eastern-china-bounds.json'],
])
const checkedAssets = new Map<string,string>()
const readJson = async (path:string):Promise<unknown> => JSON.parse(await readFile(path,'utf8'))
const run = promisify(execFile)

async function checkedAsset(path:string) {
  const checked = checkedAssets.get(path)
  if (checked) return checked
  const actual = await realpath(resolve(publicDir,path.replace(/^\//,'')))
  const local = relative(publicDir,actual)
  if (!local || local==='..' || local.startsWith('..'+sep) || isAbsolute(local) || !(await stat(actual)).isFile())
    throw new Error(`静态文件必须位于 public 下：${path}`)
  checkedAssets.set(path,actual)
  return actual
}

async function verify(file:string, entry?:CatalogEntry) {
  try {
    const chapter = normalizeChapter(await readJson(file))
    if (entry) checkCatalogEntry(entry,chapter)
    verifyCoverage(chapter)
    for (const profile of chapter.mapProfiles) {
      await checkedAsset(profile.reliefPath)
      const manifestPath = manifests.get(profile.reliefPath)
      if (manifestPath) {
        const manifest = JSON.parse(await readFile(resolve(publicDir,manifestPath),'utf8'))
        if ((['west','south','east','north'] as const).some(edge=>Math.abs(profile.bounds[edge]-manifest[edge])>1e-6))
          throw new Error(`mapProfiles.${profile.id}.bounds 与共享栅格实际四至不一致`)
      }
      for (const path of [profile.modernCitiesPath,profile.modernRiversPath]) if (path) await checkedAsset(path)
    }
    const {scenes,places,persons,notes,sources,historicalRiver} = chapter
    const riverCount = historicalRiver.geojsonPath
      ? parseHistoricalRivers(await readJson(await checkedAsset(historicalRiver.geojsonPath)),chapter).features.length : 0
    const phases = scenes.flatMap(scene=>scene.battlePhases ?? [])
    const marches = scenes.flatMap(scene=>scene.marches ?? [])
    if (chapter.coverageAudit) {
      const {paragraphs,bodyCharacters,noteCount} = chapter.coverageAudit
      console.log(`${chapter.id} 全文审计：${paragraphs.length} 个源段 / ${bodyCharacters} 正文字符 / ${noteCount} 裴注，逐段与注锚校验通过。`)
    }
    console.log(`${chapter.id} · ${chapter.meta.workTitle}：${scenes.length} 段，${notes.length} 裴注，${places.length} 地点，${persons.length} 人物，${sources.length} 来源，${phases.length} 态势，${marches.length} 行军（${marches.filter(march=>march.precision==='schematic').length} 可绘），${riverCount} 历史河道。`)
    return chapter
  } catch (error) {
    report(entry?.id ?? file,error)
  }
}

function report(label:string,error:unknown) {
  if (error instanceof ZodError) {
    for (const issue of error.issues) console.error(`${label} · ${issue.path.join('.')}: ${issue.message}`)
  } else console.error(`${label}：${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}

async function verifyReaderResources(chapters:Chapter[]) {
  const [manifest,pronunciation,portraits,imageBounds] = await Promise.all([
    readJson(await checkedAsset('/data/atlas-v7/manifest.json')).then(atlasManifestSchema.parse),
    readJson(await checkedAsset('/data/pronunciation-v7.json')).then(pronunciationSchema.parse),
    readJson(await checkedAsset('/portraits/manifest.json')).then(portraitSchema.parse),
    readJson(await checkedAsset('/maps/national-bounds.json')),
  ])
  await checkedAsset(atlasViewport.imagePath)
  const bounds = imageBounds as typeof atlasViewport.imageBounds
  const {overviewBounds,panBounds} = atlasViewport
  const edges = ['west','south','east','north'] as const
  if (edges.some(edge=>bounds[edge]!==atlasViewport.imageBounds[edge]) ||
      bounds.west>overviewBounds.west || bounds.south>overviewBounds.south ||
      bounds.east<overviewBounds.east || bounds.north<overviewBounds.north ||
      panBounds.west>=overviewBounds.west || panBounds.south>=overviewBounds.south ||
      panBounds.east<=overviewBounds.east || panBounds.north<=overviewBounds.north)
    throw new Error('全国栅格、总览范围或平移范围不一致')
  const geography = parseAtlas(await readJson(await checkedAsset(manifest.geojsonPath)),manifest)
  const chapterIds = new Set(chapters.map(chapter=>chapter.id))
  if (pronunciation.entries.some(entry=>!chapterIds.has(entry.chapterId)))
    throw new Error('注音引用未知卷 ID')
  for (const chapter of chapters) indexPronunciations(pronunciation,chapter)
  for (const person of portraits.persons) {
    if (!chapters.some(chapter=>chapter.persons.some(item=>item.id===person.personId && item.name===person.name)))
      throw new Error(`肖像引用未知人物 ${person.personId}`)
    await Promise.all(person.stages.map(stage=>checkedAsset(stage.imagePath)))
  }
  console.log(`伴读资源：${geography.features.length} 个图集要素，${pronunciation.entries.length} 条注音，${portraits.persons.length} 位人物肖像。`)
}

async function probeMedia(path:string) {
  const asset = await checkedAsset(path)
  if (!(await stat(asset)).size) throw new Error(`媒体文件为空：${path}`)
  const {stdout} = await run('ffprobe',['-v','error','-show_entries',
    'format=duration,format_name:stream=codec_name,codec_type,width,height,duration','-of','json',asset],{timeout:15000})
  return JSON.parse(stdout) as {format?:{duration?:string;format_name?:string};
    streams?:{codec_name:string;codec_type:string;width?:number;height?:number;duration?:string}[]}
}

async function verifyDrama(chapters:Chapter[]) {
 for (const registration of dramaRegistrations) {
  const manifestPath=await checkedAsset(registration.manifestPath)
  const bundle=dramaSchema.parse(await readJson(manifestPath))
  const chapter=chapters.find(item=>item.id===bundle.chapterId)
  if (!chapter || chapter.id!==registration.chapterId) throw new Error('演绎所属篇章与注册目录不匹配')
  indexDrama(bundle,chapter)
  const audioFormats:Record<string,string> = {mp3:'mp3',wav:'wav',m4a:'m4a',mp4:'mp4',aac:'aac',ogg:'ogg',opus:'ogg',webm:'webm'}
  for (const clip of bundle.clips) {
    const [audio,illustration]=await Promise.all([probeMedia(clip.audio.path),probeMedia(clip.illustration.path)])
    const stream=audio.streams?.find(item=>item.codec_type==='audio')
    const extension=clip.audio.path.split('.').at(-1)!
    if (!audio.format?.format_name?.split(',').includes(audioFormats[extension]))
      throw new Error(`${clip.id} 的音频容器和文件扩展名不一致`)
    const duration=Number(stream?.duration) || Number(audio.format?.duration)
    if (!stream || !Number.isFinite(duration) || duration<=0 || Math.abs(duration-clip.audio.durationSeconds)>.15)
      throw new Error(`${clip.id} 音频流或时长与清单不匹配（实测 ${duration} 秒）`)
    const image=illustration.streams?.find(item=>item.codec_type==='video' && item.codec_name==='webp')
    if (!image?.width || !image.height || Math.abs(image.width/image.height-16/9)>.02)
      throw new Error(`${clip.id} 插画须为可读取的 16:9 WebP`)
    console.log(`声音与插画：${bundle.chapterId}/${clip.id} · ${duration.toFixed(3)} 秒 · ${image.width} × ${image.height}。`)
  }
 }
}

try {
  if (process.argv[2]) await verify(resolve(process.argv[2]))
  else {
    const catalog = catalogSchema.parse(await readJson(resolve(publicDir,'data/catalog.json')))
    const chapters:Chapter[] = []
    for (const entry of catalog.entries) {
      try {
        const chapter = await verify(await checkedAsset(entry.dataPath),entry)
        if (chapter) chapters.push(chapter)
      }
      catch (error) {report(entry.id,error)}
    }
    if (chapters.length===catalog.entries.length) {
      await verifyReaderResources(chapters)
      await verifyDrama(chapters)
    }
  }
} catch (error) {
  report('catalog',error)
}
