# dunkadunka.se

Minimal README for the dunkadunka.se repository.

## Overview
A small web project (static site or web app). This repo contains source, assets and deployment configuration for dunkadunka.se.

## Contents
- README.md — this file
- response/ — supporting content (this README is located here)
- src/ — application source (if present)
- public/ — static assets (if present)

## Development
- Follow standard Git flow on `main`.
- Add feature branches and open PRs against `main`.
- Run linters and tests locally before pushing.

## Deployment
- Static hosts (Netlify, Vercel, GitHub Pages) or a simple Docker image work well.
- CI should build and deploy on merge to `main`.

## Ideas
- Add angular measurement support with measurement object.
    - Each measurement object should have an N-dimensionality, including information such as angle.
- Button icon does not really work.
- Save measurements as CSB
- Revamp homepage with responsive hero and clear call-to-action
- Add a blog section with MDX support for richer posts
- Implement CI: build, lint, test, and deploy preview environments
- Add unit and end-to-end tests (Jest + Playwright)
- Improve accessibility and run automated A11y checks
- Add analytics and a privacy-first consent banner
- Provide a lightweight Dockerfile and GitHub Actions workflow
- Create a small API for dynamic content or a Headless CMS integration


<!-- Update this README with project-specific commands and structure as files are added. -->