import { useDialKit } from 'dialkit'
import { imageDials } from './image-dials'
import { focusDials } from './focus-dials'
import { gradientDials } from './gradient-dials'
import { copyVisualSettingsToClipboard } from './visual-settings-snapshot'
import { useEffect } from 'react'

export function VisualDials() {
  const params = useDialKit(
    'Visual',
    {
      size: {
        imageSize: [1.7, 0.4, 4, 0.05],
      },
      rotation: {
        zSpread: [0.08, 0, 1, 0.01],
        xSpread: [0, 0, 0.4, 0.005],
        ySpread: [0, 0, 0.4, 0.005],
      },
      focusPadding: {
        topGap: [32, 0, 150, 4],
        bottomGap: [24, 0, 150, 4],
      },
      gradient: {
        solidBand: [5 / 8, 0.05, 0.95, 0.01],
        topOpacity: [1, 0, 1, 0.01],
        bottomOpacity: [0.85, 0, 1, 0.01],
        blur: [0, 0, 400, 5],
        noise: [0, 0, 0.5, 0.005],
      },
      copySettings: { type: 'action', label: 'Copy settings JSON' },
    },
    {
      onAction: (action) => {
        if (action === 'copySettings') void copyVisualSettingsToClipboard()
      },
    },
  )

  useEffect(() => {
    imageDials.planeWidth = params.size.imageSize
    imageDials.rotationZInitial = params.rotation.zSpread
    imageDials.rotationZRecycle = params.rotation.zSpread * 1.5
    imageDials.rotationXInitial = params.rotation.xSpread
    imageDials.rotationXRecycle = params.rotation.xSpread
    imageDials.rotationYInitial = params.rotation.ySpread
    imageDials.rotationYRecycle = params.rotation.ySpread
    focusDials.padTopPx = params.focusPadding.topGap
    focusDials.padBotPx = params.focusPadding.bottomGap
    gradientDials.solidBand = params.gradient.solidBand
    gradientDials.topOpacity = params.gradient.topOpacity
    gradientDials.bottomOpacity = params.gradient.bottomOpacity
    gradientDials.blur = params.gradient.blur
    gradientDials.noise = params.gradient.noise
  })

  return null
}
