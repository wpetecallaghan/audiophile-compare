import { describe, it, expect } from 'vitest'
import { detectProvider } from '../detect-provider'

describe('detectProvider', () => {

  describe('YouTube', () => {
    it('detects a standard watch URL', () => {
      const result = detectProvider('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
      expect(result.provider).toBe('youtube')
      expect(result.embed_id).toBe('dQw4w9WgXcQ')
      expect(result.canonical_url).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ')
      expect(result.media_type).toBe('video')
    })

    it('detects a shortened youtu.be URL', () => {
      const result = detectProvider('https://youtu.be/dQw4w9WgXcQ')
      expect(result.provider).toBe('youtube')
      expect(result.embed_id).toBe('dQw4w9WgXcQ')
    })

    it('detects an already-embedded YouTube URL', () => {
      const result = detectProvider('https://www.youtube.com/embed/dQw4w9WgXcQ')
      expect(result.provider).toBe('youtube')
      expect(result.embed_id).toBe('dQw4w9WgXcQ')
    })
  })

  describe('Vimeo', () => {
    it('detects a standard Vimeo URL', () => {
      const result = detectProvider('https://vimeo.com/123456789')
      expect(result.provider).toBe('vimeo')
      expect(result.embed_id).toBe('123456789')
      expect(result.canonical_url).toBe('https://player.vimeo.com/video/123456789')
    })

    it('detects an already-embedded Vimeo URL', () => {
      const result = detectProvider('https://player.vimeo.com/video/123456789')
      expect(result.provider).toBe('vimeo')
      expect(result.embed_id).toBe('123456789')
    })
  })

  describe('direct', () => {
    it('classifies a direct audio URL as direct with unknown media_type', () => {
      // media_type for direct URLs is resolved by HEAD request, not URL pattern
      const result = detectProvider('https://example.com/recording.mp3')
      expect(result.provider).toBe('direct')
      expect(result.media_type).toBe('unknown')
      expect(result.embed_id).toBeNull()
    })

    it('classifies a direct video URL as direct', () => {
      const result = detectProvider('https://example.com/recording.mp4')
      expect(result.provider).toBe('direct')
    })
  })

  describe('unknown', () => {
    it('returns unknown for a malformed URL', () => {
      const result = detectProvider('not-a-url')
      expect(result.provider).toBe('unknown')
      expect(result.media_type).toBe('unknown')
    })

    it('returns unknown for an empty string', () => {
      const result = detectProvider('')
      expect(result.provider).toBe('unknown')
    })
  })
})