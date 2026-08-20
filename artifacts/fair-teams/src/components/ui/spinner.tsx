import { Loader2Icon } from "lucide-react"

import { cn } from "@/lib/utils"
import { useStripesTranslation } from "@/i18n"

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  const { t } = useStripesTranslation()
  return (
    <Loader2Icon
      role="status"
      aria-label={t("ui.loading")}
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  )
}

export { Spinner }
