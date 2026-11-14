import { DocgenGate } from "@/components/drafts/docgen-off";

export default function AdminTemplatesLayout({ children }: { children: React.ReactNode }) {
  return <DocgenGate>{children}</DocgenGate>;
}
