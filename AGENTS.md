# Paperdesk project boundaries

- Paperdesk is an independent application in its own repository: `shellcat-com/paperdesk`.
- Keep its local checkout in `/Users/biswaskhatiwada/Developer/paperdesk`.
- Do not modify, copy into, link into, merge with, or deploy through the user's portfolio repository or portfolio directory when working on Paperdesk.
- GitHub Pages is the only deployment target: `https://shellcat-com.github.io/paperdesk/`.
- Do not create or reconnect a Vercel project for this application.
- Preserve the `/paperdesk/` production base path for scripts, fonts, the PDF worker, and PDF support assets.
- Run `npm run verify` before publishing application changes. Keep imports, exports, and the documented format limits accurate.
