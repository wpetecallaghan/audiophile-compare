'use client'

import { Callout } from '@/components/ui/Callout'

type Props = {
  url: string
}

export default function UnknownPlayer({ url }: Props) {
  return (
    <Callout tone="warning" className="text-sm space-y-2">
      <p className="font-medium text-amber-800 dark:text-amber-200">
        This URL could not be identified as a supported media source.
      </p>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 underline break-all"
      >
        Open link directly
      </a>
    </Callout>
  )
}