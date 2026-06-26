'use client'

type Props = {
  url: string
}

export default function UnknownPlayer({ url }: Props) {
  return (
    <div className="rounded border border-yellow-300 bg-yellow-50 p-4 text-sm space-y-2">
      <p className="font-medium text-yellow-800">
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