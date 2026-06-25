// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// Mock environment variables for tests
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'

// Polyfill for Next.js server components
// Use the Headers from jsdom if available
if (typeof Headers === 'undefined') {
  global.Headers = class Headers {
    constructor(init?: HeadersInit) {
      this._headers = new Map()
      if (init) {
        if (init instanceof Headers) {
          init.forEach((value, key) => this.set(key, value))
        } else if (Array.isArray(init)) {
          init.forEach(([key, value]) => this.set(key, value))
        } else if (typeof init === 'object') {
          Object.entries(init).forEach(([key, value]) => this.set(key, value))
        }
      }
    }
    private _headers: Map<string, string>
    get(name: string) {
      return this._headers.get(name.toLowerCase()) || null
    }
    set(name: string, value: string) {
      this._headers.set(name.toLowerCase(), String(value))
    }
    has(name: string) {
      return this._headers.has(name.toLowerCase())
    }
    delete(name: string) {
      this._headers.delete(name.toLowerCase())
    }
    forEach(callback: (value: string, key: string, parent: Headers) => void, thisArg?: any) {
      this._headers.forEach((value, key) => callback.call(thisArg, value, key, this))
    }
    *entries() {
      yield* this._headers.entries()
    }
    *keys() {
      yield* this._headers.keys()
    }
    *values() {
      yield* this._headers.values()
    }
    [Symbol.iterator]() {
      return this.entries()
    }
  } as any
}

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: vi.fn(),
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      pathname: '/',
      query: {},
      asPath: '/',
    }
  },
  useSearchParams() {
    return new URLSearchParams()
  },
  usePathname() {
    return '/'
  },
}))

// Mock window.location
delete (window as any).location
;(window as any).location = {
  href: 'http://localhost:3000',
  origin: 'http://localhost:3000',
  pathname: '/',
  search: '',
  hash: '',
}
