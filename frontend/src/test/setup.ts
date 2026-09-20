import "@testing-library/jest-dom/vitest"
import { installZodVietnameseLocale } from "@/shared/lib/zod-locale"

// Cùng cấu hình với `main.tsx`, để test đọc đúng câu thông báo mà người dùng
// thật sự nhìn thấy.
installZodVietnameseLocale()
