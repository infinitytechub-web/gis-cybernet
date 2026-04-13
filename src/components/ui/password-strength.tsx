import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface PasswordStrengthProps {
  password: string;
}

function getStrength(password: string): number {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  return Math.min(score, 5);
}

const labels = ["", "Very Weak", "Weak", "Fair", "Strong", "Very Strong"];

export function PasswordStrength({ password }: PasswordStrengthProps) {
  const strength = useMemo(() => getStrength(password), [password]);

  if (!password) return null;

  // Gradient from orange (1) to green (5)
  const colors = [
    "",
    "bg-orange-500",
    "bg-orange-400",
    "bg-yellow-400",
    "bg-lime-400",
    "bg-green-500",
  ];

  const textColors = [
    "",
    "text-orange-500",
    "text-orange-400",
    "text-yellow-500",
    "text-lime-500",
    "text-green-500",
  ];

  return (
    <div className="space-y-1">
      <div className="flex gap-1 h-1.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={cn(
              "flex-1 rounded-full transition-all duration-300",
              i <= strength ? colors[strength] : "bg-muted"
            )}
          />
        ))}
      </div>
      <p className={cn("text-[11px] transition-colors", textColors[strength])}>
        {labels[strength]}
      </p>
    </div>
  );
}
