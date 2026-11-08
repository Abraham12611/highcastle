import { redirect } from "next/navigation";

/** /integrations lands on the only integration with real content so far. */
export default async function IntegrationsIndexPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  redirect(`/app/w/${workspaceSlug}/integrations/github`);
}
