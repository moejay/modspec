---
name: Repos
description: Repo onboarding, config parsing, CRUD
group: data
tags: [crud, api]
depends_on:
  - name: persistence
    uses: [data-storage, query-interface]
  - server-api
features: features/repos/
---

# Repos

Depends on persistence and server-api.
