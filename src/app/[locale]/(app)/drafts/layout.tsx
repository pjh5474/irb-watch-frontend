import { DocgenGate } from "@/components/drafts/docgen-off";

export default function DraftsLayout({ children }: { children: React.ReactNode }) {
  return <DocgenGate>{children}</DocgenGate>;
}
