import { useReducedMotion, type Variants } from "framer-motion"

/**
 * Đường cong "emphasized decelerate" — vào nhanh, dừng mềm.
 * Dùng chung cho mọi hiệu ứng xuất hiện của nội dung để nhịp chuyển động
 * giữa các trang giống nhau.
 */
export const emphasizedEase: [number, number, number, number] = [0.22, 1, 0.36, 1]

/** Độ trễ giữa hai khối liên tiếp khi xuất hiện so le. */
export const STAGGER_STEP = 0.06

/**
 * Biến thể xuất hiện cho thẻ / khối nội dung. Nhận `custom` là chỉ số để so le.
 * Đang được dùng ở danh sách cơ sở (trang Khám phá) và các mục ở trang chi tiết.
 */
export const cardVariants: Variants = {
  hidden: { opacity: 0, y: 24, scale: 0.97 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      delay: i * STAGGER_STEP,
      duration: 0.4,
      ease: emphasizedEase,
    },
  }),
  exit: { opacity: 0, y: -12, scale: 0.97, transition: { duration: 0.2 } },
}

/**
 * Biến thể xuất hiện có tôn trọng `prefers-reduced-motion`.
 *
 * Khi người dùng bật giảm chuyển động ở hệ điều hành, chỉ làm mờ dần và bỏ hẳn
 * phần trượt + phóng to — vẫn giữ được cảm giác nội dung tải dần mà không gây
 * khó chịu cho người nhạy cảm với chuyển động.
 */
export function useSectionEntrance(): Variants {
  const prefersReducedMotion = useReducedMotion()

  if (prefersReducedMotion) {
    return {
      hidden: { opacity: 0 },
      visible: (i: number) => ({
        opacity: 1,
        transition: { delay: i * 0.03, duration: 0.2 },
      }),
    }
  }

  return cardVariants
}
