// Simple test to verify Jest setup is working
describe('Jest Setup', () => {
  it('should run tests successfully', () => {
    expect(true).toBe(true)
  })

  it('should have testing-library/jest-dom matchers', () => {
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
