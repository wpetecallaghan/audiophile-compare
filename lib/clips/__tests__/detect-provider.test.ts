import { describe, it, expect } from 'vitest'
import { detectProvider } from '../detect-provider'
import {
  PROVIDER_YOUTUBE,
  PROVIDER_VIMEO,
  PROVIDER_GOOGLE_DRIVE,
  PROVIDER_DIRECT,
  PROVIDER_UNKNOWN,
  MEDIA_TYPE_VIDEO,
  MEDIA_TYPE_UNKNOWN,
} from '../detect-provider'

describe('detectProvider', () => {

  describe('YouTube', () => {
    it('detects a standard watch URL', () => {
      const result = detectProvider('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
      expect(result.provider).toBe(PROVIDER_YOUTUBE)
      expect(result.embed_id).toBe('dQw4w9WgXcQ')
      expect(result.canonical_url).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ')
      expect(result.media_type).toBe(MEDIA_TYPE_VIDEO)
    })

    it('detects a shortened youtu.be URL', () => {
      const result = detectProvider('https://youtu.be/dQw4w9WgXcQ')
      expect(result.provider).toBe(PROVIDER_YOUTUBE)
      expect(result.embed_id).toBe('dQw4w9WgXcQ')
    })

    it('detects an already-embedded YouTube URL', () => {
      const result = detectProvider('https://www.youtube.com/embed/dQw4w9WgXcQ')
      expect(result.provider).toBe(PROVIDER_YOUTUBE)
      expect(result.embed_id).toBe('dQw4w9WgXcQ')
    })
  })

  describe('Vimeo', () => {
    it('detects a standard Vimeo URL', () => {
      const result = detectProvider('https://vimeo.com/123456789')
      expect(result.provider).toBe(PROVIDER_VIMEO)
      expect(result.embed_id).toBe('123456789')
      expect(result.canonical_url).toBe('https://player.vimeo.com/video/123456789')
    })

    it('detects an already-embedded Vimeo URL', () => {
      const result = detectProvider('https://player.vimeo.com/video/123456789')
      expect(result.provider).toBe(PROVIDER_VIMEO)
      expect(result.embed_id).toBe('123456789')
    })
  })

  describe('Google Drive', () => {
    it('detects a standard file share URL', () => {
      const result = detectProvider(
        'https://drive.google.com/file/d/1tzyg-oj6k007AnVSTXmmauTtZcsvUpUl/view?usp=sharing',
      )
      expect(result.provider).toBe(PROVIDER_GOOGLE_DRIVE)
      expect(result.embed_id).toBe('1tzyg-oj6k007AnVSTXmmauTtZcsvUpUl')
      expect(result.canonical_url).toBe(
        'https://drive.google.com/file/d/1tzyg-oj6k007AnVSTXmmauTtZcsvUpUl/preview',
      )
      expect(result.media_type).toBe(MEDIA_TYPE_VIDEO)
    })

    it('detects an already-embedded preview URL', () => {
      const result = detectProvider(
        'https://drive.google.com/file/d/1tzyg-oj6k007AnVSTXmmauTtZcsvUpUl/preview',
      )
      expect(result.provider).toBe(PROVIDER_GOOGLE_DRIVE)
      expect(result.embed_id).toBe('1tzyg-oj6k007AnVSTXmmauTtZcsvUpUl')
    })

    it('does not misdetect a Drive folder link as a file', () => {
      const result = detectProvider('https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp')
      expect(result.provider).not.toBe(PROVIDER_GOOGLE_DRIVE)
    })
  })

  describe('Dropbox', () => {
    it('rewrites a dl=0 share link to raw=1, preserving rlkey and other params', () => {
      const result = detectProvider(
        'https://www.dropbox.com/scl/fi/ialickzq1q7hg77kkj56o/IMG_0300.mov?rlkey=hmo5rrmnyrkibs8whu8hux6j1&st=sve9hgm9&dl=0',
      )
      expect(result.provider).toBe(PROVIDER_DIRECT)
      expect(result.canonical_url).toBe(
        'https://www.dropbox.com/scl/fi/ialickzq1q7hg77kkj56o/IMG_0300.mov?rlkey=hmo5rrmnyrkibs8whu8hux6j1&st=sve9hgm9&raw=1',
      )
    })

    it('adds raw=1 even when there is no dl param at all', () => {
      const result = detectProvider('https://www.dropbox.com/scl/fi/abc123/clip.mp4?rlkey=xyz')
      expect(result.canonical_url).toBe('https://www.dropbox.com/scl/fi/abc123/clip.mp4?rlkey=xyz&raw=1')
    })

    it('is idempotent for a URL already using raw=1', () => {
      const result = detectProvider('https://www.dropbox.com/scl/fi/abc123/clip.mp4?rlkey=xyz&raw=1')
      expect(result.canonical_url).toBe('https://www.dropbox.com/scl/fi/abc123/clip.mp4?rlkey=xyz&raw=1')
    })

    it('handles the bare dropbox.com host, not just www', () => {
      const result = detectProvider('https://dropbox.com/scl/fi/abc123/clip.mp4?rlkey=xyz&dl=0')
      expect(result.canonical_url).toBe('https://dropbox.com/scl/fi/abc123/clip.mp4?rlkey=xyz&raw=1')
    })
  })

  describe('direct', () => {
    it('classifies a direct audio URL as direct with unknown media_type', () => {
      // media_type for direct URLs is resolved by HEAD request, not URL pattern
      const result = detectProvider('https://example.com/recording.mp3')
      expect(result.provider).toBe(PROVIDER_DIRECT)
      expect(result.media_type).toBe(MEDIA_TYPE_UNKNOWN)
      expect(result.embed_id).toBeNull()
    })

    it('classifies a direct video URL as direct', () => {
      const result = detectProvider('https://example.com/recording.mp4')
      expect(result.provider).toBe(PROVIDER_DIRECT)
    })
  })

  describe('unknown', () => {
    it('returns unknown for a malformed URL', () => {
      const result = detectProvider('not-a-url')
      expect(result.provider).toBe(PROVIDER_UNKNOWN)
      expect(result.media_type).toBe(MEDIA_TYPE_UNKNOWN)
    })

    it('returns unknown for an empty string', () => {
      const result = detectProvider('')
      expect(result.provider).toBe(PROVIDER_UNKNOWN)
    })
  })
})
