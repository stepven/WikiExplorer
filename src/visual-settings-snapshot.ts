import { imageDials } from './image-dials'
import { focusDials } from './focus-dials'
import { gradientDials } from './gradient-dials'

/** Current Visual dial values (for sharing / pasting into chats). */
export function getVisualSettingsSnapshot() {
  return {
    size: { imageSize: imageDials.planeWidth },
    rotation: {
      zSpread: imageDials.rotationZInitial,
      xSpread: imageDials.rotationXInitial,
      ySpread: imageDials.rotationYInitial,
    },
    focusPadding: {
      topGap: focusDials.padTopPx,
      bottomGap: focusDials.padBotPx,
    },
    gradient: {
      solidBand: gradientDials.solidBand,
      topOpacity: gradientDials.topOpacity,
      bottomOpacity: gradientDials.bottomOpacity,
      blur: gradientDials.blur,
      noise: gradientDials.noise,
    },
  }
}

/** Flat dotted keys (easy to diff / paste). */
export function getVisualSettingsFlat() {
  const s = getVisualSettingsSnapshot()
  return {
    'size.imageSize': s.size.imageSize,
    'rotation.zSpread': s.rotation.zSpread,
    'rotation.xSpread': s.rotation.xSpread,
    'rotation.ySpread': s.rotation.ySpread,
    'focusPadding.topGap': s.focusPadding.topGap,
    'focusPadding.bottomGap': s.focusPadding.bottomGap,
    'gradient.solidBand': s.gradient.solidBand,
    'gradient.topOpacity': s.gradient.topOpacity,
    'gradient.bottomOpacity': s.gradient.bottomOpacity,
    'gradient.blur': s.gradient.blur,
    'gradient.noise': s.gradient.noise,
  }
}

export async function copyVisualSettingsToClipboard(): Promise<void> {
  const payload = {
    nested: getVisualSettingsSnapshot(),
    flat: getVisualSettingsFlat(),
  }
  const text = JSON.stringify(payload, null, 2)
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('aria-hidden', 'true')
    document.body.append(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
  }
}
