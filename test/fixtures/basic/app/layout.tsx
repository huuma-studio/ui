import type { PageLikeProps } from "@huuma/ui/server";

export default function Layout({ children }: PageLikeProps) {
  return <main>{children}</main>;
}
