import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider } from "react-router"
import { AppProvider } from "@/app/providers/AppProvider"
import { router } from "@/app/router/routes"
import { installZodVietnameseLocale } from "@/shared/lib/zod-locale"
import "@/styles/globals.css"

// Phải chạy trước khi render, vì schema có thể được parse ngay ở lần render đầu.
installZodVietnameseLocale()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProvider>
      <RouterProvider router={router} />
    </AppProvider>
  </StrictMode>,
)
