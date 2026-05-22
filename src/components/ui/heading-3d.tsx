import * as React from "react";
import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg" | "xl";
type Level = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

export interface Heading3DProps extends React.HTMLAttributes<HTMLHeadingElement> {
  as?: Level;
  size?: Size;
  bar?: boolean;
}

const sizeClass: Record<Size, string> = {
  sm: "heading-3d-sm",
  md: "heading-3d-md",
  lg: "heading-3d-lg",
  xl: "heading-3d-xl",
};

/**
 * Reusable 3D heading. Use for all page titles, module headers and
 * settings sections so the visual language stays consistent.
 *
 *   <Heading3D as="h1" size="xl">Attendance</Heading3D>
 *   <Heading3D as="h2" size="lg" bar>Schedules</Heading3D>
 */
export const Heading3D = React.forwardRef<HTMLHeadingElement, Heading3DProps>(
  ({ as = "h2", size = "lg", bar = false, className, ...props }, ref) => {
    const Tag = as as React.ElementType;
    return (
      <Tag
        ref={ref}
        className={cn("heading-3d", sizeClass[size], bar && "heading-3d-bar", className)}
        {...props}
      />
    );
  },
);
Heading3D.displayName = "Heading3D";

export default Heading3D;
