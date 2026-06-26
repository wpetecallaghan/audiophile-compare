// Type definitions for YouTube IFrame Player API
// https://developers.google.com/youtube/iframe_api_reference

declare namespace YT {
  export class Player {
    constructor(elementId: HTMLElement | string, options: PlayerOptions)
    
    // Playback controls
    playVideo(): void
    pauseVideo(): void
    stopVideo(): void
    seekTo(seconds: number, allowSeekAhead: boolean): void
    clearVideo(): void
    
    // Playback status
    getPlayerState(): PlayerState
    getCurrentTime(): number
    getDuration(): number
    getVideoUrl(): string
    getVideoEmbedCode(): string
    
    // Playlist
    nextVideo(): void
    previousVideo(): void
    getPlaylist(): string[]
    getPlaylistIndex(): number
    
    // Volume
    setVolume(volume: number): void
    getVolume(): number
    mute(): void
    unMute(): void
    isMuted(): boolean
    
    // Playback rate
    setPlaybackRate(suggestedRate: number): void
    getPlaybackRate(): number
    getAvailablePlaybackRates(): number[]
    
    // Video data
    getVideoData(): {
      video_id: string
      title: string
      author: string
    }
    
    // Destroy
    destroy(): void
  }

  export interface PlayerOptions {
    videoId?: string
    width?: string | number
    height?: string | number
    playerVars?: PlayerVars
    events?: Events
  }

  export interface PlayerVars {
    autoplay?: 0 | 1
    cc_load_policy?: 0 | 1
    color?: 'red' | 'white'
    controls?: 0 | 1 | 2
    disablekb?: 0 | 1
    enablejsapi?: 0 | 1
    end?: number
    fs?: 0 | 1
    hl?: string
    iv_load_policy?: 1 | 3
    list?: string
    listType?: 'playlist' | 'search' | 'user_uploads'
    loop?: 0 | 1
    modestbranding?: 0 | 1
    origin?: string
    playlist?: string
    playsinline?: 0 | 1
    rel?: 0 | 1
    start?: number
    widget_referrer?: string
  }

  export interface Events {
    onReady?: (event: PlayerEvent) => void
    onStateChange?: (event: OnStateChangeEvent) => void
    onPlaybackQualityChange?: (event: OnPlaybackQualityChangeEvent) => void
    onPlaybackRateChange?: (event: OnPlaybackRateChangeEvent) => void
    onError?: (event: OnErrorEvent) => void
    onApiChange?: (event: PlayerEvent) => void
  }

  export interface PlayerEvent {
    target: Player
  }

  export interface OnStateChangeEvent extends PlayerEvent {
    data: PlayerState
  }

  export interface OnPlaybackQualityChangeEvent extends PlayerEvent {
    data: string
  }

  export interface OnPlaybackRateChangeEvent extends PlayerEvent {
    data: number
  }

  export interface OnErrorEvent extends PlayerEvent {
    data: number
  }

  export enum PlayerState {
    UNSTARTED = -1,
    ENDED = 0,
    PLAYING = 1,
    PAUSED = 2,
    BUFFERING = 3,
    CUED = 5,
  }
}

// Extend the Window interface to include YouTube API globals
interface Window {
  YT: typeof YT | undefined
  onYouTubeIframeAPIReady: (() => void) | undefined
}
