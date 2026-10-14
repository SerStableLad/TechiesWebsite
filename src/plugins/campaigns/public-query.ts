import { pluginId } from "./model";

export async function campaignQuery<T>(locals: App.Locals, url: URL, route: string, params: Record<string, string> = {}): Promise<T> {
	const requestUrl = new URL(`/_emdash/api/plugins/${pluginId}/${route}`, url);
	for (const [key, value] of Object.entries(params)) requestUrl.searchParams.set(key, value);
	const result = await locals.emdash.handlePublicPluginApiRoute(pluginId, "GET", route, new Request(requestUrl));
	const data = result.data as T & { ok?: boolean; error?: string };
	if (!result.success || !data?.ok) throw new Error(data?.error ?? "Could not load campaigns.");
	return data;
}
