export function normalizePath(path: string): string {
  const clean = path.trim().split('?')[0].split('#')[0]
  if (clean === '' || clean === '/') {
    return '/overview'
  }
  return clean
}
