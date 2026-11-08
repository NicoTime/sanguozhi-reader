import { z } from 'zod'
import { chapterDataPath, coverage, identifier, normalizeChapter } from './types'
import type { Chapter } from './types'

const label = z.string().min(1).refine(value => !!value.trim(),'不可只有空白')
export const catalogEntrySchema = z.object({
  id:identifier,workTitle:label,protagonist:label,division:label,volume:label,
  description:label,coverage,coverageLabel:label,dataPath:chapterDataPath,
})
export const catalogShape = z.object({schemaVersion:z.literal(1),title:label,entries:z.array(catalogEntrySchema).min(1)})
export const catalogSchema = catalogShape.superRefine((catalog,ctx) => {
  const ids = new Set<string>(), paths = new Set<string>()
  catalog.entries.forEach((entry,i) => {
    if (ids.has(entry.id)) ctx.addIssue({code:'custom',path:['entries',i,'id'],message:'重复篇章 ID'})
    if (paths.has(entry.dataPath)) ctx.addIssue({code:'custom',path:['entries',i,'dataPath'],message:'重复篇章路径'})
    ids.add(entry.id)
    paths.add(entry.dataPath)
  })
})
export type Catalog = z.infer<typeof catalogSchema>
export type CatalogEntry = z.infer<typeof catalogEntrySchema>

export function checkCatalogEntry(entry:CatalogEntry, chapter:Chapter) {
  const {id,meta} = chapter
  if (id!==entry.id) throw new Error(`目录 ID ${entry.id} 与篇章 ID ${id} 不一致`)
  for (const key of ['workTitle','protagonist','division','volume','coverage','coverageLabel'] as const) {
    if (entry[key]!==meta[key]) throw new Error(`目录 ${entry.id}.${key} 与篇章 meta.${key} 不一致`)
  }
}

export type Route = {kind:'catalog'} | {kind:'read';id:string} | {kind:'invalid'}
export function parseRoute(hash:string):Route {
  if (!hash || hash==='#' || hash==='#/') return {kind:'catalog'}
  const match = /^#\/read\/([a-zA-Z0-9_-]+)$/.exec(hash)
  return match ? {kind:'read',id:match[1]} : {kind:'invalid'}
}
export const chapterHref = (id:string) => `#/read/${id}`
export const publicUrl = (base:string,path:string) => base+path.replace(/^\//,'')

export async function fetchChapter(entry:CatalogEntry, base:string, signal:AbortSignal, request:typeof fetch = fetch) {
  const response = await request(publicUrl(base,entry.dataPath),{signal,cache:'no-cache'})
  signal.throwIfAborted()
  if (!response.ok) throw new Error(`篇章读取失败：HTTP ${response.status}`)
  const raw:unknown = await response.json()
  signal.throwIfAborted()
  const chapter = normalizeChapter(raw)
  checkCatalogEntry(entry,chapter)
  return chapter
}
