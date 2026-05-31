# getglad.me

Personal site for Matthew Gladney. Static [Astro](https://astro.build) site,
deployed to GitHub Pages on the apex domain `getglad.me`.

## Develop

```sh
pnpm install
pnpm dev        # local dev server (localhost:4321)
pnpm build      # static build → dist/
pnpm preview    # serve the built site
pnpm check      # astro type-check
pnpm format     # prettier
```

`mise run dev|build|preview|check|format` also works (see `mise.toml`).

## Content

- **Blog** — `src/content/blog/*.md`. Set `legacy: true` to keep an original
  dated permalink `/YYYY/MM/DD/slug/`; new posts use `/writing/slug/`. URLs are
  derived in `src/utils/postUrl.ts`.
- **Talks** — `src/content/talks/`
- **Projects** — `src/content/projects/`
- **Patents / service / socials** — `src/data/`

Schemas for the collections live in `src/content.config.ts`.

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml` (build with
`withastro/action`, publish with GitHub Pages). The custom domain comes from
`public/CNAME`. In the repo: **Settings → Pages → Source = GitHub Actions**.
