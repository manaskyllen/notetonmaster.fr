/**
 * Validation of the banner form, shared by the admin form and its server action. Kept apart from
 * ./banner, which the public layout loads in the browser: zod stays out of the public bundle.
 */
import { z } from 'zod';
import { BANNER_MAX } from './banner';

const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date au format AAAA-MM-JJ.');

/** Form values (dates as « AAAA-MM-JJ », Paris days). */
export const bannerSchema = z
  .object({
    active: z.boolean(),
    tone: z.enum(['INFO', 'IMPORTANT', 'ALERT']),
    message: z
      .string()
      .trim()
      .min(1, 'Le message est requis.')
      .max(BANNER_MAX, `${BANNER_MAX} caractères au maximum.`)
      .refine((v) => !/[<>]/.test(v), 'Texte simple seulement, sans balise.'),
    linkLabel: z.string().trim().max(40, '40 caractères au maximum pour le lien.'),
    linkUrl: z.string().trim().max(300),
    startsAt: dateField,
    endsAt: dateField.or(z.literal('')),
    scope: z.enum(['ALL', 'HOME']),
    dismissible: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (!!v.linkLabel !== !!v.linkUrl)
      ctx.addIssue({
        code: 'custom',
        path: [v.linkLabel ? 'linkUrl' : 'linkLabel'],
        message: 'Le lien doit avoir un texte et une adresse, ou rester vide.',
      });
    if (
      v.linkUrl &&
      // An internal path: never « // » nor « /\ », which browsers read as another site.
      !/^\/(?![\/\\])[^\s\\]*$/.test(v.linkUrl) &&
      !/^https:\/\/[^\s/]+\.[^\s]+$/.test(v.linkUrl)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['linkUrl'],
        message: 'Adresse interne commençant par / ou adresse https://.',
      });
    if (v.endsAt && v.endsAt < v.startsAt)
      ctx.addIssue({
        code: 'custom',
        path: ['endsAt'],
        message: 'La date de fin doit suivre la date de début.',
      });
  });

export type BannerForm = z.infer<typeof bannerSchema>;
