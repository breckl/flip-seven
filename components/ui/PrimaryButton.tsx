"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";

export type PrimaryButtonVariant = "primary" | "secondary";

export type PrimaryButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** primary: green fill, white bold text. secondary: transparent, green border, green bold text. */
  variant?: PrimaryButtonVariant;
};

/**
 * Brand action buttons. Uses static Tailwind classes so the green is included in the CSS bundle.
 * (`bg-[rgb(${var})]` is not detected by Tailwind’s scanner.)
 */
function variantClasses(variant: PrimaryButtonVariant, disabled: boolean): string {
  if (disabled) {
    if (variant === "secondary") {
      return "border-2 border-[#C0C0C0] bg-transparent font-bold text-[#ADADAD]";
    }
    return "border-2 border-transparent bg-[#C0C0C0] font-medium text-stone-700";
  }
  if (variant === "secondary") {
    return "border-2 border-[rgb(89_197_143)] bg-transparent font-bold text-[rgb(89_197_143)]";
  }
  return "border-2 border-transparent bg-[rgb(89_197_143)] font-bold text-white hover:brightness-[0.97]";
}

export const PrimaryButton = forwardRef<HTMLButtonElement, PrimaryButtonProps>(
  function PrimaryButton(
    { className = "", disabled, variant = "primary", type = "button", ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled}
        className={`rounded-xl px-4 py-3 transition-[filter,background-color,color,border-color] disabled:cursor-not-allowed ${variantClasses(variant, !!disabled)} ${className}`}
        {...props}
      />
    );
  },
);
