import { useState } from 'react'
import { useTheme } from '@/hooks/useTheme'
import { AppShell } from '@/components/layout/AppShell'
import { SetupWizard } from '@/components/setup/SetupWizard'
import { PinScreen } from '@/components/auth/PinScreen'
import { usePinGuard } from '@/hooks/usePinGuard'

const SETUP_KEY = 'tgff_setup_complete'

export default function App() {
  useTheme()

  const [setupDone, setSetupDone] = useState(
    () => localStorage.getItem(SETUP_KEY) === '1',
  )

  const { state: pinState, pinSet, unlock, skipSetup, recheckPin } = usePinGuard()

  if (!setupDone) {
    return <SetupWizard onComplete={() => setSetupDone(true)} />
  }

  if (pinState === 'loading') return null

  if (pinState === 'needs-setup') {
    return (
      <PinScreen
        mode="setup"
        onUnlocked={unlock}
        onSkipSetup={skipSetup}
      />
    )
  }

  if (pinState === 'locked') {
    return <PinScreen mode="unlock" onUnlocked={unlock} />
  }

  return <AppShell pinSet={pinSet} onPinChanged={recheckPin} />
}
