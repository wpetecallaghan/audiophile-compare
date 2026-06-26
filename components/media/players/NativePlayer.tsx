'use client'

import { forwardRef, useImperativeHandle, useRef } from 'react'

// forwardRef and useImperativeHandle are how you expose methods from a child
// component to a parent. The parent holds a ref; the child defines what that
// ref can do. This is the React equivalent of an interface in .NET/Java.

export type PlayerHandle = {
  pause: () => void
}

type Props = {
  url: string
  mediaType: 'audio' | 'video'
  onPlay: () => void   // called when this player starts — tells the parent to pause the other
}

const NativePlayer = forwardRef<PlayerHandle, Props>(function NativePlayer(
  { url, mediaType, onPlay },
  ref
) {
  // useRef holds a reference to the DOM element itself.
  // elementRef.current will be the actual <audio> or <video> DOM node.
  const elementRef = useRef<HTMLAudioElement | HTMLVideoElement>(null)

  // useImperativeHandle defines what the parent sees when it holds a ref
  // to this component. We expose only pause() — the parent has no reason
  // to call play() on a player the user didn't interact with.
  useImperativeHandle(ref, () => ({
    pause() {
      elementRef.current?.pause()
    },
  }))

  const sharedProps = {
    src: url,
    controls: true,
    className: 'w-full',
    onPlay,   // fires when the user presses play on this element
  }

  if (mediaType === 'audio') {
    return (
      <audio
        ref={elementRef as React.RefObject<HTMLAudioElement>}
        {...sharedProps}
      />
    )
  }

  return (
    <video
      ref={elementRef as React.RefObject<HTMLVideoElement>}
      {...sharedProps}
    />
  )
})

export default NativePlayer