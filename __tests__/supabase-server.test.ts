import { vi } from 'vitest'
import { createClient } from '@/lib/supabase/server'

// Mock Next.js cookies
const mockCookies = {
  getAll: vi.fn(),
  set: vi.fn(),
}

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve(mockCookies)),
}))

// Mock @supabase/ssr
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(),
}))

const { createServerClient } = await import('@supabase/ssr')
const { cookies } = await import('next/headers')

describe('Supabase Server Client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCookies.getAll.mockReturnValue([])
  })

  describe('Client Creation', () => {
    it('should create server client with correct environment variables', async () => {
      const mockClient = { auth: {}, from: vi.fn() }
      createServerClient.mockReturnValue(mockClient)

      await createClient()

      expect(createServerClient).toHaveBeenCalledWith(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        expect.objectContaining({
          cookies: expect.any(Object),
        })
      )
    })

    it('should await cookies() before accessing cookie store', async () => {
      const mockClient = { auth: {} }
      createServerClient.mockReturnValue(mockClient)

      await createClient()

      expect(cookies).toHaveBeenCalled()
    })

    it('should configure cookie handlers', async () => {
      const mockClient = { auth: {} }
      createServerClient.mockReturnValue(mockClient)

      await createClient()

      const callArgs = createServerClient.mock.calls[0]
      const options = callArgs[2]

      expect(options.cookies).toHaveProperty('getAll')
      expect(options.cookies).toHaveProperty('setAll')
      expect(typeof options.cookies.getAll).toBe('function')
      expect(typeof options.cookies.setAll).toBe('function')
    })

    it('should return Supabase client instance', async () => {
      const mockClient = { 
        auth: { getUser: vi.fn() }, 
        from: vi.fn() 
      }
      createServerClient.mockReturnValue(mockClient)

      const client = await createClient()

      expect(client).toBe(mockClient)
    })
  })

  describe('Cookie Handling', () => {
    it('should call getAll() to retrieve cookies', async () => {
      const mockClient = { auth: {} }
      createServerClient.mockImplementation((url, key, options) => {
        // Simulate calling getAll
        options.cookies.getAll()
        return mockClient
      })

      mockCookies.getAll.mockReturnValue([
        { name: 'sb-token', value: 'token-123' }
      ])

      await createClient()

      expect(mockCookies.getAll).toHaveBeenCalled()
    })

    it('should call setAll() when setting cookies', async () => {
      const mockClient = { auth: {} }
      createServerClient.mockImplementation((url, key, options) => {
        // Simulate calling setAll
        options.cookies.setAll([
          { name: 'sb-token', value: 'new-token', options: {} }
        ])
        return mockClient
      })

      await createClient()

      expect(mockCookies.set).toHaveBeenCalledWith('sb-token', 'new-token', {})
    })

    it('should handle setAll gracefully when called from Server Component', async () => {
      const mockClient = { auth: {} }
      createServerClient.mockImplementation((url, key, options) => {
        // Simulate setAll being called in a Server Component
        // where setting cookies might fail
        options.cookies.setAll([
          { name: 'sb-token', value: 'new-token', options: {} }
        ])
        return mockClient
      })

      mockCookies.set.mockImplementation(() => {
        throw new Error('Cannot set cookies in Server Component')
      })

      // Should not throw - the try/catch should handle it
      await expect(createClient()).resolves.not.toThrow()
    })

    it('should provide setAll function for setting cookies', async () => {
      const mockClient = { auth: {} }
      let capturedOptions
      
      createServerClient.mockImplementation((url, key, options) => {
        capturedOptions = options
        return mockClient
      })

      await createClient()
      
      // Verify setAll exists and is a function
      expect(typeof capturedOptions.cookies.setAll).toBe('function')
      
      // Calling setAll should invoke mockCookies.set
      capturedOptions.cookies.setAll([
        { name: 'test', value: 'value', options: {} },
      ])

      expect(mockCookies.set).toHaveBeenCalled()
    })
  })

  describe('Environment Variables', () => {
    it('should use NEXT_PUBLIC_SUPABASE_URL from environment', async () => {
      const mockClient = { auth: {} }
      createServerClient.mockReturnValue(mockClient)

      await createClient()

      expect(createServerClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        expect.any(String),
        expect.any(Object)
      )
    })

    it('should use NEXT_PUBLIC_SUPABASE_ANON_KEY from environment', async () => {
      const mockClient = { auth: {} }
      createServerClient.mockReturnValue(mockClient)

      await createClient()

      expect(createServerClient).toHaveBeenCalledWith(
        expect.any(String),
        'test-anon-key',
        expect.any(Object)
      )
    })
  })
})
