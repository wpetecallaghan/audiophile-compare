export const routes = {
  home: () => '/',
  login: (redirectTo?: string) =>
    redirectTo ? `/login?redirectTo=${encodeURIComponent(redirectTo)}` : '/login',
  systems: () => '/systems',
  systemNew: () => '/systems/new',
  system: (id: string) => `/systems/${id}`,
  systemEdit: (id: string) => `/systems/${id}/edit`,
  tracks: () => '/tracks',
  track: (id: string) => `/tracks/${id}`,
  testNew: () => '/tests/new',
  test: (id: string) => `/tests/${id}`,
  profile: () => '/profile',
  authCallback: () => '/auth/callback',
} as const
