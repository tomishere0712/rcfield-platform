/** Nhịp hỏi lại khi còn tài liệu đang xử lý, tính bằng mili giây. */
export const KB_POLL_INTERVAL_MS = 5000

/**
 * Có nên hỏi lại danh sách tài liệu tri thức nữa không.
 *
 * Tài liệu được xử lý ở phía sau — tách đoạn, sinh vector, ghi vào kho — nên
 * ngay sau khi tải lên nó còn ở `PENDING`. Không hỏi lại thì màn hình đứng
 * nguyên ở "Đang xử lý" cho tới khi người dùng tự tải lại trang.
 *
 * Dừng hẳn khi không còn gì đang xử lý: hỏi mãi là mỗi tab đang mở đều gửi một
 * lời gọi mỗi 5 giây, suốt cả ngày, cho một danh sách chẳng bao giờ đổi nữa.
 *
 * Dùng chung cho cả màn hình của admin lẫn của chủ sân. Hai bản chép rời sớm
 * muộn cũng lệch, và bản bị bỏ quên chính là bản treo ở "Đang xử lý".
 */
export function kbRefetchInterval(
  docs: ReadonlyArray<{ status: string }> | undefined,
): number | false {
  return docs?.some((doc) => doc.status === "PENDING") ? KB_POLL_INTERVAL_MS : false
}
