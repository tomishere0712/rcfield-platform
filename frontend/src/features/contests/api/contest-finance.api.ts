import { api } from "@/shared/lib/axios"
import type {
  ContestFinanceReport,
  ContestLedgerDirection,
  ContestLedgerEntry,
} from "../types"

export const contestFinanceQueryKeys = {
  report: (contestId?: string) => ["contests", contestId, "finance"] as const,
  ledger: (contestId?: string) =>
    ["contests", contestId, "ledger-entries"] as const,
  myLedger: (contestId?: string) =>
    ["contests", contestId, "ledger-entries", "mine"] as const,
}

export type CreateLedgerEntryBody = {
  direction: ContestLedgerDirection
  category: string
  title: string
  amount: number
  occurred_at: string
  note?: string
  receipt_url?: string | null
}

export type UpdateLedgerEntryBody = Partial<
  Omit<CreateLedgerEntryBody, "direction">
>

export const contestFinanceApi = {
  /**
   * Báo cáo tài chính của một giải.
   *
   * Chỉ provider sở hữu giải gọi được — STAFF và ADMIN đều nhận 403. Giải chưa
   * có dữ liệu vẫn trả 200 với mọi số bằng 0, không phải 404.
   */
  getReport: async (contestId: string): Promise<ContestFinanceReport> => {
    const res = await api.get<{ success: boolean; data: ContestFinanceReport }>(
      `/v1/contests/${contestId}/finance`,
    )
    return res.data.data
  },

  listEntries: async (contestId: string): Promise<ContestLedgerEntry[]> => {
    const res = await api.get<{ success: boolean; data: ContestLedgerEntry[] }>(
      `/v1/contests/${contestId}/ledger-entries`,
    )
    return res.data.data
  },

  /** Danh sách của riêng nhân viên đang đăng nhập — không kèm số tổng nào. */
  listMyEntries: async (contestId: string): Promise<ContestLedgerEntry[]> => {
    const res = await api.get<{ success: boolean; data: ContestLedgerEntry[] }>(
      `/v1/contests/${contestId}/ledger-entries/mine`,
    )
    return res.data.data
  },

  createEntry: async (
    contestId: string,
    body: CreateLedgerEntryBody,
  ): Promise<ContestLedgerEntry> => {
    const res = await api.post<{ success: boolean; data: ContestLedgerEntry }>(
      `/v1/contests/${contestId}/ledger-entries`,
      body,
    )
    return res.data.data
  },

  updateEntry: async (
    entryId: string,
    body: UpdateLedgerEntryBody,
  ): Promise<ContestLedgerEntry> => {
    const res = await api.patch<{ success: boolean; data: ContestLedgerEntry }>(
      `/v1/contest-ledger-entries/${entryId}`,
      body,
    )
    return res.data.data
  },

  deleteEntry: async (entryId: string): Promise<void> => {
    await api.delete(`/v1/contest-ledger-entries/${entryId}`)
  },

  /** Upload ảnh chứng từ, trả URL để gắn vào `receipt_url` khi lưu bút toán. */
  uploadReceipt: async (contestId: string, file: File): Promise<string> => {
    const form = new FormData()
    form.append("file", file)
    const res = await api.post<{ success: boolean; data: { url: string } }>(
      `/v1/contests/${contestId}/ledger-entries/receipt`,
      form,
    )
    return res.data.data.url
  },
}
