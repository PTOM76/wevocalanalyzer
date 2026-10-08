import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/roboto/400.css'
import '@fontsource/roboto/500.css'
import { AddonsContext, PevenProvider, preventPageZoom } from 'pevenmui'
import App from './App'
import { app } from './appConfig'
import { addonsContext } from './addons'

preventPageZoom()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PevenProvider desktopLook app={app}>
      <AddonsContext.Provider value={addonsContext}>
        <App />
      </AddonsContext.Provider>
    </PevenProvider>
  </StrictMode>,
)
