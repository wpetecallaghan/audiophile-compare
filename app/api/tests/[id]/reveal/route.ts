import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { revalidateTag } from 'next/cache'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  // Ownership check — never trust the client
  const { data: test } = await supabase
    .from('tests')
    .select('creator_id, status')
    .eq('id', id)
    .single()

  if (!test) {
    return NextResponse.json({ error: 'Test not found' }, { status: 404 })
  }

  if (test.creator_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (test.status === 'revealed') {
    return NextResponse.json({ error: 'Already revealed' }, { status: 409 })
  }

  const { error } = await supabase
    .from('tests')
    .update({
      status:      'revealed',
      revealed_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // step 75 — status/revealed_at are part of the cached test-core data.
  // { expire: 0 } forces immediate expiration regardless of the entry's
  // own revalidate window — revalidateTag's second (profile) argument is
  // required as of this Next.js version; a named string profile would
  // need registering in next.config's cacheLife, which this codebase
  // deliberately doesn't use (see build-history/75-*.md).
  revalidateTag(`test-${id}`, { expire: 0 })

  return NextResponse.json({ ok: true })
}