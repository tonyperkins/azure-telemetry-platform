---
description: How to fix the browser subagent in WSL environments when it fails with ECONNREFUSED
---

# WSL Browser Subagent Fix

When running the platform within Windows Subsystem for Linux (WSL), the internal `browser_subagent` may fail to connect to its Chromium instance on CDP port 9222, resulting in an `ECONNREFUSED` error. This happens because WSL sometimes struggles with the standard headless background process initialization or lacks necessary shared libraries.

To resolve this issue and restore `browser_subagent` functionality in your current session, execute the following fix workflow:

## 1. Install Dependencies
Ensure Playwright has the correct dependencies installed inside WSL. Use the absolute path to your project's node binary if available.

```bash
// turbo
sudo npx playwright install --with-deps chromium
```

## 2. Start the Headless Browser Manually
You need to manually spin up the Chrome instance in the background, bound to port 9222 so the `browser_subagent` can connect to it natively.

```bash
// turbo
~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome --headless --remote-debugging-port=9222 --no-sandbox --disable-gpu about:blank &
```

## 3. Verify Connection
Ensure the CDP port is responding to requests.

```bash
// turbo
curl -s http://127.0.0.1:9222/json/version
```

If the verification returns JSON containing the Chrome version, the `browser_subagent` will now work successfully for the remainder of this session.
