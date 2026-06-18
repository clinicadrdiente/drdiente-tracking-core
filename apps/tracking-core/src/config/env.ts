export function getEnv(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}
