import React, { useEffect } from 'react'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { StatusBar } from '@capacitor/status-bar'
import { SplashScreen } from '@capacitor/splash-screen'
import { KeepAwake } from '@capacitor-community/keep-awake'

function RootComponent() {
  useEffect(() => {
    // Hide System UI & Keep Screen Awake
    SplashScreen.hide().catch(() => {})
    StatusBar.hide().catch(() => {})
    KeepAwake.keepAwake().catch(() => {})

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
