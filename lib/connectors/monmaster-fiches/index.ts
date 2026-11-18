/**
 * monmaster-fiches: the detailed pages of the Mon Master candidate site are forbidden by
 * robots.txt (`Disallow: /`). This connector never collects anything: it only checks the
 * robots.txt every week and stays SKIP. The internal API of the candidate site
 * (monmaster.gouv.fr/api/candidat/…) is not an authorised source and is never called.
 */
import { PoliteHttpClient, crawlerUserAgent } from '@/lib/data/http';
import { PrismaHostStore } from '@/lib/data/host-store';
import { isAllowed } from '@/lib/data/robots';
import { upsertAlert } from '@/lib/data/pipeline';
import { emptyStats, type SourceConnector } from '../types';

/** Pages we would read if robots.txt allowed it (a formation page). Never fetched while forbidden. */
const PROBE_PATH = '/formation/';

export function makeConnector(http?: PoliteHttpClient): SourceConnector {
  return {
    key: 'monmaster-fiches',
    async run(ctx) {
      const client =
        http ??
        new PoliteHttpClient({
          userAgent: crawlerUserAgent(),
          allowedDomains: ['monmaster.gouv.fr'],
          store: new PrismaHostStore(),
          onEvent: async (e) => {
            if (e.type === 'robots-changed') {
              await ctx.log('WARN', 'robots.txt de monmaster.gouv.fr modifié');
              await upsertAlert('monmaster-fiches', {
                key: `robots-changed:monmaster.gouv.fr:${new Date().toISOString().slice(0, 10)}`,
                code: 'robots-changed',
                severity: 'WARNING',
                title: 'robots.txt de Mon Master modifié',
                detail:
                  'Le robots.txt de monmaster.gouv.fr a changé. Relire les règles avant toute décision : la source reste désactivée.',
                link: '/admin/recuperation',
                linkLabel: 'Voir',
              });
            }
          },
        });
      await ctx.report({ progress: 30, step: 'Lecture du robots.txt' });
      // www.monmaster.gouv.fr redirects to monmaster.gouv.fr: read the final host's robots.txt.
      const robots = await client.robotsFor(new URL('https://monmaster.gouv.fr/'));
      const verdict = isAllowed(robots, client.userAgent, PROBE_PATH);
      await ctx.report({ progress: 100, step: 'Terminé' });
      if (!verdict.allowed) {
        await ctx.log(
          'SKIP',
          `robots.txt : ${verdict.rule ? `Disallow ${verdict.rule.pattern}` : 'collecte interdite'} · rien n’est collecté`,
        );
        return {
          status: 'SKIPPED',
          stats: emptyStats(),
          summary: 'robots.txt vérifié : collecte interdite, source en SKIP',
        };
      }
      await ctx.log(
        'WARN',
        'robots.txt autorise désormais les pages de formation : rien n’est collecté sans décision humaine',
      );
      await upsertAlert('monmaster-fiches', {
        key: 'monmaster-fiches-robots-open',
        code: 'robots-changed',
        severity: 'INFO',
        title: 'Mon Master : le robots.txt n’interdit plus les fiches',
        detail:
          'Les fiches détaillées semblent autorisées. La source reste désactivée tant qu’un humain n’a pas relu les conditions.',
        link: '/admin/recuperation',
        linkLabel: 'Voir',
      });
      return {
        status: 'SKIPPED',
        stats: emptyStats(),
        summary: 'robots.txt modifié : à relire, source toujours en SKIP',
      };
    },
  };
}

export const connector = makeConnector();
