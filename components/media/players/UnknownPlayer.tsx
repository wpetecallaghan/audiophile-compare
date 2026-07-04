'use client'

type Props = {
  url: string
}

export default function UnknownPlayer({ url }: Props) {
  return (
    <div className="rounded border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm space-y-2">
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
    </div>
  )
}