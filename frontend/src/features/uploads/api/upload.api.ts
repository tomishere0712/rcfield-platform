import { api } from "@/shared/lib/axios"

type UploadImageResponse = {
  success: boolean
  data: {
    publicId: string
    url: string
  }
}

export async function uploadImage(file: File, usage = "general") {
  const formData = new FormData()
  formData.append("file", file)
  formData.append("usage", usage)

  const response = await api.post<UploadImageResponse>("/v1/uploads/images", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  })

  return response.data.data
}
