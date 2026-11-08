import { deepEqual, equal, ok } from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { chapterSchema } from '../src/types.ts'
import type { Chapter } from '../src/types.ts'

const sample = JSON.parse(await readFile(new URL('../public/data/guandu.json', import.meta.url), 'utf8')) as Chapter

test('正式样章保留正文、裴注和未定位地名', () => {
  const result = chapterSchema.parse(sample)
  equal(result.scenes.length, 7)
  equal(result.notes.length, 5)
  deepEqual(result.places.filter(place => place.precision === 'unlocated').map(place => place.coordinates), [null,null,null])
  ok(result.notes.some(note => note.variants?.length))
})

test('拒绝悬空引用、无效坐标、变动正文和错挂裴注', () => {
  const chapter = structuredClone(sample)
  chapter.scenes[0].placeIds.push('missing-place')
  chapter.places[0].coordinates = [181,35]
  chapter.scenes[0].parts[0].text += '误'
  const note = chapter.notes[0]
  const scene = chapter.scenes.find(item => item.noteIds.includes(note.id))!
  const anchor = scene.parts.find(part => part.noteIds?.includes(note.id))!
  anchor.noteIds = anchor.noteIds!.filter(id => id !== note.id)
  const incorrectPart = scene.parts.find(part => part !== anchor)!
  incorrectPart.noteIds = [...(incorrectPart.noteIds ?? []),note.id]

  const result = chapterSchema.safeParse(chapter)
  ok(!result.success)
  const messages = result.error.issues.map(issue => issue.message)
  ok(messages.some(message => message.includes('missing-place')))
  ok(messages.some(message => message.includes('拼接')))
  ok(messages.some(message => message.includes('紧邻锚点')))
  ok(result.error.issues.some(issue => issue.path.join('.') === 'places.0.coordinates.0'))
})
