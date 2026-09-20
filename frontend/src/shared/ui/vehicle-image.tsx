import { useState } from "react"
import { Car } from "lucide-react"
import { cn, sanitizeImageUrl } from "@/shared/lib/utils"

type VehicleImageProps = {
  imageUrl?: string | null
  alt: string
  className?: string
  fallbackClassName?: string
  iconClassName?: string
}

/**
 * Displays a vehicle image from either a full URL or an uploaded relative path.
 * A vehicle icon is shown only when the unit and its catalog have no usable image.
 */
export function VehicleImage({
  imageUrl,
  alt,
  className,
  fallbackClassName,
  iconClassName,
}: VehicleImageProps) {
  const resolvedImageUrl = sanitizeImageUrl(imageUrl)

  return (
    <VehicleImageContent
      key={resolvedImageUrl ?? "vehicle-image-fallback"}
      resolvedImageUrl={resolvedImageUrl}
      alt={alt}
      className={className}
      fallbackClassName={fallbackClassName}
      iconClassName={iconClassName}
    />
  )
}

type VehicleImageContentProps = Omit<VehicleImageProps, "imageUrl"> & {
  resolvedImageUrl: string | null
}

function VehicleImageContent({
  resolvedImageUrl,
  alt,
  className,
  fallbackClassName,
  iconClassName,
}: VehicleImageContentProps) {
  const [imageUnavailable, setImageUnavailable] = useState(false)

  if (!resolvedImageUrl || imageUnavailable) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={cn(
          "flex h-full w-full items-center justify-center bg-orange-50 text-orange-600",
          fallbackClassName,
        )}
      >
        <Car className={cn("h-6 w-6", iconClassName)} />
      </div>
    )
  }

  return (
    <img
      src={resolvedImageUrl}
      alt={alt}
      className={className}
      onError={() => setImageUnavailable(true)}
    />
  )
}
