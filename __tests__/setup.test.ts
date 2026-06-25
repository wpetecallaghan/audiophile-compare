// Simple test to verify Vitest setup is working
describe('Vitest Setup', () => {
  it('should run tests successfully', () => {
    expect(true).toBe(true)
  })

  it('should have testing-library matchers', () => {
    const element = document.createElement('div')
    element.textContent = 'Hello'
    document.body.appendChild(element)
    expect(element).toBeInTheDocument()
    document.body.removeChild(element)
  })

  it('should have environment variables mocked', () => {
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('https://test.supabase.co')
    expect(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe('test-anon-key')
  })
})
