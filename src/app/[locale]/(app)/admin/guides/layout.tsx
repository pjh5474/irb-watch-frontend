import { DocgenGate } from "@/components/drafts/docgen-off";

export default function AdminGuidesLayout({ children }: { children: React.ReactNode }) {
  return <DocgenGate>{children}</DocgenGate>;
}
