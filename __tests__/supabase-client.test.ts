import { vi } from 'vitest'
import { createClient } from '@/lib/supabase/client'

// Mock the @supabase/ssr module
vi.mock('@supabase/ssr', () => ({
  createBrowserClient: vi.fn(),
}))

const { createBrowserClient } = await import('@supabase/ssr')

describe('Supabase Browser Client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Client Creation', () => {
    it('should create browser client with correct environment variables', () => {
      const mockClient = { auth: {}, from: vi.fn() }
      createBrowserClient.mockReturnValue(mockClient)

      const client = createClient()

      expect(createBrowserClient).toHaveBeenCalledWith(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      )
      expect(client).toBe(mockClient)
    })

    it('should use createBrowserClient from @supabase/ssr', () => {
      const mockClient = { auth: {}, from: vi.fn() }
      createBrowserClient.mockReturnValue(mockClient)

      createClient()

      expect(createBrowserClient).toHaveBeenCalled()
    })

    it('should return client instance', () => {
      const mockClient = { 
        auth: { signInWithOtp: vi.fn() }, 
        from: vi.fn() 
      }
      createBrowserClient.mockReturnValue(mockClient)

      const client = createClient()

      expect(client).toHaveProperty('auth')
      expect(client).toHaveProperty('from')
    })

    it('should be callable at module level', () => {
      // This test verifies that createClient doesn't require request context
      const mockClient = { auth: {}, from: vi.fn() }
      createBrowserClient.mockReturnValue(mockClient)

      // Should not throw when called outside a request
      expect(() => createClient()).not.toThrow()
    })

    it('should create new client on each call', () => {
      const mockClient1 = { id: 1, auth: {} }
      const mockClient2 = { id: 2, auth: {} }
      
      createBrowserClient
        .mockReturnValueOnce(mockClient1)
        .mockReturnValueOnce(mockClient2)

      const client1 = createClient()
      const client2 = createClient()

      expect(createBrowserClient).toHaveBeenCalledTimes(2)
      expect(client1).toBe(mockClient1)
      expect(client2).toBe(mockClient2)
    })
  })

  describe('Environment Variables', () => {
    it('should use NEXT_PUBLIC_SUPABASE_URL from environment', () => {
      const mockClient = { auth: {} }
      createBrowserClient.mockReturnValue(mockClient)

      createClient()

      expect(createBrowserClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        expect.any(String)
      )
    })

    it('should use NEXT_PUBLIC_SUPABASE_ANON_KEY from environment', () => {
      const mockClient = { auth: {} }
      createBrowserClient.mockReturnValue(mockClient)

      createClient()

      expect(createBrowserClient).toHaveBeenCalledWith(
        expect.any(String),
        'test-anon-key'
      )
    })
  })
})
