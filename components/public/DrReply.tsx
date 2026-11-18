/**
 * « Réponse de l'équipe pédagogique » under a review (.dr-reply): dark block,
 * verified domain and date. It never replaces nor changes the review above it.
 */
export function DrReply({ body, domain, date }: { body: string; domain: string; date: string }) {
  return (
    <div className="dr-reply flex flex-col gap-2 rounded-[18px] bg-night px-4.5 py-4 text-on-night">
      <div className="flex flex-wrap items-center gap-2">
        <span
          aria-hidden="true"
          className="flex size-8 items-center justify-center rounded-[10px] bg-lime-400 text-on-lime"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 10l9-6 9 6M5 10v9M19 10v9M9.5 10v9M14.5 10v9M3 20h18" />
          </svg>
        </span>
        <span className="flex flex-col gap-px">
          <span className="text-[14px] font-bold">Réponse de l’équipe pédagogique</span>
          <span className="text-[12px] text-on-night-muted">
            Responsable du parcours · vérifié·e <span className="whitespace-nowrap">@{domain}</span>
          </span>
        </span>
        <span className="ml-auto text-[12px] text-on-night-muted">{date}</span>
      </div>
      <p className="m-0 text-[14px] leading-[1.55] whitespace-pre-line [overflow-wrap:anywhere] text-[#e7e3f0]">
        {body}
      </p>
    </div>
  );
}
