import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import MappingBadge from '../MappingBadge'

describe('MappingBadge', () => {
  it('renders both clip labels with no "Revealed" heading and no Before/After wording (step 67)', () => {
    render(<MappingBadge />)

    expect(screen.getByText('Clip A')).toBeInTheDocument()
    expect(screen.getByText('Clip B')).toBeInTheDocument()
    expect(screen.queryByText('Revealed')).not.toBeInTheDocument()
    expect(screen.queryByText('Before')).not.toBeInTheDocument()
    expect(screen.queryByText('After')).not.toBeInTheDocument()
  })

  it("renders each side's snapshot summary under its label", () => {
    render(
      <MappingBadge
        snapshotA={{ label: 'v1 baseline', system: { name: 'Living room rig' } }}
        snapshotB={{ label: 'v2 new DAC', system: { name: 'Living room rig' } }}
      />
    )

    expect(screen.getByText('Living room rig · v1 baseline')).toBeInTheDocument()
    expect(screen.getByText('Living room rig · v2 new DAC')).toBeInTheDocument()
  })

  it('omits the snapshot summary line when a snapshot is null', () => {
    render(<MappingBadge snapshotA={null} snapshotB={null} />)

    expect(screen.queryByText(/·/)).not.toBeInTheDocument()
  })

  it('renders an "Open link directly" link for an unsupported clip, alongside its snapshot summary', () => {
    render(
      <MappingBadge
        clipAUnsupportedUrl="https://example.com/clip-a"
        snapshotA={{ label: 'v1 baseline', system: { name: 'Living room rig' } }}
      />
    )

    const link = screen.getByRole('link', { name: 'Open link directly' })
    expect(link).toHaveAttribute('href', 'https://example.com/clip-a')
    expect(screen.getByText('Living room rig · v1 baseline')).toBeInTheDocument()
  })

  it('renders no link for a clip with a working embedded player', () => {
    render(<MappingBadge snapshotA={{ label: 'v1 baseline', system: { name: 'Living room rig' } }} />)

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
