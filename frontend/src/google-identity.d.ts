export {}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string
            callback: (response: GoogleCredentialResponse) => void
          }) => void
          renderButton: (
            parent: HTMLElement,
            options: {
              theme?: "outline" | "filled_blue" | "filled_black"
              size?: "large" | "medium" | "small"
              type?: "standard" | "icon"
              shape?: "rectangular" | "pill" | "circle" | "square"
              text?: "signin_with" | "signup_with" | "continue_with" | "signin"
              logo_alignment?: "left" | "center"
              width?: number
            },
          ) => void
          prompt: () => void
        }
      }
    }
  }

  type GoogleCredentialResponse = {
    credential?: string
    select_by?: string
  }
}
