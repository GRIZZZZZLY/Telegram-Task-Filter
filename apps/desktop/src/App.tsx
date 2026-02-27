import { useState } from 'react'
import { useTheme } from '@/hooks/useTheme'
import { AppShell } from '@/components/layout/AppShell'
import { SetupWizard } from '@/components/setup/SetupWizard'

const SETUP_KEY = 'tgff_setup_complete'

export default function App() {
  useTheme() // инициализация темы из localStorage

  const [setupDone, setSetupDone] = useState(
    () => localStorage.getItem(SETUP_KEY) === '1',
  )

  if (!setupDone) {
    return <SetupWizard onComplete={() => setSetupDone(true)} />
  }

  return <AppShell />
}
