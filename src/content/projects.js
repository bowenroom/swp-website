// The Projects page renders from this file and nothing else. Adding a project
// means appending one object here; the page needs no other edit.
//
// `projects` is intentionally empty this round. The user confirmed the split —
// the page ships as a finished structure now, the repositories themselves get
// written later — so an empty array is a real state, not an unfinished one, and
// ProjectGrid.astro renders a designed empty state for it.
//
// Field contract, enforced by projectsFor() below so a half-filled entry fails
// the build instead of rendering a card with an empty name:
//   name        string  the repository name, language-neutral (e.g. 'swp-kit')
//   description string | { zh, en }  one-line summary; the pair form is how a
//                                     project gets a real translation rather
//                                     than the same sentence twice
//   language    string  the repository's primary language (e.g. 'Python')
//   url         string  external link to the repository
//   cover       string? optional artwork path (e.g. '/projects/x.jpg')
//   year        string? optional, shown as a quiet meta value

export const projects = [];

// Resolves a project to one language's view of itself and throws on anything
// malformed. The page imports this rather than reading `projects` directly, so
// a missing url or an unresolvable description is a build error naming the
// repository — not a card that renders with a blank heading and a dead link.
const text = (value, lang) => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') return value[lang];
  return undefined;
};

export const projectsFor = (lang) =>
  projects.map((project, index) => {
    const id = project?.name || 'project #' + index;
    const description = text(project?.description, lang);

    if (!project?.name) throw new Error('project #' + index + ' has no name');
    if (!description) throw new Error('project "' + id + '" has no ' + lang + ' description');
    if (!project.language) throw new Error('project "' + id + '" has no language');
    if (!project.url) throw new Error('project "' + id + '" has no url');

    return {
      name: project.name,
      description,
      language: project.language,
      url: project.url,
      cover: project.cover,
      year: project.year,
    };
  });
