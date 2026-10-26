import { buildSpecMarkdown } from "@/lib/spec";

export const dynamic = "force-dynamic";

export async function GET() {
  return new Response(buildSpecMarkdown(), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": 'attachment; filename="ETF_App_Data_Sources_and_Agent_Spec.md"',
    },
  });
}
