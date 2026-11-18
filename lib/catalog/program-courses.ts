/**
 * Courses and milestones of a programme in the database: the migration of the former semester
 * texts, the rewrite of a whole programme (university sites, admin) and the reclassification of
 * the courses when the keyword table changes. Shared by the worker, the seed and the bootstrap
 * (no `server-only`).
 */
import { prisma } from '@/lib/db';
import type { CourseCategory, MilestoneKind } from '@/lib/db/generated/enums';
import { classifyCourse, COURSE_CATEGORIES_VERSION } from '@/lib/domain/course-categories';
import { semesterIdentity, splitLegacySemester } from '@/lib/domain/program-outline';

export interface CourseInput {
  label: string;
  ects?: number | null;
  hours?: number | null;
  /** A category chosen by hand (admin): kept and locked. */
  category?: CourseCategory | null;
  categoryLocked?: boolean;
}

export interface MilestoneInput {
  kind: MilestoneKind;
  title: string;
  detail?: string | null;
  minMonths?: number | null;
  maxMonths?: number | null;
  pages?: number | null;
  period?: string | null;
}

export interface SemesterInput {
  label: string;
  title?: string | null;
  ects?: number | null;
  content?: string;
  courses: CourseInput[];
  milestones: MilestoneInput[];
}

/**
 * Replaces the programme of a parcours. Categories chosen by hand are kept when the same course
 * (same label in the same semester label) comes back from the source.
 */
export async function writeProgramme(
  programId: string,
  semesters: SemesterInput[],
  source: { document: string | null; year: string | null; course: string },
) {
  const program = await prisma.program.findUniqueOrThrow({
    where: { id: programId },
    select: { mention: { select: { name: true } } },
  });
  const previous = await prisma.programCourse.findMany({
    where: { semester: { programId }, categoryLocked: true },
    select: { label: true, category: true, semester: { select: { label: true } } },
  });
  const locked = new Map(previous.map((c) => [`${c.semester.label}|${c.label}`, c.category]));
  await prisma.$transaction(async (tx) => {
    await tx.programSemester.deleteMany({ where: { programId } });
    for (const [position, s] of semesters.entries()) {
      const id = semesterIdentity(s.label);
      const row = await tx.programSemester.create({
        data: {
          programId,
          position,
          label: s.label,
          title: s.title ?? null,
          content: s.content ?? '',
          year: id.year,
          number: id.number,
          ects: s.ects ?? 30,
          sourceDocument: source.document,
          sourceYear: source.year,
        },
      });
      await tx.programCourse.createMany({
        data: s.courses.map((c, order) => {
          const kept = locked.get(`${s.label}|${c.label}`);
          const manual = c.categoryLocked && c.category ? c.category : null;
          return {
            semesterId: row.id,
            label: c.label,
            ects: c.ects ?? null,
            hours: c.hours ?? null,
            category:
              manual ?? kept ?? classifyCourse(c.label, { mentionName: program.mention.name }),
            categoryLocked: !!(manual ?? kept),
            order,
            source: source.course,
          };
        }),
      });
      await tx.programMilestone.createMany({
        data: s.milestones.map((m, order) => ({
          semesterId: row.id,
          kind: m.kind,
          title: m.title,
          detail: m.detail ?? null,
          minMonths: m.minMonths ?? null,
          maxMonths: m.maxMonths ?? null,
          pages: m.pages ?? null,
          period: m.period ?? null,
          source: source.course,
          order,
        })),
      });
    }
  });
}

/**
 * Migration: the free text of each semester that has no course and no milestone yet is split
 * into courses (commas, semicolons, « · ») and milestones (stage, mémoire). The text stays on the
 * semester (`content`) as provenance, and each course says it comes from it. Idempotent.
 */
export async function convertLegacySemesters(opts: { programIds?: string[] } = {}) {
  const semesters = await prisma.programSemester.findMany({
    where: {
      ...(opts.programIds ? { programId: { in: opts.programIds } } : {}),
      courses: { none: {} },
      milestones: { none: {} },
    },
    select: {
      id: true,
      label: true,
      content: true,
      year: true,
      program: { select: { mention: { select: { name: true } } } },
    },
  });
  let courses = 0;
  let milestones = 0;
  for (const s of semesters) {
    const id = semesterIdentity(s.label);
    const split = splitLegacySemester(s.content);
    const source = 'Migration du texte du semestre';
    await prisma.$transaction([
      prisma.programSemester.update({
        where: { id: s.id },
        data: { year: s.year ?? id.year, number: id.number },
      }),
      prisma.programCourse.createMany({
        data: split.courses.map((c, order) => ({
          semesterId: s.id,
          label: c.label,
          ects: c.ects,
          hours: c.hours,
          category: classifyCourse(c.label, { mentionName: s.program.mention.name }),
          order,
          source,
        })),
      }),
      prisma.programMilestone.createMany({
        data: split.milestones.map((m, order) => ({
          semesterId: s.id,
          kind: m.kind,
          title: m.title,
          detail: m.detail,
          minMonths: m.minMonths,
          maxMonths: m.maxMonths,
          pages: m.pages,
          period: m.period,
          source,
          order,
        })),
      }),
    ]);
    courses += split.courses.length;
    milestones += split.milestones.length;
  }
  return { semesters: semesters.length, courses, milestones };
}

const VERSION_KEY = 'programme.categoriesVersion';

/**
 * When the keyword table changed (COURSE_CATEGORIES_VERSION), the courses whose category was not
 * chosen by hand are classified again. Returns the number of courses that changed category.
 */
export async function reclassifyCourses(force = false): Promise<number> {
  const stored = await prisma.setting.findUnique({ where: { key: VERSION_KEY } });
  if (!force && stored?.value === COURSE_CATEGORIES_VERSION) return 0;
  const rows = await prisma.programCourse.findMany({
    where: { categoryLocked: false },
    select: {
      id: true,
      label: true,
      category: true,
      semester: { select: { program: { select: { mention: { select: { name: true } } } } } },
    },
  });
  let changed = 0;
  for (const r of rows) {
    const c = classifyCourse(r.label, { mentionName: r.semester.program.mention.name });
    if (c === r.category) continue;
    await prisma.programCourse.update({ where: { id: r.id }, data: { category: c } });
    changed++;
  }
  await prisma.setting.upsert({
    where: { key: VERSION_KEY },
    create: { key: VERSION_KEY, value: COURSE_CATEGORIES_VERSION },
    update: { value: COURSE_CATEGORIES_VERSION },
  });
  return changed;
}
