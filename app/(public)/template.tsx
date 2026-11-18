/**
 * Remounted on every navigation (unlike a layout): the page content fades in over 120ms.
 * Stands for the View Transitions fade between pages, which React only exposes as experimental.
 */
export default function PublicTemplate({ children }: { children: React.ReactNode }) {
  return <div className="nm-page-fade flex flex-1 flex-col">{children}</div>;
}
