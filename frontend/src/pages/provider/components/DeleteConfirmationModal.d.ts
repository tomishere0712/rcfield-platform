export type DeleteConfirmationOfferData = {
  title?: string
  message?: string | JSX.Element
  confirmLabel?: string
  code: string
  status?: string
  statusClassName?: string
  description?: string
  details?: string
  items?: Array<{
    id?: string
    code: string
    status?: string
    statusClassName?: string
    description?: string
    details?: string
  }>
}

export function DeleteConfirmationModal(props: {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  offerData: DeleteConfirmationOfferData | null
}): JSX.Element | null
