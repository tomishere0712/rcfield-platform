import { QueryProvider } from "./QueryProvider"

export type AppProviderProps = {
  children: React.ReactNode
}

export function AppProvider({ children }: AppProviderProps) {
  return <QueryProvider>{children}</QueryProvider>
}
