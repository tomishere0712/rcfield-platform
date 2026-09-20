import { PlayCircle } from "lucide-react"
import { useNavigate } from "react-router"

import {
  Panel,
  PanelTitle,
} from "@/pages/provider/components/ProviderPrimitives"
import { getContestWorkspacePath } from "@/pages/provider/contest-runtime/contest-workspace"
import { Button } from "@/shared/ui/button"

export function ContestRuntimePanel({ contestId }: { contestId: string }) {
  const navigate = useNavigate()

  return (
    <Panel>
      <PanelTitle
        title="Vận hành giải đấu"
        subtitle="Màn này chỉ giữ phần cấu hình. Mọi thao tác tiếp nhận, check-in, xếp nhánh và nhập kết quả nằm ở khu vận hành riêng."
      />
      <div className="rounded-lg border border-dashed border-[#c4c7c8] bg-[#fcf8f8] p-6">
        <p className="text-sm font-semibold text-[#5d5f5f]">
          Sau khi lưu cấu hình, hãy chuyển sang màn vận hành để tiếp
          nhận người chơi, check-in, tạo nhánh đấu và nhập kết quả.
        </p>
        <Button
          type="button"
          className="mt-4 h-10 gap-2 rounded-lg bg-[#1c1b1b] text-white hover:bg-[#313030]"
          onClick={() =>
            navigate(getContestWorkspacePath(contestId, "overview"))
          }
        >
          <PlayCircle className="size-4" />
          Mở màn vận hành
        </Button>
      </div>
    </Panel>
  )
}
