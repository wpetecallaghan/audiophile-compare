// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

// Mock environment variables for tests
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'

// Polyfill for Next.js server components
// Use the Headers from jsdom if available
if (typeof Headers === 'undefined') {
  global.Headers = class Headers {
    constructor(init) {
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
    get(name) {
      return this._headers.get(name.toLowerCase()) || null
    }
    set(name, value) {
      this._headers.set(name.toLowerCase(), String(value))
    }
    has(name) {
      return this._headers.has(name.toLowerCase())
    }
    delete(name) {
      this._headers.delete(name.toLowerCase())
    }
    forEach(callback, thisArg) {
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
  }
}

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
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
delete window.location
window.location = {
  href: 'http://localhost:3000',
  origin: 'http://localhost:3000',
  pathname: '/',
  search: '',
  hash: '',
}
