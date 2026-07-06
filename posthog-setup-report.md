# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into this portfolio site. PostHog is loaded via the official CDN snippet in `index.html` (EU host, `identified_only` person profiles, autocapture disabled). Event capture calls were added to `portfolio.js` for all meaningful user actions — link clicks and theme toggling. Environment variables are stored in `.env`.

| Event name | Description | File |
|---|---|---|
| `cv_downloaded` | User clicks the CV/PDF link — primary conversion signal | `portfolio.js` |
| `email_link_clicked` | User clicks the email link in the contact section | `portfolio.js` |
| `linkedin_link_clicked` | User clicks the LinkedIn profile link in the contact section | `portfolio.js` |
| `company_link_clicked` | User clicks a past employer link (Nex, Zapier, Alfa Bank, EPAM) — includes `company` and `url` properties | `portfolio.js` |
| `theme_toggled` | User switches between light and dark mode — includes `theme` property | `portfolio.js` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard — Analytics basics:** https://eu.posthog.com/project/164542/dashboard/637924
- **CV downloads over time:** https://eu.posthog.com/project/164542/insights/C3SqND5U
- **Contact link clicks over time:** https://eu.posthog.com/project/164542/insights/jEaSnSAG
- **All link clicks — total comparison:** https://eu.posthog.com/project/164542/insights/QA77zfRq
- **Company link clicks by company:** https://eu.posthog.com/project/164542/insights/NxHYghwW
- **Theme preference: light vs dark:** https://eu.posthog.com/project/164542/insights/WWQfhwhe

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.
