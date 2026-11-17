/** Re-mounted on every navigation, so each page fades in instead of snapping into place. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-fade-up">{children}</div>;
}
