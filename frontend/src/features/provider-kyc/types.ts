export type KycBusinessType = 'INDIVIDUAL' | 'BUSINESS'

export type KycDocumentType =
  | 'CCCD_FRONT'
  | 'CCCD_BACK'
  | 'GPKD'
  | 'REPRESENTATIVE_ID'
  | 'VENUE_PHOTO'

export interface KycDocumentItem {
  documentType: KycDocumentType
  cloudinaryUrl?: string
  originalFilename: string | null
}

export interface KycStatusResponse {
  providerStatus: string
  businessType: KycBusinessType | null
  rejectionReason: string | null
  kycSubmittedAt: string | null
  documents: Array<{
    documentType: KycDocumentType
    originalFilename: string | null
  }>
}

export const DOCUMENT_TYPE_LABELS: Record<KycDocumentType, string> = {
  CCCD_FRONT: 'CCCD mặt trước',
  CCCD_BACK: 'CCCD mặt sau',
  GPKD: 'Giấy phép kinh doanh',
  REPRESENTATIVE_ID: 'CCCD người đại diện',
  VENUE_PHOTO: 'Ảnh mặt bằng',
}
