import React, { useEffect } from 'react'
import { createRootRoute, Outlet } from '@tanstack/react-router'

function RootComponent() {
  useEffect(() => {
    // Native-only setup (Capacitor). Skipped gracefully on web.
    const load = (name: string): Promise<any> =>
      import(/* @vite-ignore */ name).catch(() => null)

    const setupNative = async () => {
      const [splash, status, awake] = await Promise.all([
        load('@capacitor/splash-screen'),
        load('@capacitor/status-bar'),
        load('@capacitor-community/keep-awake'),
      ])
      splash?.SplashScreen?.hide?.().catch(() => {})
      status?.StatusBar?.hide?.().catch(() => {})
      awake?.KeepAwake?.keepAwake?.().catch(() => {})
    }
    setupNative()



    // --- Audio Freeze & Background Pause Fix ---
    const playingMedia = new Set<HTMLMediaElement>()
    const pausedByBackground = new Set<HTMLMediaElement>()

    const handlePlay = (e: Event) => {
      if (e.target instanceof HTMLMediaElement) playingMedia.add(e.target)
    }
    const handlePause = (e: Event) => {
      if (e.target instanceof HTMLMediaElement) playingMedia.delete(e.target)
    }
    const handleVisibilityChange = () => {
      if (document.hidden) {
        playingMedia.forEach((media) => {
          if (!media.paused) {
            media.pause()
            pausedByBackground.add(media)
          }
        })
      } else {
        pausedByBackground.forEach((media) => {
          media.play().catch(() => {})
        })
        pausedByBackground.clear()
      }
    }

    document.addEventListener('play', handlePlay, true)
    document.addEventListener('pause', handlePause, true)
    document.addEventListener('ended', handlePause, true)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('play', handlePlay, true)
      document.removeEventListener('pause', handlePause, true)
      document.removeEventListener('ended', handlePause, true)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return <Outlet />
}

export const Route = createRootRoute({
  component: RootComponent,
})
