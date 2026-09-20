import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Loader2,
  ShieldCheck,
} from "lucide-react"
import { toast } from "sonner"

import {
  bankPaymentApi,
  bankPaymentQueryKeys,
} from "@/features/payments/api/bank-payment.api"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { cn } from "@/shared/lib/utils"

/**
 * Cấu hình tài khoản nhận tiền của một chi nhánh.
 *
 * Điểm quan trọng nhất của màn này không phải cái form, mà là **bước quét thử
 * mã QR mẫu**. Hệ thống không có cách nào biết số tài khoản chủ quán nhập vào
 * có thật là của họ hay không — gõ sai một chữ số là tiền của mọi khách chảy
 * vào tài khoản người lạ, và chỉ bị phát hiện khi có người khiếu nại.
 *
 * Vì thế cấu hình chưa xác minh thì chi nhánh vẫn dùng cổng thanh toán chung.
 */

export function CafePaymentSettingsCard({ cafeId }: { cafeId: string }) {
  const queryClient = useQueryClient()
  const [bankCode, setBankCode] = useState("")
  const [accountNumber, setAccountNumber] = useState("")
  const [accountName, setAccountName] = useState("")
  const [syncedKey, setSyncedKey] = useState<string | null>(null)

  const { data: settings, isLoading } = useQuery({
    queryKey: bankPaymentQueryKeys.settingsEdit(cafeId),
    queryFn: () => bankPaymentApi.getSettingsForEdit(cafeId),
    enabled: Boolean(cafeId),
  })

  // Bảng tra tĩnh phía backend, cả phiên chỉ cần tải một lần.
  const { data: banks = [], isLoading: loadingBanks } = useQuery({
    queryKey: bankPaymentQueryKeys.banks(),
    queryFn: bankPaymentApi.listBanks,
    staleTime: Infinity,
  })

  // Đồng bộ form với dữ liệu vừa tải về NGAY TRONG RENDER thay vì trong effect.
  // Đây là cách React khuyến nghị cho state suy ra từ props/dữ liệu: React sẽ
  // render lại ngay lập tức mà không vẽ ra màn hình lần thừa, còn làm trong
  // effect thì khách thấy form trống một nhịp rồi mới nhảy sang dữ liệu thật.
  const settingsKey = settings
    ? `${settings.bank_code ?? ""}|${settings.account_number ?? ""}|${settings.account_name ?? ""}`
    : null

  if (settingsKey !== null && settingsKey !== syncedKey) {
    setSyncedKey(settingsKey)
    setBankCode(settings?.bank_code ?? "")
    setAccountNumber(settings?.account_number ?? "")
    setAccountName(settings?.account_name ?? "")
  }

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: bankPaymentQueryKeys.settingsEdit(cafeId),
    })
    void queryClient.invalidateQueries({
      queryKey: bankPaymentQueryKeys.methods(cafeId),
    })
    // Bắt buộc: mã QR giờ luôn hiện cạnh form. Không làm mới thì đổi số tài
    // khoản rồi lưu xong, màn hình vẫn bày mã của tài khoản CŨ — chủ quán quét
    // thấy đúng tên mình rồi bấm xác nhận, trong khi thứ vừa lưu lại là số
    // khác. Trước đây lỗi này bị che vì lưu xong panel tự đóng.
    void queryClient.invalidateQueries({
      queryKey: bankPaymentQueryKeys.sampleQr(cafeId),
    })
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      bankPaymentApi.updateSettings(cafeId, {
        method: "BANK_TRANSFER",
        bank_code: bankCode,
        account_number: accountNumber.trim(),
        account_name: accountName.trim().toUpperCase(),
      }),
    onSuccess: () => {
      invalidate()
      toast.success("Đã lưu. Quét mã QR bên cạnh để xác nhận đúng tài khoản.")
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err.response?.data?.message ?? "Không lưu được cấu hình"),
  })

  const disableMutation = useMutation({
    mutationFn: () =>
      bankPaymentApi.updateSettings(cafeId, { method: "VNPAY" }),
    onSuccess: () => {
      invalidate()
      toast.success("Đã chuyển về cổng thanh toán chung")
    },
  })

  const { data: sampleQr, isFetching: loadingQr } = useQuery({
    queryKey: bankPaymentQueryKeys.sampleQr(cafeId),
    queryFn: () => bankPaymentApi.getSampleQr(cafeId),
    // Chỉ gọi khi chi nhánh đã khai xong tài khoản: chưa khai thì endpoint trả
    // 400 `BANK_DETAILS_REQUIRED`, gọi vào chỉ để nhận lỗi.
    enabled: settings?.method === "BANK_TRANSFER",
  })

  const verifyMutation = useMutation({
    mutationFn: () => bankPaymentApi.verifySettings(cafeId),
    onSuccess: () => {
      invalidate()
      toast.success("Chi nhánh đã bật nhận chuyển khoản")
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err.response?.data?.message ?? "Không xác minh được"),
  })

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-white p-6">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const isBankTransfer = settings?.method === "BANK_TRANSFER"
  const isVerified = Boolean(settings?.is_verified)
  const canSave =
    bankCode !== "" &&
    accountNumber.trim().length >= 4 &&
    accountName.trim().length >= 2

  return (
    <div className="rounded-xl border border-border bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 text-base font-black">
            <Building2 className="size-4 text-muted-foreground" />
            Nhận thanh toán
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Khách chuyển khoản thẳng vào tài khoản của bạn, đơn tự xác nhận khi
            tiền về.
          </p>
        </div>

        {isBankTransfer && (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold",
              isVerified
                ? "bg-emerald-50 text-emerald-700"
                : "bg-amber-50 text-amber-800",
            )}
          >
            {isVerified ? (
              <>
                <ShieldCheck className="size-3.5" />
                Đang hoạt động
              </>
            ) : (
              <>
                <AlertTriangle className="size-3.5" />
                Chưa xác minh
              </>
            )}
          </span>
        )}
      </div>

      {/*
        Hai cột: form bên trái, mã QR bên phải, luôn hiện cùng lúc.

        Trước đây mã nằm dưới cùng và phải bấm mới hiện, nên việc đối chiếu là
        cuộn xuống — nhớ — cuộn lên. Đặt cạnh nhau thì số vừa gõ và số trên mã
        nằm chung một khung nhìn, sai một chữ số là thấy ngay.
      */}
      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          {!isVerified && (
            <p className="mb-4 rounded-lg bg-[#f6f4f4] px-3 py-2.5 text-sm text-[#5d5f5f]">
              Chưa xác minh thì chi nhánh vẫn nhận tiền qua cổng thanh toán
              chung như hiện tại. Không có gì gián đoạn.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-muted-foreground">
                Ngân hàng
              </span>
              <select
                value={bankCode}
                disabled={loadingBanks}
                onChange={(event) => setBankCode(event.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm font-semibold disabled:opacity-60"
              >
                <option value="">
                  {loadingBanks ? "Đang tải danh sách…" : "Chọn ngân hàng"}
                </option>
                {banks.map((bank) => (
                  <option key={bank.code} value={bank.code}>
                    {bank.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-muted-foreground">
                Số tài khoản
              </span>
              <Input
                className="h-10"
                inputMode="numeric"
                value={accountNumber}
                placeholder="0123456789"
                onChange={(event) =>
                  setAccountNumber(event.target.value.replace(/\D/g, ""))
                }
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-xs font-bold text-muted-foreground">
                Tên chủ tài khoản
              </span>
              <Input
                className="h-10 uppercase"
                value={accountName}
                placeholder="NGUYEN VAN A"
                onChange={(event) => setAccountName(event.target.value)}
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                Viết không dấu, đúng như trên sao kê ngân hàng.
              </span>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              className="h-10"
              disabled={!canSave || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending && (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              )}
              Lưu tài khoản
            </Button>

            {isBankTransfer && (
              <Button
                type="button"
                variant="ghost"
                className="h-10 text-muted-foreground"
                onClick={() => disableMutation.mutate()}
              >
                Dùng cổng chung
              </Button>
            )}
          </div>
        </div>

        <div>
          {/*
            Đã xác minh rồi thì đây không còn là bước kiểm tra nữa — nó chỉ là
            chỗ xem lại mã. Giữ nguyên khung chữ "kiểm tra trước khi bật" kèm
            nút xác nhận trong khi chi nhánh đang chạy sẽ khiến chủ quán tưởng
            mình còn thiếu một bước, rồi đi bấm lại cái đã xong.
          */}
          <h4 className="text-sm font-black">
            {isVerified ? "Kiểm tra lại tài khoản" : "Kiểm tra trước khi bật"}
          </h4>
          <p className="mt-1 text-sm text-muted-foreground">
            Quét bằng <strong>app ngân hàng</strong>, không phải camera thường —
            camera chỉ hiện ra một dãy ký tự.
          </p>
          {isVerified && (
            <p className="mt-1 text-xs text-muted-foreground">
              Đây là mã thử. Mã của từng đơn mang số tiền và mã tham chiếu
              riêng.
            </p>
          )}

          {loadingQr && (
            <Loader2 className="mt-4 size-5 animate-spin text-muted-foreground" />
          )}

          {sampleQr && (
            <>
              {/*
                Khối này cố tình trông như một thẻ thanh toán chứ không như một
                ô ảnh trong form: chủ quán sắp giao cho hệ thống quyền nhận tiền
                thật của khách, và cầm điện thoại lên soi từng chữ số là việc
                người ta chỉ chịu làm nghiêm túc khi thứ trước mặt trông nghiêm
                túc.

                Logo VietQR để trong `public/brand/` chứ không nhúng thẳng từ
                trang ngoài: đường dẫn của người ta đổi hay hỏng lúc nào không
                ai báo, và luồng thanh toán thì không được phụ thuộc một máy
                chủ mình không kiểm soát (D9).
              */}
              <div className="mx-auto mt-5 w-full max-w-[300px] rounded-xl border border-border bg-white p-5 text-center">
                <img
                  src="/brand/vietqr-logo.png"
                  alt="VietQR"
                  width={831}
                  height={311}
                  className="mx-auto h-9 w-auto"
                />

                {/*
                  Không đệm thêm quanh mã: ảnh QR đã mang sẵn vùng trắng 4
                  module theo chuẩn, đệm nữa thành hai lớp trắng chồng nhau và
                  mã trông bé lọt thỏm giữa một ô trống.
                */}
                {/*
                  Viền lấy đúng màu navy `#1e427e` của chữ "QR" trong logo
                  VietQR. Có `p-1.5` để viền không áp sát mã: ảnh QR mang sẵn
                  vùng trắng 4 module, viền đè lên mép vùng đó thì máy quét mất
                  chỗ bấu để nhận ra ranh giới của mã.
                */}
                <div className="relative mx-auto mt-3 w-fit rounded-xl border-2 border-[#1e427e] p-1.5">
                  <img
                    src={sampleQr.qr_image_data_url}
                    alt={`Mã QR chuyển khoản tới ${sampleQr.account_name}`}
                    className="block size-56"
                  />

                  {/*
                    Chữ V giữa mã, đúng cách VietQR vẫn trình bày. Ô này che
                    3,9% diện tích mã, trong khi mức sửa lỗi M đang dùng phục
                    hồi được tới 15% — nên không cần nâng mức sửa lỗi, mà nâng
                    còn phản tác dụng: mã sẽ dày lên và mỗi ô nhỏ đi, khó quét
                    hơn chứ không an toàn hơn.
                  */}
                  <span className="absolute left-1/2 top-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-lg bg-white">
                    <img
                      src="/brand/vietqr-mark.png"
                      alt=""
                      aria-hidden
                      width={223}
                      height={223}
                      className="size-7"
                    />
                  </span>
                </div>

                <dl className="mt-3 space-y-0.5 text-xs leading-relaxed text-[#5d5f5f]">
                  <div>
                    <dt className="inline">Tên chủ TK: </dt>
                    <dd className="inline font-bold text-[#1a1618]">
                      {sampleQr.account_name}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline">Số TK: </dt>
                    <dd className="inline font-bold tabular-nums text-[#1a1618]">
                      {sampleQr.account_number}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline">Ngân hàng: </dt>
                    <dd className="inline">{sampleQr.bank_name}</dd>
                  </div>
                </dl>

                <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
                  {sampleQr.amount.toLocaleString("vi-VN")}đ · {sampleQr.memo}
                </p>
              </div>

              {!isVerified && (
                <>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Ngân hàng và số tài khoản phải trùng khít. Tên chủ tài khoản
                    thì app lấy từ hồ sơ ngân hàng nên có thể khác cách viết —
                    miễn đúng là bạn. Ra tên người lạ thì đừng bấm xác nhận.
                  </p>

                  <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                    Đây là mã ngân hàng thật. Bạn có thể quét thử mà không cần
                    chuyển tiền — chỉ cần xem tên người nhận hiện ra.
                  </p>

                  <Button
                    type="button"
                    className="mt-4 h-10 w-full gap-2"
                    disabled={verifyMutation.isPending}
                    onClick={() => verifyMutation.mutate()}
                  >
                    {verifyMutation.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="size-4" />
                    )}
                    Tôi đã quét và xác nhận đúng tài khoản
                  </Button>
                </>
              )}
            </>
          )}

          {/*
            Chưa khai xong tài khoản thì chưa có mã để dựng. Để trống hẳn sẽ
            làm cột phải hụt một mảng, nên bày đúng chỗ mã sắp xuất hiện.
          */}
          {!isBankTransfer && !loadingQr && (
            <div className="mt-4 rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              Khai đủ tài khoản rồi bấm <strong>Lưu tài khoản</strong> — mã QR
              để kiểm tra sẽ hiện ở đây.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
