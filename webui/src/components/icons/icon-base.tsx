import type { IconSvgElement } from "@hugeicons/react"
import { HugeiconsIcon } from "@hugeicons/react"
import type { LucideIcon } from "lucide-react"
import type { ComponentType } from "react"
import type { AppIconComponent, AppIconProps } from "./types"

/**
 * Wraps a Hugeicons glyph with the app's shared icon prop contract.
 */
export const createHugeIcon = (icon: IconSvgElement): AppIconComponent => {
  const HugeIcon = ({ size, strokeWidth = 2, ...props }: AppIconProps) => (
    <HugeiconsIcon
      icon={icon}
      size={size}
      strokeWidth={strokeWidth}
      {...props}
    />
  )

  return HugeIcon
}


/**
 * Wraps a Lucide component with the app's shared icon prop contract.
 */
export const createLucideIcon = (icon: LucideIcon): AppIconComponent => {
  const LucideWrappedIcon = ({ size, strokeWidth = 2, ...props }: AppIconProps) => (
    icon({
      size,
      strokeWidth,
      ...props,
    })
  )

  return LucideWrappedIcon
}


/**
 * Wraps third-party React icon components behind the shared app icon props.
 */
export const createReactIcon = (
  icon: ComponentType<{ size?: number | string; color?: string; className?: string }>
): AppIconComponent => {
  const ReactWrappedIcon = ({ size, color, className }: AppIconProps) => {
    const Icon = icon

    return (
      <Icon
        size={size}
        color={color}
        className={className}
      />
    )
  }

  return ReactWrappedIcon
}
