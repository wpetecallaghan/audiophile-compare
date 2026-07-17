import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import MappingBadge from '../MappingBadge'

const CLIP_A_ID = 'clip-a-uuid'
const CLIP_B_ID = 'clip-b-uuid'

describe('MappingBadge', () => {
  it('labels clip A "Before" and clip B "After" when A is the before clip', () => {
    render(
      <MappingBadge clipAId={CLIP_A_ID} beforeClipId={CLIP_A_ID} afterClipId={CLIP_B_ID} />
    )

    expect(screen.getByText('Clip A').nextSibling).toHaveTextContent('Before')
    expect(screen.getByText('Clip B').nextSibling).toHaveTextContent('After')
  })

  it('labels clip A "After" and clip B "Before" when B is the before clip', () => {
    render(
      <MappingBadge clipAId={CLIP_A_ID} beforeClipId={CLIP_B_ID} afterClipId={CLIP_A_ID} />
    )

    expect(screen.getByText('Clip A').nextSibling).toHaveTextContent('After')
    expect(screen.getByText('Clip B').nextSibling).toHaveTextContent('Before')
  })

  it('renders each side\'s snapshot summary next to its label', () => {
    render(
      <MappingBadge
        clipAId={CLIP_A_ID}
        beforeClipId={CLIP_A_ID}
        afterClipId={CLIP_B_ID}
        snapshotA={{ label: 'v1 baseline', system: { name: 'Living room rig' } }}
        snapshotB={{ label: 'v2 new DAC', system: { name: 'Living room rig' } }}
      />
    )

    expect(screen.getByText('Living room rig · v1 baseline')).toBeInTheDocument()
    expect(screen.getByText('Living room rig · v2 new DAC')).toBeInTheDocument()
  })

  it('omits the snapshot summary line when a snapshot is null', () => {
    render(
      <MappingBadge
        clipAId={CLIP_A_ID}
        beforeClipId={CLIP_A_ID}
        afterClipId={CLIP_B_ID}
        snapshotA={null}
        snapshotB={null}
      />
    )

    expect(screen.queryByText(/·/)).not.toBeInTheDocument()
  })

  it('wraps only the Before/After text in the unsupported-clip link, not the snapshot line', () => {
    render(
      <MappingBadge
        clipAId={CLIP_A_ID}
        beforeClipId={CLIP_A_ID}
        afterClipId={CLIP_B_ID}
        clipAUnsupportedUrl="https://example.com/clip-a"
        snapshotA={{ label: 'v1 baseline', system: { name: 'Living room rig' } }}
      />
    )

    const link = screen.getByRole('link', { name: 'Before' })
    expect(link).toHaveAttribute('href', 'https://example.com/clip-a')
    expect(link).toHaveTextContent('Before')
    expect(link).not.toHaveTextContent('Living room rig')
    expect(screen.getByText('Living room rig · v1 baseline')).toBeInTheDocument()
  })
})
