export function GET() {
  return Response.json({
    ready: true,
    role: "application",
    version: 1,
  });
}
