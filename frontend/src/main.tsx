import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import App from './App'
import './index.css'

const qc = new QueryClient({
  defaultOptions: {
    queries: { retry: (n, e: any) => n < 1 && !(e?.status >= 400 && e?.status < 500), refetchOnWindowFocus: false, staleTime: 15_000 },
  },
})

// erb.iamarx.com.br: só o MARX Mapas ERB, público, sem login e sem o restante da plataforma
const ErbPage = lazy(() => import('./pages/ErbApp'))
const erbHost = /^erb\./i.test(location.hostname)

createRoot(document.getElementById('root')!).render(
  erbHost ? (
    <StrictMode>
      <Suspense fallback={null}>
        <ErbPage />
      </Suspense>
      <Toaster theme="light" position="top-center" richColors />
    </StrictMode>
  ) : (
    <StrictMode>
      <QueryClientProvider client={qc}>
        <BrowserRouter>
          <App />
          <Toaster
            theme="dark"
            position="top-right"
            toastOptions={{
              classNames: {
                toast: '!bg-panel-2 !border-line-2 !text-text !rounded-[10px] !text-[13px]',
                description: '!text-muted',
                success: '[&_[data-icon]]:!text-ok',
                error: '[&_[data-icon]]:!text-danger',
                warning: '[&_[data-icon]]:!text-amber',
                info: '[&_[data-icon]]:!text-accent',
              },
            }}
          />
        </BrowserRouter>
      </QueryClientProvider>
    </StrictMode>
  ),
)
