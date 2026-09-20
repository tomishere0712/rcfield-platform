export interface ApiResponse<TData> {
  data: TData;
  message?: string;
  success: boolean;
}
