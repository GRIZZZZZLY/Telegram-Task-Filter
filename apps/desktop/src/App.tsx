import { useTheme } from '@/hooks/useTheme'
import { useHighContrast } from '@/hooks/useHighContrast'
import { AppShell } from '@/components/layout/AppShell'
import { PinScreen } from '@/components/auth/PinScreen'
import { usePinGuard } from '@/hooks/usePinGuard'

export default function App() {
  useTheme()
  // Applied here, not in Settings, so the class is on the root element for
  // every screen including the PIN gate.
  useHighContrast()

  const { state: pinState, pinSet, unlock, skipSetup, recheckPin } = usePinGuard()

  if (pinState === 'loading') return null

  if (pinState === 'needs-setup') {
    return <PinScreen mode="setup" onUnlocked={unlock} onSkipSetup={skipSetup} />
  }

  if (pinState === 'locked') {
    return <PinScreen mode="unlock" onUnlocked={unlock} />
  }

  // Telegram login is not a separate gate any more: AppShell asks the backend
  // whether Telegram is connected and shows TelegramAuthScreen when it is not.
  return <AppShell pinSet={pinSet} onPinChanged={recheckPin} />
}
