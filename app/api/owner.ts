import { getChatGPTUser } from "@/app/chatgpt-auth";

export async function resolveOwnerEmail(request: Request) {
  const user = await getChatGPTUser();
  if (user) return user.email.trim().toLowerCase();

  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1"
    ? "local@quantscope.invalid"
    : null;
}
