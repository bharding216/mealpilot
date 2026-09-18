# MealPilot API — Render Deployment

## Service Type: Docker

Render should be configured as a **Docker** service (not a native Node service),
because the API uses Playwright (headless Chromium) for the H-E-B login flow.

### Render Settings

| Setting | Value |
|---------|-------|
| **Environment** | Docker |
| **Dockerfile Path** | `./Dockerfile` |
| **Docker Context** | `.` (repo root) |
| **Instance Type** | Standard (min 512 MB RAM recommended for Chromium) |

### Environment Variables

Set these in Render's dashboard under Environment:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
OPENAI_API_KEY=sk-...
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
```

### Notes

- The Dockerfile uses a multi-stage build:
  1. **Build stage**: Compiles TypeScript using `node:20-slim`
  2. **Production stage**: Uses `mcr.microsoft.com/playwright` which includes
     Chromium + all required system libraries
- Playwright's headless browser is only used during H-E-B login (triggered by the user).
  Normal API requests (meal planning, grocery lists) don't use the browser.
- The Playwright browser image adds ~400 MB to the container but is required for
  the H-E-B authentication flow.
