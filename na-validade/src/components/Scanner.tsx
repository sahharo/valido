import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser'
import { CameraOff } from 'lucide-react'

// Camera barcode reader (EAN-13, EAN-8, UPC, Code128, QR...) powered by the open-source ZXing library.
export function Scanner({ onDetected }: { onDetected: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const detectedRef = useRef(onDetected)
  useEffect(() => {
    detectedRef.current = onDetected
  }, [onDetected])

  useEffect(() => {
    let cancelled = false
    let controls: IScannerControls | undefined
    const reader = new BrowserMultiFormatReader()

    reader
      .decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' } } },
        videoRef.current!,
        (result, _err, c) => {
          if (result && !cancelled) {
            cancelled = true
            c.stop()
            navigator.vibrate?.(80)
            detectedRef.current(result.getText())
          }
        },
      )
      .then((c) => {
        controls = c
        // The component may have unmounted before the camera finished starting.
        if (cancelled) c.stop()
      })
      .catch(() => setError('Não foi possível acessar a câmera. Verifique a permissão ou digite o código abaixo.'))

    return () => {
      cancelled = true
      controls?.stop()
    }
  }, [])

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-danger-bg p-6 text-center text-danger">
        <CameraOff className="h-8 w-8" />
        <p className="text-sm font-semibold">{error}</p>
      </div>
    )
  }

  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-black shadow-inner">
      <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
      <div className="pointer-events-none absolute inset-6 rounded-xl border-2 border-white/70">
        <div className="absolute inset-x-3 h-0.5 animate-scan rounded-full bg-accent" />
      </div>
      <p className="absolute inset-x-0 bottom-2 text-center text-xs font-semibold text-white/80">
        Aponte para o código de barras
      </p>
    </div>
  )
}
