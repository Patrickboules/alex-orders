# Alex Orders

Group food ordering for ~50 people: admins upload a restaurant menu, open a group order, people join with name + phone and pick items, and each person gets a receipt (cash or InstaPay). Spec: [tasks/prd-group-ordering.md](tasks/prd-group-ordering.md).

Next.js 16 · MongoDB Atlas · NVIDIA API (in-site menu parsing) · MCP (Claude menu parsing).

## Local setup

```sh
npm install
cp .env.example .env      # fill in the values
npm run db:init           # create indexes
npm run seed:admin -- --name "Name" --phone 01XXXXXXXXX --password "at-least-8-chars"   # up to 4 admins
npm run dev               # http://localhost:3000, admin at /admin
npm test
```

## Environment

| Variable | Notes |
|---|---|
| `MONGODB_URI` | Atlas connection string, with the database name, e.g. `…mongodb.net/alex-orders?…` |
| `NVIDIA_API_KEY`, `NVIDIA_MODEL` | For the website's Photos/PDF/Link upload. Optional `NVIDIA_REASONING_EFFORT`, `NVIDIA_TIMEOUT_MS`. |
| `INSTAPAY_QR_URL`, `INSTAPAY_HANDLE` | Shown on receipts. Put the QR image in `public/` (e.g. `/instapay-qr.png`). |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob for uploaded files. Required on Vercel; locally files go to `public/uploads/`. |
| `MCP_SECRET` | ≥ 24 chars (`openssl rand -hex 24`). Enables the remote MCP endpoint. |
| `APP_URL` | Public site URL, used in review links returned by the MCP tools. |

## Adding menus with Claude (MCP)

Claude reads menu photos far more accurately than the NVIDIA models, so the recommended way to add a menu is to send the photos to Claude and let it save them through the MCP tools: `list_restaurants`, `create_restaurant`, `get_menu`, `save_menu_draft`, `publish_menu`. Menus are saved as drafts; review them at `/admin/restaurants/<id>` before publishing. Publishing is refused while any item has no price.

**From claude.ai or the Claude mobile app (deployed site):** Settings → Connectors → Add custom connector, URL:

```
https://<your-site>/api/mcp/<MCP_SECRET>
```

Then in a chat: attach the menu photos and say e.g. "Add this menu to fala7". Anyone with this URL can edit menus, so share it only with admins; rotate `MCP_SECRET` to revoke it.

**From Claude Code in this repo:** `.mcp.json` registers the local stdio server (`scripts/mcp.sh`), which talks to the same database via `.env`. To use the deployed endpoint instead: `claude mcp add --transport http alex-orders https://<your-site>/api/mcp/<MCP_SECRET>`.

## Deploying (Vercel)

1. Import the repo in Vercel.
2. Storage → Create Blob store → connect it to the project (adds `BLOB_READ_WRITE_TOKEN`).
3. Add the other environment variables above (`APP_URL` = the production URL).
4. In Atlas → Network Access, allow `0.0.0.0/0` (Vercel IPs change).
5. Deploy, then add the MCP connector in claude.ai with the production URL.
