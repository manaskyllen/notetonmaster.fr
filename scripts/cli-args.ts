/** `--name value` or `--name=value` from the command line, or null. */
export function argValue(name: string, argv = process.argv.slice(2)): string | null {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === `--${name}`) return argv[i + 1] ?? null;
    if (a.startsWith(`--${name}=`)) return a.slice(name.length + 3);
  }
  return null;
}
