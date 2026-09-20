export interface FbChannelStatusResponse {
  connected: boolean
  pageName?: string
  pageId?: string
  connectedAt?: string
}

export interface FbAuthUrlResponse {
  url: string
}
